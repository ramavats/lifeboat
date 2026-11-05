import { beforeAll, describe, expect, it } from "vitest";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "viem";
import { keygen, signRaw, type KeyPair } from "../src/pq/xmss.js";
import { TestChain, type Deployed } from "./evm.js";

const hex = (b: Uint8Array) => bytesToHex(b);
const msg = (s: string) => keccak_256(new TextEncoder().encode(s));

let v: Deployed;
let kp: KeyPair;

const verifyOnchain = (k: KeyPair, sigHash: Uint8Array, sig: Uint8Array) =>
  v.call("verify", [hex(k.pub.pubSeed), hex(k.pub.root), BigInt(k.pub.height), hex(sigHash), hex(sig)]);

beforeAll(async () => {
  v = await (await TestChain.create()).deploy("XmssVerifierHarness");
  kp = keygen(keccak_256(new TextEncoder().encode("verifier test seed")), 4);
}, 60_000);

describe("XmssVerifier.sol matches the TypeScript signer", () => {
  it("accepts every leaf's valid signature and reports the leaf", async () => {
    for (let leaf = 0; leaf < 16; leaf++) {
      const { out } = await verifyOnchain(kp, msg(`tx ${leaf}`), signRaw(kp, leaf, msg(`tx ${leaf}`)));
      expect(out).toEqual([true, BigInt(leaf)]);
    }
  });

  it("rejects another message, a flipped byte, another key and a wrong length", async () => {
    const sig = signRaw(kp, 3, msg("a"));
    expect((await verifyOnchain(kp, msg("b"), sig)).out[0]).toBe(false);

    for (const pos of [5, 8 + 127 * 32 + 7, sig.length - 1]) {
      const bad = sig.slice();
      bad[pos]! ^= 0x80;
      expect((await verifyOnchain(kp, msg("a"), bad)).out[0], `byte ${pos}`).toBe(false);
    }

    const other = keygen(msg("other"), 4);
    expect((await verifyOnchain(other, msg("a"), sig)).out[0]).toBe(false);
    expect((await verifyOnchain(kp, msg("a"), sig.subarray(0, sig.length - 32))).out[0]).toBe(false);
  });

  it("rejects an out-of-range leaf index", async () => {
    const bad = signRaw(kp, 3, msg("a")).slice();
    bad[3] = 16; // 16-leaf tree
    expect((await verifyOnchain(kp, msg("a"), bad)).out[0]).toBe(false);
  });

  it("reports gas for a height-10 tree signature", async () => {
    // Gas depends on the message digits, not the tree size beyond the auth path; a
    // height-10 path is simulated with a real height-10 key from a small seed sweep.
    const big = keygen(msg("gas seed"), 10);
    const samples: bigint[] = [];
    for (let i = 0; i < 8; i++) {
      const { out, gas } = await verifyOnchain(big, msg(`gas ${i}`), signRaw(big, i, msg(`gas ${i}`)));
      expect(out[0]).toBe(true);
      samples.push(gas);
    }
    const avg = samples.reduce((a, b) => a + b, 0n) / BigInt(samples.length);
    const max = samples.reduce((a, b) => (b > a ? b : a), 0n);
    console.log(`XMSS-lite h=10 verify gas: avg ${avg}, max ${max} (execution only, harness call)`);
    expect(max).toBeLessThan(1_000_000n);
  }, 60_000);
});
