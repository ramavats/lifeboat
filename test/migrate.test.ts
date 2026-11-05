import { describe, expect, it } from "vitest";
import { summarizeMigrationTx } from "../src/frame/migrate.js";

// The real migration tx 0xe0645ace…b02c on the alt-mempool devnet, as eth_getTransactionByHash returned it.
const realTx = {
  sender: "0x717d7863adc6587f57d67eb403ae48b21beeebaf",
  frames: [
    { mode: "0x1", to: null, value: "0x0", data: "0x" },
    { mode: "0x1", to: "0x4b94121f0343a95c90e9fd6bb3e0d6fa7448ed0c", value: "0x0", data: "0x766c4f3700000000000000000000000094a8ec3865a9dbb50778361ed05a1f17af296d62" },
    { mode: "0x2", to: "0x94a8ec3865a9dbb50778361ed05a1f17af296d62", value: "0xde0b6a9a4641200", data: "0x" },
    { mode: "0x2", to: "0x53af43f3d696bef8e7fb022b8a707f7103f952a0", value: "0x0", data: "0xa9059cbb00000000000000000000000094a8ec3865a9dbb50778361ed05a1f17af296d62000000000000000000000000000000000000000000000000000000008f0d1800" },
    { mode: "0x0", to: "0x4b94121f0343a95c90e9fd6bb3e0d6fa7448ed0c", value: "0x0", data: "0x14aaa61b" },
  ],
};

describe("summarizeMigrationTx", () => {
  it("reads what the real devnet migration moved", () => {
    expect(summarizeMigrationTx(realTx)).toEqual({
      exposed: "0x717d7863adc6587f57d67eb403ae48b21beeebaf",
      lifeboat: "0x94a8ec3865a9dbb50778361ed05a1f17af296d62",
      sponsor: "0x4b94121f0343a95c90e9fd6bb3e0d6fa7448ed0c",
      ethWei: 0xde0b6a9a4641200n,
      tokens: [{ token: "0x53af43f3d696bef8e7fb022b8a707f7103f952a0", amount: 2_400_000_000n }],
    });
  });

  it("refuses a transaction that sends value anywhere else", () => {
    const bad = structuredClone(realTx);
    bad.frames[2]!.to = "0x8943545177806ed17b9f23f0a21ee5948ecaa776";
    expect(() => summarizeMigrationTx(bad)).toThrow(/not the Lifeboat account/);
  });

  it("refuses a transaction without the sponsor frame", () => {
    const bad = structuredClone(realTx);
    bad.frames.splice(1, 1);
    expect(() => summarizeMigrationTx(bad)).toThrow(/not a sponsored migration/);
  });
});
