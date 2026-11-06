/**
 * Quantum exposure check for an Ethereum address, from plain JSON-RPC reads.
 *
 * An externally owned account (EOA) publishes its secp256k1 public key the first time it
 * signs a transaction: anyone can recover it from the signature. So an EOA with nonce > 0
 * is exposed, and one with nonce 0 is not (yet). A smart contract account has no key of
 * its own; its owners' keys are what matter. An EIP-7702 delegated EOA (code 0xef0100…)
 * signed an authorization, so its key is exposed too.
 *
 * `fetchFn` decides how the reads travel. In the browser it is Anon-RPC's anonymized fetch,
 * so the RPC provider never learns who is checking which address.
 */

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export type ExposureStatus = "exposed" | "not-exposed" | "contract";

export interface Exposure {
  address: string;
  chainId: number;
  block: bigint;
  nonce: bigint;
  balanceWei: bigint;
  kind: "eoa" | "eip7702-eoa" | "contract";
  status: ExposureStatus;
  /** Plain-language explanation for the UI. */
  why: string;
  /** How many JSON-RPC reads the check made (all through `fetchFn`). */
  reads: number;
}

export class RpcClient {
  reads = 0;
  private id = 1;

  constructor(
    private url: string,
    private fetchFn: FetchFn = (u, i) => fetch(u, i),
    /**
     * Tries per read. Mixnet and Tor reads sometimes hit the worker's time limit, and a fresh try
     * usually goes through. Copies in flight at once don't help: one Anon-RPC session queues them.
     */
    private attempts = 3,
  ) {}

  /** One request per call: Anon-RPC networks don't document batch support, so we don't batch. */
  async request<T = string>(method: string, params: unknown[] = []): Promise<T> {
    this.reads++;
    const id = this.id++;
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    };
    let last: Error = new Error(`${method}: no attempt made`);
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      let res: Response;
      try {
        res = await this.fetchFn(this.url, init);
      } catch (e) {
        // Network failure or timeout on the way: worth another try.
        last = new Error(`${method}: ${(e as Error).message}`);
        continue;
      }
      if (res.status >= 500) {
        last = new Error(`${method}: HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
      // A JSON-RPC error is the node's real answer, so it isn't retried.
      const body = (await res.json()) as { result?: T; error?: { message: string } };
      if (body.error) throw new Error(`${method}: ${body.error.message}`);
      return body.result as T;
    }
    throw new Error(`${last.message} (tried ${this.attempts} times)`);
  }
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function checkExposure(rpc: RpcClient, address: string): Promise<Exposure> {
  if (!ADDRESS.test(address)) throw new Error("not an address: expected 0x followed by 40 hex characters");
  const before = rpc.reads;
  // Over Anon-RPC each read is its own circuit and TLS session, and on a slow mixnet a read can
  // take 20 s, so all five go out at once: one round instead of two. They read "latest" rather
  // than one pinned block; a block's difference can't change whether a key was ever published.
  const [blockHex, chainIdHex, nonceHex, balanceHex, codeHex] = await Promise.all([
    rpc.request("eth_blockNumber"),
    rpc.request("eth_chainId"),
    rpc.request("eth_getTransactionCount", [address, "latest"]),
    rpc.request("eth_getBalance", [address, "latest"]),
    rpc.request("eth_getCode", [address, "latest"]),
  ]);
  const block = BigInt(blockHex);
  const chainId = Number(BigInt(chainIdHex));
  const nonce = BigInt(nonceHex);
  const balanceWei = BigInt(balanceHex);
  const code = codeHex.toLowerCase();

  const base = { address, chainId, block, nonce, balanceWei, reads: rpc.reads - before };

  if (code !== "0x" && !code.startsWith("0xef0100")) {
    return {
      ...base,
      kind: "contract",
      status: "contract",
      why: "This is a smart contract account. It has no key of its own: its safety depends on the keys of whoever controls it.",
    };
  }
  const kind = code.startsWith("0xef0100") ? "eip7702-eoa" : "eoa";
  if (kind === "eip7702-eoa" || nonce > 0n) {
    return {
      ...base,
      kind,
      status: "exposed",
      why:
        kind === "eip7702-eoa"
          ? "This account delegated its code with EIP-7702, which it had to sign: its public key is onchain."
          : `This account has sent ${nonce} transaction${nonce === 1n ? "" : "s"}. Each one publishes the public key a quantum computer would need.`,
    };
  }
  return {
    ...base,
    kind,
    status: "not-exposed",
    why: "Not exposed yet: this account has never signed a transaction, so its public key has never been published.",
  };
}
