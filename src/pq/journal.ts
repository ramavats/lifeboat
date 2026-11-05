import { bytesToHex } from "@noble/hashes/utils.js";
import { signRaw, type KeyPair } from "./xmss.js";

/**
 * The one rule a stateful hash-based signer must never break: a one-time key signs at
 * most one message. Onchain, the account forces leaf = tx nonce, so a leaf is accepted at
 * most once. Off-chain, this journal stops the signer from producing a second, different
 * signature with the same leaf (for example when "replacing" a stuck transaction).
 * Re-signing the identical sigHash is allowed: it yields the identical signature.
 */
export class Journal {
  constructor(private used: Map<number, string> = new Map()) {}

  sign(kp: KeyPair, leaf: number, sigHash: Uint8Array): Uint8Array {
    const hex = bytesToHex(sigHash);
    const prev = this.used.get(leaf);
    if (prev !== undefined && prev !== hex) {
      throw new Error(`one-time key ${leaf} already signed a different transaction; refusing to reuse it`);
    }
    const sig = signRaw(kp, leaf, sigHash);
    this.used.set(leaf, hex);
    return sig;
  }

  usedCount(): number {
    return this.used.size;
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries([...this.used].map(([k, v]) => [String(k), v]));
  }

  static fromJSON(j: Record<string, string>): Journal {
    return new Journal(new Map(Object.entries(j).map(([k, v]) => [Number(k), v])));
  }
}
