import { describe, expect, it } from "vitest";
import { RpcClient, checkExposure, type FetchFn } from "../src/exposure/check.js";

/** A fake JSON-RPC endpoint that records every method it was asked for. */
function fakeRpc(state: { nonce: number; balance: bigint; code: string }) {
  const seen: string[] = [];
  const fetchFn: FetchFn = async (_url, init) => {
    const { id, method } = JSON.parse(String(init.body));
    seen.push(method);
    const result = {
      eth_blockNumber: "0x1500000",
      eth_chainId: "0x1",
      eth_getTransactionCount: `0x${state.nonce.toString(16)}`,
      eth_getBalance: `0x${state.balance.toString(16)}`,
      eth_getCode: state.code,
    }[method as string];
    return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: { "content-type": "application/json" } });
  };
  return { rpc: new RpcClient("https://rpc.test", fetchFn), seen };
}

const A = "0x3fA2b1c2D3e4F5061728394a5B6c7D8e9F0091c0";

describe("checkExposure", () => {
  it("an EOA that has sent transactions is exposed", async () => {
    const { rpc, seen } = fakeRpc({ nonce: 214, balance: 1_250_000_000_000_000_000n, code: "0x" });
    const e = await checkExposure(rpc, A);
    expect(e).toMatchObject({ status: "exposed", kind: "eoa", nonce: 214n, chainId: 1, reads: 5 });
    expect(e.why).toContain("214 transactions");
    expect(seen[0]).toBe("eth_blockNumber");
    expect([...seen].sort()).toEqual(["eth_blockNumber", "eth_chainId", "eth_getBalance", "eth_getCode", "eth_getTransactionCount"]);
  });

  it("an EOA that never signed is not exposed", async () => {
    const { rpc } = fakeRpc({ nonce: 0, balance: 5n, code: "0x" });
    expect((await checkExposure(rpc, A)).status).toBe("not-exposed");
  });

  it("an EIP-7702 delegated EOA is exposed even with nonce 0", async () => {
    const { rpc } = fakeRpc({ nonce: 0, balance: 0n, code: "0xef0100" + "ab".repeat(20) });
    expect(await checkExposure(rpc, A)).toMatchObject({ status: "exposed", kind: "eip7702-eoa" });
  });

  it("a contract account has no key of its own", async () => {
    const { rpc } = fakeRpc({ nonce: 1, balance: 0n, code: "0x6080604052" });
    expect((await checkExposure(rpc, A)).status).toBe("contract");
  });

  it("rejects input that is not an address", async () => {
    const { rpc } = fakeRpc({ nonce: 0, balance: 0n, code: "0x" });
    await expect(checkExposure(rpc, "vitalik.eth")).rejects.toThrow(/not an address/);
  });
});

describe("RpcClient retries", () => {
  const ok = (id: number, result: string) => new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: { "content-type": "application/json" } });

  it("retries a read that times out, and counts it as one read", async () => {
    let calls = 0;
    const fetchFn: FetchFn = async (_url, init) => {
      calls++;
      if (calls < 3) throw new Error("operation timed out");
      return ok(JSON.parse(String(init.body)).id, "0x1");
    };
    const rpc = new RpcClient("https://rpc.test", fetchFn);
    expect(await rpc.request("eth_chainId")).toBe("0x1");
    expect(calls).toBe(3);
    expect(rpc.reads).toBe(1);
  });

  it("retries a 5xx but gives up after three tries", async () => {
    let calls = 0;
    const rpc = new RpcClient("https://rpc.test", async () => (calls++, new Response("bad gateway", { status: 502 })));
    await expect(rpc.request("eth_chainId")).rejects.toThrow("eth_chainId: HTTP 502 (tried 3 times)");
    expect(calls).toBe(3);
  });

  it("does not retry the node's own JSON-RPC error", async () => {
    let calls = 0;
    const rpc = new RpcClient("https://rpc.test", async (_u, init) => {
      calls++;
      const { id } = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32602, message: "invalid params" } }), { headers: { "content-type": "application/json" } });
    });
    await expect(rpc.request("eth_getBalance", ["0x0"])).rejects.toThrow("invalid params");
    expect(calls).toBe(1);
  });
});
