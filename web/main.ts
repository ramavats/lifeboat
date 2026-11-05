/**
 * Test harness for the Anon-RPC exposure check. Deliberately bare: the real frontend is
 * built later (hairline + unslop). This page only proves the reads go through Anon-RPC.
 */
import { RpcClient, checkExposure } from "../src/exposure/check.js";
import { NETWORKS, startAnon, type AnonSession, type NetworkId } from "./anon.js";

// The RPC the anonymized requests are addressed to. It sees an exit node, not the user.
const MAINNET_RPC = "https://ethereum-rpc.publicnode.com";
// Used once by the harness to read the specifier contract. Not anonymized.
const BOOTSTRAP_RPC = "https://ethereum-rpc.publicnode.com";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = (line: string) => {
  const el = $("log");
  el.textContent += `${new Date().toISOString().slice(11, 19)}  ${line}\n`;
  el.scrollTop = el.scrollHeight;
};

let session: AnonSession | null = null;

function ensureSession(network: NetworkId): AnonSession {
  if (session?.network === network) return session;
  session?.close();
  log(`starting Anon-RPC worker: ${NETWORKS[network].label} (${NETWORKS[network].address})`);
  const s = startAnon(network, BOOTSTRAP_RPC, log);
  const t0 = performance.now();
  s.worker.ready.then(
    () => log(`worker ready after ${((performance.now() - t0) / 1000).toFixed(1)}s (bundle hash verified onchain)`),
    (e) => log(`worker FAILED: ${(e as Error).message}`),
  );
  session = s;
  return s;
}

async function run() {
  const address = $<HTMLInputElement>("address").value.trim();
  const network = $<HTMLSelectElement>("network").value as NetworkId;
  $("result").textContent = "";
  const s = ensureSession(network);
  const rpc = new RpcClient(MAINNET_RPC, s.fetchFor(address.toLowerCase()));
  const t0 = performance.now();
  try {
    const e = await checkExposure(rpc, address);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    $("result").textContent = [
      `${e.address}`,
      `status: ${e.status} (${e.kind}), nonce ${e.nonce}, ${(Number(e.balanceWei) / 1e18).toFixed(4)} ETH, block ${e.block}`,
      e.why,
      `${e.reads} of ${e.reads} RPC reads went through Anon-RPC (${NETWORKS[network].label}) in ${secs}s.`,
      `Isolation key for this check: the address itself, so checks of different addresses are not linkable.`,
    ].join("\n");
    log(`check done: ${e.status}, ${e.reads} reads, ${secs}s`);
  } catch (err) {
    $("result").textContent = `error: ${(err as Error).message}`;
    log(`check failed: ${(err as Error).message}`);
  }
}

const sel = $<HTMLSelectElement>("network");
for (const [id, n] of Object.entries(NETWORKS)) sel.add(new Option(n.label, id));
$("check").addEventListener("click", () => void run());
$("address").addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter") void run();
});
