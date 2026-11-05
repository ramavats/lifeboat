import { keccak_256 } from "@noble/hashes/sha3.js";
import { TAG_CHAIN, TAG_LEAF, TAG_MSG, TAG_NODE } from "./params.js";

/**
 * Tweakable hashes. Each one is keccak256(pubSeed ‖ adrs ‖ data), where adrs is a 32-byte
 * big-endian word: [tag:1][zero padding][leaf:4][chain or height:4][step or index:4].
 * In Solidity this is keccak256(abi.encodePacked(bytes32 pubSeed, uint256 adrs, data)).
 */

export function adrs(tag: number, a: number, b: number, c: number): Uint8Array {
  const out = new Uint8Array(32);
  out[0] = tag;
  const v = new DataView(out.buffer);
  v.setUint32(20, a >>> 0);
  v.setUint32(24, b >>> 0);
  v.setUint32(28, c >>> 0);
  return out;
}

/** One reusable 96-byte buffer: pubSeed ‖ adrs ‖ x. Chain hashing dominates keygen time. */
export class ChainHasher {
  private buf = new Uint8Array(96);
  private view = new DataView(this.buf.buffer);

  constructor(pubSeed: Uint8Array) {
    this.buf.set(pubSeed, 0);
    this.buf[32] = TAG_CHAIN;
  }

  /** Apply `steps` chain steps to x, starting at step `start`, for (leaf, chain). */
  chain(x: Uint8Array, leaf: number, chainIdx: number, start: number, steps: number): Uint8Array {
    let cur = x;
    this.view.setUint32(32 + 20, leaf >>> 0);
    this.view.setUint32(32 + 24, chainIdx >>> 0);
    for (let j = start; j < start + steps; j++) {
      this.view.setUint32(32 + 28, j >>> 0);
      this.buf.set(cur, 64);
      cur = keccak_256(this.buf);
    }
    return cur;
  }
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Compress a WOTS public key (67 × 32 bytes) into one leaf. */
export const leafHash = (pubSeed: Uint8Array, leaf: number, pk: Uint8Array) =>
  keccak_256(concat(pubSeed, adrs(TAG_LEAF, leaf, 0, 0), pk));

/** Merkle node at (height, index) from its two children. Leaves are height 0. */
export const nodeHash = (pubSeed: Uint8Array, height: number, index: number, l: Uint8Array, r: Uint8Array) =>
  keccak_256(concat(pubSeed, adrs(TAG_NODE, 0, height, index), l, r));

/** The 32 bytes WOTS actually signs: a domain-separated digest of the tx's sigHash. */
export const messageDigest = (pubSeed: Uint8Array, sigHash: Uint8Array) =>
  keccak_256(concat(pubSeed, adrs(TAG_MSG, 0, 0, 0), sigHash));
