import { keccak_256 } from "@noble/hashes/sha3.js";
import { ChainHasher, concat } from "./hash.js";
import { CHAIN_MAX, LEN, N, TARGET_SUM } from "./params.js";

/** 128 base-4 digits of the 32-byte message, most significant first. */
export function digits(msg: Uint8Array): number[] {
  if (msg.length !== N) throw new Error("WOTS message must be 32 bytes");
  const d: number[] = [];
  for (const byte of msg) d.push((byte >> 6) & 3, (byte >> 4) & 3, (byte >> 2) & 3, byte & 3);
  return d;
}

export const digitSum = (d: number[]) => d.reduce((a, b) => a + b, 0);

/** Secret chain start for (leaf, chain): keccak256(skSeed ‖ uint32 leaf ‖ uint32 chain). Signer only. */
export function secretKey(skSeed: Uint8Array, leaf: number, chainIdx: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set(skSeed, 0);
  const v = new DataView(b.buffer);
  v.setUint32(32, leaf >>> 0);
  v.setUint32(36, chainIdx >>> 0);
  return keccak_256(b);
}

/** Full WOTS public key for one leaf: each chain walked to the top (step CHAIN_MAX). */
export function publicKey(h: ChainHasher, skSeed: Uint8Array, leaf: number): Uint8Array {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < LEN; i++) parts.push(h.chain(secretKey(skSeed, leaf, i), leaf, i, 0, CHAIN_MAX));
  return concat(...parts);
}

/** Sign a message whose digits already sum to TARGET_SUM (the caller grinds for that). */
export function sign(h: ChainHasher, skSeed: Uint8Array, leaf: number, msg: Uint8Array): Uint8Array {
  const d = digits(msg);
  if (digitSum(d) !== TARGET_SUM) throw new Error("message digits do not hit the target sum");
  const parts: Uint8Array[] = [];
  for (let i = 0; i < LEN; i++) parts.push(h.chain(secretKey(skSeed, leaf, i), leaf, i, 0, d[i]!));
  return concat(...parts);
}

/** Recompute the public key a signature implies, or null if the digits miss the target sum. */
export function publicKeyFromSig(h: ChainHasher, leaf: number, msg: Uint8Array, sig: Uint8Array): Uint8Array | null {
  if (sig.length !== LEN * N) throw new Error("bad WOTS signature length");
  const d = digits(msg);
  if (digitSum(d) !== TARGET_SUM) return null;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < LEN; i++) {
    parts.push(h.chain(sig.subarray(i * N, (i + 1) * N), leaf, i, d[i]!, CHAIN_MAX - d[i]!));
  }
  return concat(...parts);
}
