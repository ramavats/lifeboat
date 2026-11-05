import { getProfile } from "@forshtat/hegota-support/profiles";
import { rpc } from "@forshtat/hegota-support/rpc";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

/** process.env in Node, nothing in the browser. */
export function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

/** The public ERC-8421 alt-mempool devnet (verified live Nov 5, 2026). */
export const devnet = {
  chainId: 1337,
  gatewayUrl: env("LIFEBOAT_GATEWAY") ?? "https://altmempoolgateway.forshtat.com/rpc",
  explorerUrl: "https://explorer.altmempool.wtf/",
  stakingRegistry: "0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f" as Address,
  // Devnet minStake is 0.01 ETH; stake a little above it.
  stakeWei: 12_000_000_000_000_000n,
  unstakeDelaySec: 86_400,
  legacyGasPriceWei: 2_000_000n, // 0.002 gwei; base fee is a few wei
  deployGasLimit: 9_000_000n,
  maxFeePerGasWei: 2_000_000_000n, // 2 gwei
};

export const profile = getProfile("ethrex-eip8141-tracer");

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** JSON-RPC to the gateway. Retries transport failures (the devnet has brief outages), never node errors. */
export async function call(method: string, params: unknown[] = [], retries = 4): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rpc(devnet.gatewayUrl, method, params);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (attempt >= retries || (code !== "RPC_UNREACHABLE" && code !== "RPC_BAD_RESPONSE")) throw e;
      await sleep(1500 * 2 ** attempt);
    }
  }
}

export async function balanceOf(a: Address): Promise<bigint> {
  return BigInt(await call("eth_getBalance", [a, "latest"]));
}

export async function nonceOf(a: Address, tag: "latest" | "pending" = "latest"): Promise<bigint> {
  return BigInt(await call("eth_getTransactionCount", [a, tag]));
}

type LegacyTx = { to: Address | null; value?: bigint; data?: Hex; gas?: bigint };

/** Legacy txs this process sent, so a lost one can be rebroadcast or re-signed. */
const sent = new Map<Hex, { key: Hex; tx: LegacyTx; raw: Hex }>();

/**
 * Wait for a receipt. The devnet's mempool sometimes accepts a legacy tx and then loses it, so
 * for a tx we sent: every 15 s that the node doesn't know it, rebroadcast the same signed bytes
 * (harmless); if its nonce was taken meanwhile, re-sign with a fresh nonce and wait for that.
 */
export async function waitReceipt(hash: Hex, timeoutMs = 120_000): Promise<any> {
  const end = Date.now() + timeoutMs;
  let lastCheck = Date.now();
  while (Date.now() < end) {
    const r = await call("eth_getTransactionReceipt", [hash]);
    if (r) return r;
    const mine = sent.get(hash);
    if (mine && Date.now() - lastCheck > 15_000) {
      lastCheck = Date.now();
      if (!(await call("eth_getTransactionByHash", [hash]))) {
        try {
          await call("eth_sendRawTransaction", [mine.raw]);
        } catch (e) {
          if (/nonce/i.test((e as Error).message)) {
            const fresh = await sendLegacy(mine.key, mine.tx);
            return waitReceipt(fresh, Math.max(30_000, end - Date.now()));
          }
        }
      }
    }
    await sleep(2000);
  }
  throw new Error(`tx ${hash} not mined within ${timeoutMs / 1000}s`);
}

/** Legacy tx (deployments, plain transfers) through the gateway, which forwards it to ethrex. */
export async function sendLegacy(key: Hex, tx: LegacyTx): Promise<Hex> {
  const acct = privateKeyToAccount(key);
  // Right after a tx is mined, the pending count can briefly lag the mined one: take the larger.
  const [latest, pending] = await Promise.all([nonceOf(acct.address, "latest"), nonceOf(acct.address, "pending")]);
  const raw = await acct.signTransaction({
    type: "legacy",
    chainId: devnet.chainId,
    nonce: Number(latest > pending ? latest : pending),
    to: tx.to,
    value: tx.value ?? 0n,
    data: tx.data ?? "0x",
    gas: tx.gas ?? 250_000n,
    gasPrice: devnet.legacyGasPriceWei,
  });
  const hash = (await call("eth_sendRawTransaction", [raw])) as Hex;
  sent.set(hash, { key, tx, raw });
  return hash;
}

/** The devnet faucet: 1 ETH, once an hour per address. */
export async function faucet(to: Address): Promise<Hex> {
  const { txHash } = await call("skandha_explorer_faucet", [to]);
  const r = await waitReceipt(txHash);
  if (r.status !== "0x1") throw new Error(`faucet transfer ${txHash} reverted`);
  return txHash;
}
