import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "viem";
import { keygen, signRaw } from "../src/pq/xmss.js";
import { TestChain } from "../test/evm.js";

const msg = (s: string) => keccak_256(new TextEncoder().encode(s));
const v = await (await TestChain.create()).deploy("XmssVerifierHarness");
const t = performance.now();
const kp = keygen(msg("gas seed"), 10);
console.log(`keygen h=10: ${((performance.now() - t) / 1000).toFixed(1)} s`);
const gas: bigint[] = [];
for (let i = 0; i < 16; i++) {
  const sig = signRaw(kp, i, msg(`gas ${i}`));
  const { out, gas: g } = await v.call("verify", [bytesToHex(kp.pub.pubSeed), bytesToHex(kp.pub.root), 10n, bytesToHex(msg(`gas ${i}`)), bytesToHex(sig)]);
  if (!out[0]) throw new Error("verify failed");
  gas.push(g);
}
const avg = gas.reduce((a, b) => a + b, 0n) / BigInt(gas.length);
console.log(`verify gas over 16 sigs: min ${gas.reduce((a, b) => (b < a ? b : a))} avg ${avg} max ${gas.reduce((a, b) => (b > a ? b : a))}; sig size ${4 + 67 * 32 + 10 * 32} bytes`);
