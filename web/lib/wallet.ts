import * as ftx from "@forshtat/hegota-support/tx";
import {
  bytesToHex,
  decodeErrorResult,
  decodeEventLog,
  encodeFunctionData,
  hexToBytes,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DemoTokenAbi, LifeboatAccountAbi, LifeboatFactoryAbi, MigrationSponsorAbi } from "../../src/abi.js";
import { balanceOf, call, devnet, faucet, nonceOf, profile, sendLegacy, waitReceipt } from "../../src/frame/devnet.js";
import { buildTx, calldata, readState, send, signTx, type Mode } from "../../src/frame/lifeboat.js";
import { buildMigrationTx } from "../../src/frame/migrate.js";
import { Journal } from "../../src/pq/journal.js";
import type { KeyPair } from "../../src/pq/xmss.js";
import { deployment, KEY_TREE_HEIGHT } from "./deployment.js";
import { saveWallet, type WalletState } from "./store.js";

export class RejectedError extends Error {
  constructor(message: string, public reason: string | null) {
    super(message);
  }
}

/** Turn a revert from one of our contracts into `Contract.Error(args)`. */
export function decodeRevert(data: Hex): string | null {
  for (const [name, abi] of [["LifeboatAccount", LifeboatAccountAbi], ["MigrationSponsor", MigrationSponsorAbi]] as const) {
    try {
      const e = decodeErrorResult({ abi: abi as Abi, data });
      return `${name}.${e.errorName}(${(e.args ?? []).map(String).join(", ")})`;
    } catch {}
  }
  return null;
}

/** Plain words for the errors a person can run into. */
export const REASON_TEXT: Record<string, string> = {
  "LifeboatAccount.BadPqSignature()": "The quantum-safe signature is missing or wrong, so the account refused to spend.",
  "LifeboatAccount.BadOwnerSignature()": "The account is in hybrid mode and the ECDSA signature is not the owner's.",
  "MigrationSponsor.NotExposed()": "The sponsor only pays for accounts whose key is exposed, and this one has never sent a transaction.",
  "MigrationSponsor.AlreadySponsored()": "The sponsor already paid for this account's migration once.",
  "MigrationSponsor.NotALifeboat()": "The sponsor only pays when the funds go into a genuine Lifeboat account.",
};

async function submit(t: ftx.FrameTx): Promise<{ hash: Hex; block: bigint }> {
  let hash: Hex;
  try {
    hash = await send(t);
  } catch (e) {
    const msg = (e as Error).message;
    const data = msg.match(/reverted with data (0x[0-9a-fA-F]+)/)?.[1] as Hex | undefined;
    throw new RejectedError(msg, data ? decodeRevert(data) : null);
  }
  const r = await waitReceipt(hash);
  if (r.status !== "0x1") throw new Error(`transaction ${hash} failed onchain`);
  return { hash, block: BigInt(r.blockNumber) };
}

const tokenBalance = async (who: Address) =>
  BigInt(await call("eth_call", [{ to: deployment.token, data: encodeFunctionData({ abi: DemoTokenAbi as Abi, functionName: "balanceOf", args: [who] }) }, "latest"]));

export interface Snapshot {
  exposed: { address: Address; nonce: bigint; eth: bigint; dusd: bigint };
  lifeboat?: { address: Address; eth: bigint; dusd: bigint; mode: Mode; nonce: bigint; nonceBase: bigint };
  keysUsed: number;
}

export class Wallet {
  constructor(public state: WalletState, private kp: KeyPair | null = null) {}

  get exposedAddress(): Address {
    return privateKeyToAccount(this.state.exposedKey).address;
  }

  setKeys(kp: KeyPair) {
    this.kp = kp;
  }

  get keys(): KeyPair | null {
    return this.kp;
  }

  private persist(kind: string, hash?: Hex, note?: string) {
    this.state.activity.unshift({ kind, hash, at: Date.now(), note });
    saveWallet(this.state);
  }

  async snapshot(): Promise<Snapshot> {
    const a = this.exposedAddress;
    const [nonce, eth, dusd] = await Promise.all([nonceOf(a), balanceOf(a), tokenBalance(a)]);
    const snap: Snapshot = { exposed: { address: a, nonce, eth, dusd }, keysUsed: Object.keys(this.state.journal).length };
    if (this.state.lifeboat) {
      const lb = this.state.lifeboat;
      const [st, leth, ldusd] = await Promise.all([readState(lb), balanceOf(lb), tokenBalance(lb)]);
      snap.lifeboat = { address: lb, eth: leth, dusd: ldusd, ...st };
    }
    return snap;
  }

  // ---------------------------------------------------------------- the demo's exposed account

  /** Devnet faucet: 1 ETH, once an hour per address. */
  async fund() {
    const h = await faucet(this.exposedAddress);
    this.persist("Funded from the devnet faucet", h);
  }

  /** One ordinary transaction (publishes the public key) and 2,400 test dUSD to move later. */
  async expose() {
    const k = this.state.exposedKey;
    const h1 = await sendLegacy(k, { to: deployment.recipient, value: 1_000_000_000n, gas: 210_000n });
    await waitReceipt(h1);
    this.persist("Sent an ordinary transaction (key now public)", h1);
    const h2 = await sendLegacy(k, {
      to: deployment.token,
      data: encodeFunctionData({ abi: DemoTokenAbi as Abi, functionName: "mint", args: [this.exposedAddress, 2_400_000_000n] }),
      gas: 300_000n,
    });
    await waitReceipt(h2);
    this.persist("Received 2,400.00 test dUSD", h2);
  }

