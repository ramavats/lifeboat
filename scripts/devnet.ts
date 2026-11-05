/**
 * Drive a Lifeboat account on the public alt-mempool devnet.
 *   pnpm devnet deploy      fund a throwaway key, deploy + stake a LifeboatAccount
 *   pnpm devnet send        send 1 gwei from the account (HYBRID: ECDSA + XMSS)
 *   pnpm devnet status      print account state
 * State (throwaway devnet key, XMSS seed, journal) lives in .lifeboat-state.json (gitignored).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { explainRejection } from "@forshtat/hegota-support/rpc";
import { bytesToHex, encodeDeployData, hexToBytes, type Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Journal } from "../src/pq/journal.js";
import { keygen } from "../src/pq/xmss.js";
import { balanceOf, devnet, faucet, sendLegacy, waitReceipt } from "../src/frame/devnet.js";
import { buildTx, calldata, readState, send, signTx, status } from "../src/frame/lifeboat.js";

const STATE = new URL("../.lifeboat-state.json", import.meta.url);
const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776" as Address; // workshop demo recipient

interface State {
  ownerKey: Hex;
  seed: Hex;
  height: number;
  account?: Address;
  journal: Record<string, string>;
  txs: { hash: Hex; leaf: number; what: string }[];
}

function load(): State {
  if (existsSync(STATE)) return JSON.parse(readFileSync(STATE, "utf8"));
  const s: State = {
    ownerKey: generatePrivateKey(),
    seed: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
    height: 10,
    journal: {},
    txs: [],
  };
  save(s);
  return s;
}
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s, null, 2));

function keys(s: State) {
  const t = performance.now();
  const kp = keygen(hexToBytes(s.seed), s.height);
  console.log(`  xmss keys: 2^${s.height} one-time keys in ${((performance.now() - t) / 1000).toFixed(1)}s, root ${bytesToHex(kp.pub.root)}`);
  return kp;
}

async function deploy() {
  const s = load();
  const owner = privateKeyToAccount(s.ownerKey).address;
  console.log(`owner (throwaway devnet key): ${owner}`);
  if ((await balanceOf(owner)) < 100_000_000_000_000_000n) {
    console.log("  asking the faucet for 1 ETH…");
    console.log(`  faucet tx ${await faucet(owner)}`);
  }
  const kp = keys(s);
  const artifact = JSON.parse(readFileSync(new URL("../out/LifeboatAccount.json", import.meta.url), "utf8"));
  const data = encodeDeployData({
    abi: artifact.abi as Abi,
    bytecode: artifact.bytecode as Hex,
    args: [owner, bytesToHex(kp.pub.pubSeed), bytesToHex(kp.pub.root), BigInt(s.height), devnet.stakingRegistry, devnet.stakeWei, devnet.unstakeDelaySec],
  });
  const value = devnet.stakeWei + 30_000_000_000_000_000n; // stake + 0.03 ETH for gas
  const hash = await sendLegacy(s.ownerKey, { to: null, data, value, gas: devnet.deployGasLimit });
  console.log(`  deploy tx ${hash}`);
  const r = await waitReceipt(hash);
  if (r.status !== "0x1" || !r.contractAddress) throw new Error(`deploy reverted (gas used ${BigInt(r.gasUsed)})`);
  s.account = r.contractAddress;
  save(s);
  console.log(`LifeboatAccount ${s.account}, balance ${Number(await balanceOf(s.account!)) / 1e18} ETH, gas used ${BigInt(r.gasUsed)}`);
}

async function sendOne(what = "transfer 1 gwei") {
  const s = load();
  if (!s.account) throw new Error("no account yet: run `pnpm devnet deploy`");
  const owner = privateKeyToAccount(s.ownerKey).address;
  const kp = keys(s);
  const st = await readState(s.account);
  console.log(`  account ${s.account}: mode ${st.mode}, nonce ${st.nonce}, nonceBase ${st.nonceBase}`);

  const journal = Journal.fromJSON(s.journal);
  const unsigned = buildTx({ account: s.account, owner, nonce: st.nonce, mode: st.mode, senderData: calldata.execute(RECIPIENT, 1_000_000_000n) });
  const { tx, leaf, sigHash } = await signTx(unsigned, { mode: st.mode, ecdsaKey: s.ownerKey, kp, journal, nonceBase: st.nonceBase });
  s.journal = journal.toJSON();
  save(s); // persist the journal before broadcasting
  console.log(`  sigHash ${sigHash}, one-time key ${leaf} of ${2 ** s.height}, XMSS sig ${(tx.signatures.at(-1)!.signature.length - 2) / 2} bytes, VERIFY limit ${tx.frames[0]!.limits.execution}`);

  let hash: Hex;
  try {
    hash = await send(tx);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`  REJECTED: ${msg}\n  rule: ${explainRejection(msg).rule}`);
    process.exit(1);
  }
  console.log(`  admitted by the alt mempool: ${hash}`);
  s.txs.push({ hash, leaf, what });
  save(s);
  const r = await waitReceipt(hash);
  console.log(`  mined in block ${BigInt(r.blockNumber)}, status ${r.status}, frames ${JSON.stringify((r.frameReceipts ?? []).map((f: any) => f.status))}`);
  console.log(`  explorer: ${devnet.explorerUrl} (search ${hash})`);
}

async function showStatus() {
  const s = load();
  console.log(JSON.stringify({ owner: privateKeyToAccount(s.ownerKey).address, account: s.account, txs: s.txs }, null, 2));
  if (s.account) console.log(await readState(s.account), `balance ${Number(await balanceOf(s.account)) / 1e18} ETH`);
  for (const t of s.txs.slice(-3)) console.log(t.hash, await status(t.hash).catch((e: Error) => e.message));
}

const cmd = process.argv[2];
const run = cmd === "deploy" ? deploy : cmd === "send" ? () => sendOne() : cmd === "status" ? showStatus : null;
if (!run) {
  console.log("usage: pnpm devnet <deploy|send|status>");
  process.exit(1);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
