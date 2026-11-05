/**
 * Exposure check from the command line, against Ethereum mainnet.
 *   pnpm exposure <address> [<address> …]
 * NOTE: this Node path talks to the RPC directly, so the provider sees your IP and the
 * addresses. Anon-RPC is browser-only; the web page (web/) routes the same reads through it.
 */
import { RpcClient, checkExposure } from "../src/exposure/check.js";

const url = process.env.MAINNET_RPC ?? "https://ethereum-rpc.publicnode.com";
const addrs = process.argv.slice(2);
if (!addrs.length) {
  console.log("usage: pnpm exposure <address> [...]");
  process.exit(1);
}
const rpc = new RpcClient(url);
console.log(`(direct, not anonymous: ${url})`);
for (const a of addrs) {
  const e = await checkExposure(rpc, a);
  console.log(`${a}  ${e.status}  ${(Number(e.balanceWei) / 1e18).toFixed(4)} ETH  block ${e.block}\n  ${e.why}`);
}