  // ---------------------------------------------------------------- moving aboard

  /** Create the Lifeboat account for these quantum-safe keys. Paid by the exposed account today. */
  async createLifeboat(): Promise<Address> {
    if (this.state.lifeboat) return this.state.lifeboat;
    const kp = this.requireKeys();
    const h = await sendLegacy(this.state.exposedKey, {
      to: deployment.factory,
      data: encodeFunctionData({
        abi: LifeboatFactoryAbi as Abi,
        functionName: "create",
        args: [this.exposedAddress, bytesToHex(kp.pub.pubSeed), bytesToHex(kp.pub.root), BigInt(KEY_TREE_HEIGHT)],
      }),
      gas: devnet.deployGasLimit,
    });
    const r = await waitReceipt(h);
    if (r.status !== "0x1") throw new Error("creating the Lifeboat account failed");
    for (const log of r.logs) {
      try {
        const ev = decodeEventLog({ abi: LifeboatFactoryAbi as Abi, data: log.data, topics: log.topics }) as any;
        if (ev.eventName === "Created") this.state.lifeboat = ev.args.account;
      } catch {}
    }
    if (!this.state.lifeboat) throw new Error("factory did not report the new account");
    this.persist("Created the Lifeboat account", h);
    return this.state.lifeboat;
  }

  /** One sponsored, atomic transaction: everything the exposed account holds moves aboard. */
  async migrate(): Promise<Hex> {
    const lifeboat = await this.createLifeboat();
    const a = this.exposedAddress;
    const [eth, dusd, nonce] = await Promise.all([balanceOf(a), tokenBalance(a), nonceOf(a)]);
    const t = buildMigrationTx({
      exposed: a,
      lifeboat,
      sponsor: deployment.sponsor,
      nonce,
      eth,
      tokens: dusd > 0n ? [{ token: deployment.token, amount: dusd }] : [],
    });
    const signed = await ftx.signTx(profile, t, this.state.exposedKey, 0);
    const { hash, block } = await submit(signed);
    this.state.migration = { hash, block: block.toString() };
    this.persist("Moved everything aboard (gas paid by the sponsor)", hash);
    return hash;
  }

  // ---------------------------------------------------------------- living aboard

  private requireKeys(): KeyPair {
    if (!this.kp) throw new Error("quantum-safe keys are not ready yet");
    return this.kp;
  }

  private async spend(senderData: Hex, kind: string): Promise<{ hash: Hex; leaf: number }> {
    const lb = this.state.lifeboat;
    if (!lb) throw new Error("no Lifeboat account yet");
    const st = await readState(lb);
    const journal = Journal.fromJSON(this.state.journal);
    const t = buildTx({ account: lb, owner: this.exposedAddress, nonce: st.nonce, mode: st.mode, senderData });
    const { tx, leaf } = await signTx(t, { mode: st.mode, ecdsaKey: this.state.exposedKey, kp: this.requireKeys(), journal, nonceBase: st.nonceBase });
    this.state.journal = journal.toJSON();
    saveWallet(this.state); // journal first, broadcast second
    const { hash } = await submit(tx);
    this.persist(kind, hash, `one-time key ${leaf}`);
    return { hash, leaf };
  }

  send(to: Address, wei: bigint) {
    return this.spend(calldata.execute(to, wei), "Sent from the Lifeboat account");
  }

  enablePqOnly() {
    return this.spend(calldata.enablePqOnly(), "Switched to quantum-safe only");
  }

  /**
   * What an attacker with the old ECDSA private key can do: sign the ECDSA part perfectly and
   * fill the quantum-safe slot with a correctly sized forgery. Always rejected.
   */
  async attack(): Promise<RejectedError> {
    const lb = this.state.lifeboat;
    if (!lb) throw new Error("no Lifeboat account yet");
    const st = await readState(lb);
    const t = buildTx({ account: lb, owner: this.exposedAddress, nonce: st.nonce, mode: st.mode, senderData: calldata.execute(deployment.recipient, await balanceOf(lb)) });
    let forged = st.mode === "HYBRID" ? await ftx.signTx(profile, t, this.state.exposedKey, 0) : t;
    const pqIndex = st.mode === "HYBRID" ? 1 : 0;
    const junk = bytesToHex(crypto.getRandomValues(new Uint8Array(8 + 128 * 32 + KEY_TREE_HEIGHT * 32)));
    forged = { ...forged, signatures: forged.signatures.map((e, i) => (i === pqIndex ? { ...e, signature: junk } : e)) };
    try {
      const { hash } = await submit(forged);
      throw new Error(`attack was admitted (${hash}); this should never happen`);
    } catch (e) {
      if (e instanceof RejectedError) {
        this.persist("Attack with the stolen ECDSA key: rejected", undefined, e.reason ?? undefined);
        return e;
      }
      throw e;
    }
  }
}

export { hexToBytes };
