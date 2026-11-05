import * as ftx from "@forshtat/hegota-support/tx";
import {
  bytesToHex,
  decodeErrorResult,
  encodeFunctionData,
  hexToBytes,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DemoTokenAbi, LifeboatAccountAbi, LifeboatFactoryAbi, MigrationSponsorAbi } from "../../src/abi.js";
import { balanceOf, call, devnet, faucet, nonceOf, profile, sendLegacy, waitReceipt } from "../../src/frame/devnet.js";
import { buildTx, calldata, readState, send, signTx, waitFrameTx, type Mode } from "../../src/frame/lifeboat.js";
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
  "LifeboatAccount.WrongOneTimeKey": "The signature used a one-time key that isn't this transaction's key, so the account refused it.",
  "MigrationSponsor.NotExposed()": "The sponsor only pays for accounts whose key is exposed, and this one has never sent a transaction.",
  "MigrationSponsor.AlreadySponsored()": "The sponsor already paid for this account's migration once.",
  "MigrationSponsor.NotALifeboat()": "The sponsor only pays when the funds go into a genuine Lifeboat account.",
};

/** Plain words for a decoded revert, matching on the error's name when it carries arguments. */
export const reasonText = (r: string) => REASON_TEXT[r] ?? REASON_TEXT[r.split("(")[0]!] ?? r;

