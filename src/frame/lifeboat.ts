import * as tx from "@forshtat/hegota-support/tx";
import { toWire } from "@forshtat/hegota-support/rpc";
import type { FrameTx } from "@forshtat/hegota-support/tx";
import { bytesToHex, encodeFunctionData, hexToBytes, type Abi, type Address, type Hex } from "viem";
import { LifeboatAccountAbi } from "../abi.js";
import { Journal } from "../pq/journal.js";
import type { KeyPair } from "../pq/xmss.js";
import { call, devnet, profile } from "./devnet.js";

export const lifeboatAbi = LifeboatAccountAbi as Abi;

export type Mode = "HYBRID" | "PQ_ONLY";

export interface OnchainState {
  mode: Mode;
  nonce: bigint;
  nonceBase: bigint;
  height: bigint;
}

async function readUint(account: Address, fn: string): Promise<bigint> {
  const data = encodeFunctionData({ abi: lifeboatAbi, functionName: fn, args: [] });
  return BigInt(await call("eth_call", [{ to: account, data }, "latest"]));
}

export async function readState(account: Address): Promise<OnchainState> {
  const [mode, nonce, nonceBase, height] = await Promise.all([
    readUint(account, "mode"),
    call("eth_getTransactionCount", [account, "latest"]).then(BigInt),
    readUint(account, "nonceBase"),
    readUint(account, "height"),
  ]);
  return { mode: mode === 0n ? "HYBRID" : "PQ_ONLY", nonce, nonceBase, height };
}

export const calldata = {
  execute: (to: Address, value: bigint, data: Hex = "0x") =>
    encodeFunctionData({ abi: lifeboatAbi, functionName: "execute", args: [to, value, data] }),
  executeBatch: (calls: { to: Address; value: bigint; data: Hex }[]) =>
    encodeFunctionData({ abi: lifeboatAbi, functionName: "executeBatch", args: [calls] }),
  enablePqOnly: () => encodeFunctionData({ abi: lifeboatAbi, functionName: "enablePqOnly", args: [] }),
  rotateKeys: (pubSeed: Hex, root: Hex, height: bigint) =>
    encodeFunctionData({ abi: lifeboatAbi, functionName: "rotateKeys", args: [pubSeed, root, height] }),
  validateTx: () => encodeFunctionData({ abi: lifeboatAbi, functionName: "validateTx", args: [] }),
};

const MAX_VERIFY_GAS = 100_000n;
const SIG_COST = { SECP256K1: 2_800n, ARBITRARY: 100n };
export const verifyGas = (mode: Mode) =>
  MAX_VERIFY_GAS - SIG_COST.ARBITRARY - (mode === "HYBRID" ? SIG_COST.SECP256K1 : 0n);

/** [VERIFY(self, validateTx), SENDER(self, senderData)] with the signature slots for `mode`. */
export function buildTx(a: { account: Address; owner: Address; nonce: bigint; mode: Mode; senderData: Hex }): FrameTx {
  const arbitrary = { scheme: tx.sigScheme(profile, "ARBITRARY"), signer: "0x" as Hex, msg: "0x" as Hex, signature: "0x" as Hex };
  return tx.newTx({
    chainId: devnet.chainId,
    sender: a.account,
    nonceSeq: a.nonce,
    frames: [
      // The mempool caps the validation prefix at 100k gas including signature costs
      // (SECP256K1 2,800 + ARBITRARY 100), so VERIFY may declare at most 97,100.
      tx.frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", target: null, execution: verifyGas(a.mode), data: calldata.validateTx() }),
      tx.frame(profile, "SENDER", { target: null, execution: 300_000n, state: 400_000n, data: a.senderData }),
    ],
    signatures: a.mode === "HYBRID" ? [tx.secp256k1Placeholder(profile, a.owner), arbitrary] : [arbitrary],
    fees: { maxFeePerGas: devnet.maxFeePerGasWei },
  });
}

/**
 * Sign: the ECDSA entry (HYBRID only) and the XMSS entry both cover the canonical sigHash,
 * in which every entry with an empty `msg` has its signature bytes elided.
 */
export async function signTx(
  t: FrameTx,
  s: { mode: Mode; ecdsaKey?: Hex; kp: KeyPair; journal: Journal; nonceBase: bigint },
): Promise<{ tx: FrameTx; leaf: number; sigHash: Hex }> {
  const sigHash = tx.sigHash(profile, t);
  const leaf = Number(t.nonceSeq - s.nonceBase);
  const pq = bytesToHex(s.journal.sign(s.kp, leaf, hexToBytes(sigHash)));

  let signed = t;
  if (s.mode === "HYBRID") {
    if (!s.ecdsaKey) throw new Error("HYBRID mode needs the owner's ECDSA key");
    signed = await tx.signTx(profile, t, s.ecdsaKey, 0);
  }
  const pqIndex = s.mode === "HYBRID" ? 1 : 0;
  const signatures = signed.signatures.map((e, i) => (i === pqIndex ? { ...e, signature: pq } : e));
  return { tx: { ...signed, signatures }, leaf, sigHash };
}

export const send = (t: FrameTx): Promise<Hex> => call("eth_sendFrameTransaction", [toWire(t)]);
export const estimate = (t: FrameTx) => call("eth_estimateFrameTransactionGas", [toWire(t)]);
export const status = (hash: Hex) => call("skandha_frameTransactionStatus", [hash]);
