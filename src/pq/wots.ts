import { keccak_256 } from "@noble/hashes/sha3.js";
import { ChainHasher, concat } from "./hash.js";
import { CHAIN_MAX, LEN, LEN1, N } from "./params.js";

/** 64 base-16 digits of the message (high nibble first), then 3 checksum digits. */
export function digits(msg: Uint8Array): number[] {
  if (msg.length !== N) throw new Error("WOTS message must be 32 bytes");
  const d: number[] = [];
  for (const byte of msg) d.push(byte >> 4, byte & 0x0f);
  let csum = 0;
  for (let i = 0; i < LEN1; i++) csum += CHAIN_MAX - d[i]!;
  // csum ≤ 64 × 15 = 960 < 16^3, so three digits hold it exactly.
  d.push((csum >> 8) & 0x0f, (csum >> 4) & 0x0f, csum & 0x0f);
  return d;
}

/** Secret chain start for (leaf, chain). Only the signer ever computes this. */
export function secretKey(skSeed: Uint8Array, leaf: number, chainIdx: number): Uint8Array {
  // keccak256(skSeed ‖ uint32 leaf ‖ uint32 chain)
  const b = new Uint8Array(40);
  b.set(skSeed, 0);
  const v = new DataView(b.buffer);
  v.setUint32(32, leaf >>> 0);
  v.setUint32(36, chainIdx >>> 0);
  return keccak_256(b);
}

/** Full WOTS public key for one leaf: each chain walked all the way to step 15. */
export function publicKey(h: ChainHasher, skSeed: Uint8Array, leaf: number): Uint8Array {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < LEN; i++) parts.push(h.chain(secretKey(skSeed, leaf, i), leaf, i, 0, CHAIN_MAX));
  return concat(...parts);
}

export function sign(h: ChainHasher, skSeed: Uint8Array, leaf: number, msg: Uint8Array): Uint8Array {
  const d = digits(msg);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < LEN; i++) parts.push(h.chain(secretKey(skSeed, leaf, i), leaf, i, 0, d[i]!));
  return concat(...parts);
}

/** Recompute the public key a signature implies. Equal to publicKey() iff the signature is valid. */
export function publicKeyFromSig(h: ChainHasher, leaf: number, msg: Uint8Array, sig: Uint8Array): Uint8Array {
  if (sig.length !== LEN * N) throw new Error("bad WOTS signature length");
  const d = digits(msg);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < LEN; i++) {
    parts.push(h.chain(sig.subarray(i * N, (i + 1) * N), leaf, i, d[i]!, CHAIN_MAX - d[i]!));
  }
  return concat(...parts);
}
