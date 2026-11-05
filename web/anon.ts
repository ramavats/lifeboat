import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import type { FetchFn } from "../src/exposure/check.js";

/**
 * Anon-RPC networks live on Ethereum mainnet (from ethereum.github.io/anon-rpc/adopters,
 * read Nov 5, 2026). Each is an on-chain specifier contract that pins the anon-client
 * bundle by hash.
 */
export const NETWORKS = {
  "tor-js": {
    label: "Tor (tor-js)",
    address: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
    // Demo gateway from the adopters page: limited capacity, may disappear.
    config: { gateways: ["152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ"] },
  },
  nym: { label: "Nym mixnet", address: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0", config: undefined },
  passthrough: {
    label: "Passthrough (sandbox only, NOT anonymous)",
    address: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27",
    config: undefined,
  },
} as const;

export type NetworkId = keyof typeof NETWORKS;

/**
 * Bootstrap provider: used by the harness for one thing, reading the specifier contract
 * (workerHash, workerResolvers). That single read is not anonymized, and it carries no
 * information about which address the user is checking.
 */
function bootstrapProvider(url: string) {
  return {
    request: async ({ method, params }: { method: string; params?: unknown }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error.message);
      return body.result;
    },
  };
}

export interface AnonSession {
  network: NetworkId;
  worker: AnonRpcWorker;
  /** A fetch that routes through Anon-RPC, isolating calls by `isolationKey`. */
  fetchFor(isolationKey: string): FetchFn;
  close(): void;
}

export function startAnon(network: NetworkId, bootstrapRpc: string, onLog: (line: string) => void): AnonSession {
  const n = NETWORKS[network];
  const worker = new AnonRpcWorker({
    address: n.address,
    config: n.config as never,
    preExisting: { rpcProvider: bootstrapProvider(bootstrapRpc) },
  });

  // Surface the worker's own log lines (bootstrap progress, failures) in the page.
  void (async () => {
    try {
      for (;;) {
        const { level, args } = await worker.acceptLog();
        onLog(`[${level}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`);
      }
    } catch {
      /* worker closed or failed; ready rejects with the reason */
    }
  })();

  return {
    network,
    worker,
    fetchFor: (isolationKey) => (input, init) => worker.fetch(input, { ...init, anonOptions: { isolationKey } } as never),
    close: () => worker.close(),
  };
}
