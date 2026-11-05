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

  constructor(private url: string, private fetchFn: FetchFn = (u, i) => fetch(u, i)) {}

  /** One request per call: Anon-RPC networks don't document batch support, so we don't batch. */
  async request<T = string>(method: string, params: unknown[] = []): Promise<T> {
    this.reads++;
    const res = await this.fetchFn(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.id++, method, params }),
    });
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result as T;
  }
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function checkExposure(rpc: RpcClient, address: string): Promise<Exposure> {
  if (!ADDRESS.test(address)) throw new Error("not an address: expected 0x followed by 40 hex characters");
  const before = rpc.reads;
  // Pin every read to one block so the answers agree with each other.
  const block = BigInt(await rpc.request("eth_blockNumber"));
  const tag = `0x${block.toString(16)}`;
  const chainId = Number(BigInt(await rpc.request("eth_chainId")));
  const nonce = BigInt(await rpc.request("eth_getTransactionCount", [address, tag]));
  const balanceWei = BigInt(await rpc.request("eth_getBalance", [address, tag]));
  const code = (await rpc.request("eth_getCode", [address, tag])).toLowerCase();

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
