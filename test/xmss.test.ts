import { describe, expect, it } from "vitest";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Journal } from "../src/pq/journal.js";
import { sigLength } from "../src/pq/params.js";
import { digits } from "../src/pq/wots.js";
import { keygen, signRaw, verify } from "../src/pq/xmss.js";

const seed = keccak_256(new TextEncoder().encode("lifeboat test seed"));
const kp = keygen(seed, 3); // 8 leaves keeps the test fast
const msg = (s: string) => keccak_256(new TextEncoder().encode(s));

describe("WOTS digits", () => {
  it("has 64 message digits plus a 3-digit checksum", () => {
    const d = digits(new Uint8Array(32)); // all zero → checksum 960 = 0x3c0
    expect(d).toHaveLength(67);
    expect(d.slice(64)).toEqual([3, 12, 0]);
    expect(digits(new Uint8Array(32).fill(0xff)).slice(64)).toEqual([0, 0, 0]);
  });
});

describe("XMSS-lite", () => {
  it("is deterministic from the seed", () => {
    expect(keygen(seed, 3).pub.root).toEqual(kp.pub.root);
  });

  it("verifies a valid signature for every leaf", () => {
    for (let leaf = 0; leaf < 8; leaf++) {
      const sig = signRaw(kp, leaf, msg(`tx ${leaf}`));
      expect(sig).toHaveLength(sigLength(3));
      expect(verify(kp.pub, msg(`tx ${leaf}`), sig)).toEqual({ ok: true, leaf });
    }
  });

  it("rejects a signature over another message", () => {
    const sig = signRaw(kp, 2, msg("a"));
    expect(verify(kp.pub, msg("b"), sig).ok).toBe(false);
  });

  it("rejects any flipped byte", () => {
    const sig = signRaw(kp, 5, msg("a"));
    for (const pos of [0, 3, 4, 100, 4 + 67 * 32 - 1, sig.length - 1]) {
      const bad = sig.slice();
      bad[pos]! ^= 1;
      expect(verify(kp.pub, msg("a"), bad).ok, `byte ${pos}`).toBe(false);
    }
  });

  it("rejects a signature under another key", () => {
    const other = keygen(msg("other seed"), 3);
    expect(verify(other.pub, msg("a"), signRaw(kp, 1, msg("a"))).ok).toBe(false);
  });

  it("rejects wrong lengths and out-of-range leaves", () => {
    const sig = signRaw(kp, 1, msg("a"));
    expect(verify(kp.pub, msg("a"), sig.subarray(1)).ok).toBe(false);
    const bad = sig.slice();
    bad[3] = 9; // leaf 9 in an 8-leaf tree
    expect(verify(kp.pub, msg("a"), bad).ok).toBe(false);
  });
});

describe("Journal", () => {
  it("refuses to sign a second, different message with the same leaf", () => {
    const j = new Journal();
    const first = j.sign(kp, 4, msg("tx A"));
    expect(j.sign(kp, 4, msg("tx A"))).toEqual(first); // identical re-sign is fine
    expect(() => j.sign(kp, 4, msg("tx B"))).toThrow(/already signed a different transaction/);
    expect(Journal.fromJSON(j.toJSON()).usedCount()).toBe(1);
  });
});
