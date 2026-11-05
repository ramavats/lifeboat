import { getProfile } from "@forshtat/hegota-support/profiles";
import { rpc } from "@forshtat/hegota-support/rpc";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

/** The public ERC-8421 alt-mempool devnet (verified live Nov 5, 2026). */
export const devnet = {
  chainId: 1337,
  gatewayUrl: process.env.LIFEBOAT_GATEWAY ?? "https://altmempoolgateway.forshtat.com/rpc",
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

export const call = (method: string, params: unknown[] = []) => rpc(devnet.gatewayUrl, method, params);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function balanceOf(a: Address): Promise<bigint> {
  return BigInt(await call("eth_getBalance", [a, "latest"]));
}

export async function nonceOf(a: Address, tag: "latest" | "pending" = "latest"): Promise<bigint> {
  return BigInt(await call("eth_getTransactionCount", [a, tag]));
}

export async function waitReceipt(hash: Hex, timeoutMs = 120_000): Promise<any> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await call("eth_getTransactionReceipt", [hash]);
    if (r) return r;
    await sleep(2000);
  }
  throw new Error(`tx ${hash} not mined within ${timeoutMs / 1000}s`);
}

/** Legacy tx (deployments, plain transfers) through the gateway, which forwards it to ethrex. */
export async function sendLegacy(key: Hex, tx: { to: Address | null; value?: bigint; data?: Hex; gas?: bigint }): Promise<Hex> {
  const acct = privateKeyToAccount(key);
  const nonce = Number(await nonceOf(acct.address, "pending"));
  const raw = await acct.signTransaction({
    type: "legacy",
    chainId: devnet.chainId,
    nonce,
    to: tx.to,
    value: tx.value ?? 0n,
    data: tx.data ?? "0x",
    gas: tx.gas ?? 250_000n,
    gasPrice: devnet.legacyGasPriceWei,
  });
  return (await call("eth_sendRawTransaction", [raw])) as Hex;
}

/** The devnet faucet: 1 ETH, once an hour per address. */
export async function faucet(to: Address): Promise<Hex> {
  const { txHash } = await call("skandha_explorer_faucet", [to]);
  const r = await waitReceipt(txHash);
  if (r.status !== "0x1") throw new Error(`faucet transfer ${txHash} reverted`);
  return txHash;
}