async function submit(t: ftx.FrameTx): Promise<{ hash: Hex; block: bigint }> {
  let hash: Hex;
  try {
    hash = await send(t);
  } catch (e) {
    const msg = (e as Error).message;
    const data = msg.match(/reverted with data (0x[0-9a-fA-F]+)/)?.[1] as Hex | undefined;
    throw new RejectedError(msg, data ? decodeRevert(data) : null);
  }
  const r = await waitFrameTx(t, hash);
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

  /** The address the factory will create this wallet's Lifeboat account at (CREATE2). */
  async predictLifeboat(): Promise<Address> {
    const kp = this.requireKeys();
    const out = (await call("eth_call", [
      {
        to: deployment.factory,
        data: encodeFunctionData({
          abi: LifeboatFactoryAbi as Abi,
          functionName: "predict",
          args: [this.exposedAddress, bytesToHex(kp.pub.pubSeed), bytesToHex(kp.pub.root), BigInt(KEY_TREE_HEIGHT)],
        }),
      },
      "latest",
    ])) as Hex;
    return `0x${out.slice(26)}` as Address;
  }

  /** One sponsored, atomic transaction: everything the exposed account holds moves aboard. */
  /** Build and sign this wallet's migration exactly as migrate() would send it. */
  private async signedMigration(): Promise<{ tx: ftx.FrameTx; lifeboat: Address; exists: boolean }> {
    const kp = this.requireKeys();
    const lifeboat = await this.predictLifeboat();
    const exists = (await call("eth_getCode", [lifeboat, "latest"])) !== "0x";
    const a = this.exposedAddress;
    const [eth, dusd, nonce] = await Promise.all([balanceOf(a), tokenBalance(a), nonceOf(a)]);
    const t = buildMigrationTx({
      exposed: a,
      lifeboat,
      sponsor: deployment.sponsor,
      nonce,
      eth,
      tokens: dusd > 0n ? [{ token: deployment.token, amount: dusd }] : [],
      // A new account is created inside the same sponsored transaction: nothing to pay up front.
      create: exists ? undefined : { factory: deployment.factory, pubSeed: bytesToHex(kp.pub.pubSeed), root: bytesToHex(kp.pub.root), height: BigInt(KEY_TREE_HEIGHT) },
    });
    return { tx: await ftx.signTx(profile, t, this.state.exposedKey, 0), lifeboat, exists };
  }

  /**
   * Send the very same signed migration to Ethereum's ordinary (canonical) mempool. It rejects
   * it, because the sponsor reads another contract's storage during validation; a rejection
   * changes nothing onchain, so the real move can follow through the alt mempool.
   */
  async tryPublicMempool(): Promise<{ accepted: boolean; message: string }> {
    const { tx } = await this.signedMigration();
    try {
      const h = await call("eth_sendRawTransaction", [ftx.encodeTx(profile, tx)]);
      return { accepted: true, message: `accepted as ${h}` };
    } catch (e) {
      const msg = (e as Error).message;
      return { accepted: false, message: msg.includes("StorageReadNonSender") ? "StorageReadNonSender" : msg };
    }
  }

  async migrate(): Promise<Hex> {
    const { tx: signed, lifeboat, exists } = await this.signedMigration();
    this.state.lifeboat = lifeboat;
    saveWallet(this.state);
    const { hash, block } = await submit(signed);
    this.state.migration = { hash, block: block.toString() };
    this.persist(exists ? "Moved everything aboard (gas paid by the sponsor)" : "Created the account and moved everything aboard (all gas paid by the sponsor)", hash);
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
   * Move to a fresh tree of one-time keys. The rotation itself is signed with the current tree;
   * once it lands, the new seed and an empty journal replace the old ones (old keys are spent).
   */
  async rotate(next: { seed: Hex; kp: KeyPair }) {
    const { hash } = await this.spend(
      calldata.rotateKeys(bytesToHex(next.kp.pub.pubSeed), bytesToHex(next.kp.pub.root), BigInt(next.kp.pub.height)),
      "Rotated to a fresh key tree",
    );
    this.state.seed = next.seed;
    this.state.journal = {};
    this.kp = next.kp;
    saveWallet(this.state);
    return hash;
  }

  /** The newest transaction this account sent itself (its signatures are public onchain). */
  lastOwnSpend(): Hex | null {
    return this.state.activity.find((a) => a.hash && (a.kind.startsWith("Sent from") || a.kind.startsWith("Switched")))?.hash ?? null;
  }

  /**
   * Replay: copy the quantum-safe signature out of one of the account's own past transactions
   * (anyone can read it onchain) and attach it to a new transaction that drains the account.
   * The signature covers that old transaction's hash only, so it fails.
   */
  async attackReplay(): Promise<RejectedError> {
    const lb = this.state.lifeboat;
    const old = this.lastOwnSpend();
    if (!lb || !old) throw new Error("send one transaction from the Lifeboat account first: its signature is what gets replayed");
    const past = await call("eth_getTransactionByHash", [old]);
    const stolen = (past?.signatures ?? []).find((sg: { scheme: string }) => Number(sg.scheme) === 0)?.signature as Hex | undefined;
    if (!stolen) throw new Error("could not read the old transaction's signatures from the devnet");
    const st = await readState(lb);
    const t = buildTx({ account: lb, owner: this.exposedAddress, nonce: st.nonce, mode: st.mode, senderData: calldata.execute(deployment.recipient, await balanceOf(lb)) });
    let forged = st.mode === "HYBRID" ? await ftx.signTx(profile, t, this.state.exposedKey, 0) : t;
    const pqIndex = st.mode === "HYBRID" ? 1 : 0;
    forged = { ...forged, signatures: forged.signatures.map((e, i) => (i === pqIndex ? { ...e, signature: stolen } : e)) };
    return this.expectRejected(forged, `Replayed the signature from ${old.slice(0, 10)}…: rejected`);
  }

  private async expectRejected(t: ftx.FrameTx, kind: string): Promise<RejectedError> {
    try {
      const { hash } = await submit(t);
      throw new Error(`the attack was admitted (${hash}); this should never happen`);
    } catch (e) {
      if (e instanceof RejectedError) {
        this.persist(kind, undefined, e.reason ?? undefined);
        return e;
      }
      throw e;
    }
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
    return this.expectRejected(forged, "Attack with the stolen ECDSA key: rejected");
  }
}

export { hexToBytes };
