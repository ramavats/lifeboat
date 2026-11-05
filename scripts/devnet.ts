/**
 * The Lifeboat demo on the public alt-mempool devnet, one step per command:
 *   pnpm devnet setup      deploy LifeboatFactory, MigrationSponsor (staked, funded), DemoToken
 *   pnpm devnet expose     make an "exposed" EOA: fund it, send one tx, mint it some dUSD
 *   pnpm devnet check      exposure check for the exposed EOA
 *   pnpm devnet migrate    create its Lifeboat account and move everything in one sponsored tx
 *   pnpm devnet send       send 1 gwei from the Lifeboat account (mode read from chain)
 *   pnpm devnet pq-only    switch the Lifeboat account to quantum-safe only
 *   pnpm devnet attack     try to spend with the stolen ECDSA key and a forged PQ signature
 *   pnpm devnet publish [txHash]   opt in: list a migration on the public Arkiv log (verified from chain);
 *                                  without a hash, this script's own last migration
 *   pnpm devnet fund <address> [eth]   send devnet ETH from the operator (when the faucet is empty)
 *   pnpm devnet status
 * Throwaway devnet keys, the XMSS seed and the one-time-key journal live in
 * .lifeboat-state.json (gitignored).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { explainRejection } from "@forshtat/hegota-support/rpc";
import * as ftx from "@forshtat/hegota-support/tx";
import {
  bytesToHex,
  decodeErrorResult,
  decodeEventLog,
  encodeDeployData,
  encodeFunctionData,
  hexToBytes,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Journal } from "../src/pq/journal.js";
import { keygen, type KeyPair } from "../src/pq/xmss.js";
import { balanceOf, call, devnet, faucet, nonceOf, profile, sendLegacy, waitReceipt } from "../src/frame/devnet.js";
import { buildTx, calldata, readState, send, signTx, waitFrameTx, type Mode } from "../src/frame/lifeboat.js";
import { buildMigrationTx, summarizeMigrationTx } from "../src/frame/migrate.js";
import { publishMigration, readMigrations } from "../src/arkiv/log.js";
import { arkivKey } from "./arkiv-key.js";

const STATE = new URL("../.lifeboat-state.json", import.meta.url);
const RECIPIENT = "0x8943545177806ED17B9F23F0a21ee5948eCaa776" as Address;
const ETH = 1_000_000_000_000_000_000n;

interface State {
  operatorKey: Hex;
  exposedKey: Hex;
  seed: Hex;
  height: number;
  factory?: Address;
  sponsor?: Address;
  token?: Address;
  lifeboat?: Address;
  journal: Record<string, string>;
  log: { step: string; hash: Hex; note?: string }[];
}

function load(): State {
  if (existsSync(STATE)) {
    const s = JSON.parse(readFileSync(STATE, "utf8"));
    if (s.operatorKey) return s;
  }
  const s: State = {
    operatorKey: generatePrivateKey(),
    exposedKey: generatePrivateKey(),
    seed: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
    height: 10,
    journal: {},
    log: [],
  };
  save(s);
  return s;
}
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s, null, 2));
const addr = (k: Hex) => privateKeyToAccount(k).address;
const fmt = (wei: bigint, dec = 18, places = 4) => (Number(wei) / 10 ** dec).toFixed(places);
const artifact = (name: string) =>
  JSON.parse(readFileSync(new URL(`../out/${name}.json`, import.meta.url), "utf8")) as { abi: Abi; bytecode: Hex };
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function mint(address to, uint256 amount)"]);

/** Decode a revert from any of our contracts into `ErrorName(args)`. */
function decodeRevert(data: Hex): string | null {
  for (const name of ["LifeboatAccount", "MigrationSponsor"]) {
    try {
      const e = decodeErrorResult({ abi: artifact(name).abi, data });
      return `${name}.${e.errorName}(${(e.args ?? []).map(String).join(", ")})`;
    } catch {}
  }
  return null;
}

async function tokenBalance(token: Address, who: Address): Promise<bigint> {
  return BigInt(await call("eth_call", [{ to: token, data: encodeFunctionData({ abi: erc20, functionName: "balanceOf", args: [who] }) }, "latest"]));
}

async function ensureFunds(key: Hex, min = ETH / 10n) {
  if ((await balanceOf(addr(key))) >= min) return;
  try {
    console.log(`  faucet → ${addr(key)}`);
    await faucet(addr(key));
  } catch (e) {
    // The shared faucet runs dry: fund from the operator instead.
    const op = load().operatorKey;
    if (key === op) throw e;
    console.log(`  faucet unavailable (${(e as Error).message}); funding from the operator`);
    await waitReceipt(await sendLegacy(op, { to: addr(key), value: min, gas: 210_000n }));
  }
}

async function deploy(s: State, name: string, args: unknown[], value = 0n): Promise<Address> {
  const a = artifact(name);
  const hash = await sendLegacy(s.operatorKey, { to: null, data: encodeDeployData({ abi: a.abi, bytecode: a.bytecode, args }), value, gas: devnet.deployGasLimit });
  const r = await waitReceipt(hash);
  if (r.status !== "0x1" || !r.contractAddress) throw new Error(`${name} deploy reverted`);
  console.log(`  ${name} ${r.contractAddress}`);
  return r.contractAddress;
}

function keys(s: State): KeyPair {
  const t = performance.now();
  const kp = keygen(hexToBytes(s.seed), s.height);
  console.log(`  ${2 ** s.height} quantum-safe one-time keys derived in ${((performance.now() - t) / 1000).toFixed(1)}s`);
  return kp;
}

async function submit(s: State, step: string, t: ftx.FrameTx, note?: string): Promise<Hex | null> {
  let hash: Hex;
  try {
    hash = await send(t);
  } catch (e) {
    const msg = (e as Error).message;
    console.log(`  REJECTED by the mempool: ${msg}`);
    const data = msg.match(/reverted with data (0x[0-9a-fA-F]+)/)?.[1] as Hex | undefined;
    const reason = data ? decodeRevert(data) : null;
    console.log(reason ? `  reason: ${reason}` : `  rule family: ${explainRejection(msg).rule}`);
    return null;
  }
  console.log(`  admitted: ${hash}`);
  s.log.push({ step, hash, note });
  save(s);
  const r = await waitFrameTx(t, hash);
  console.log(`  mined in block ${BigInt(r.blockNumber)}, status ${r.status}, frames ${JSON.stringify((r.frameReceipts ?? []).map((f: any) => f.status))}`);
  if (r.status !== "0x1") throw new Error(`${step} tx failed onchain`);
  return hash;
}

// ---------------------------------------------------------------------------------------------

async function setup() {
  const s = load();
  console.log(`operator ${addr(s.operatorKey)}`);
  await ensureFunds(s.operatorKey, ETH / 2n);
  s.factory = await deploy(s, "LifeboatFactory", []);
  // Staked (it reads the factory's storage during validation) and funded to pay for migrations.
  s.sponsor = await deploy(s, "MigrationSponsor", [s.factory, devnet.stakingRegistry, devnet.stakeWei, devnet.unstakeDelaySec], devnet.stakeWei + ETH / 5n);
  s.token = await deploy(s, "DemoToken", []);
  save(s);
}

async function expose() {
  const s = load();
  const exposed = addr(s.exposedKey);
  console.log(`exposed EOA ${exposed}`);
  await ensureFunds(s.exposedKey);
  // One ordinary transaction publishes the key's public key onchain.
  const h = await sendLegacy(s.exposedKey, { to: RECIPIENT, value: 1_000_000_000n, gas: 210_000n });
  await waitReceipt(h);
  console.log(`  sent an ordinary tx ${h}: its public key is now visible onchain`);
  const mint = await sendLegacy(s.operatorKey, {
    to: s.token!,
    data: encodeFunctionData({ abi: erc20, functionName: "mint", args: [exposed, 2_400_000_000n] }),
    gas: 300_000n,
  });
  await waitReceipt(mint);
  console.log(`  minted 2,400.00 dUSD to it`);
}

async function check() {
  const s = load();
  const who = (process.argv[3] as Address | undefined) ?? addr(s.exposedKey);
  const nonce = await nonceOf(who);
  const bal = await balanceOf(who);
  const dusd = s.token ? await tokenBalance(s.token, who) : 0n;
  console.log(`${who}`);
  console.log(nonce > 0n
    ? `  Exposed: this address has sent ${nonce} transaction(s), and each one publishes its public key`
    : `  Not exposed yet: its public key has never been published`);
  console.log(`  holds ${fmt(bal)} ETH, ${fmt(dusd, 6, 2)} dUSD`);
}

async function migrate() {
  const s = load();
  const exposed = addr(s.exposedKey);
  const kp = keys(s);
  const f = artifact("LifeboatFactory");
  const args = [exposed, bytesToHex(kp.pub.pubSeed), bytesToHex(kp.pub.root), BigInt(s.height)] as const;
  const predicted = (await call("eth_call", [{ to: s.factory!, data: encodeFunctionData({ abi: f.abi, functionName: "predict", args }) }, "latest"])) as Hex;
  s.lifeboat = `0x${predicted.slice(26)}` as Address;
  save(s);
  const exists = (await call("eth_getCode", [s.lifeboat, "latest"])) !== "0x";
  console.log(`  Lifeboat account ${s.lifeboat} ${exists ? "(exists)" : "(created in the same transaction)"}`);

  const eth = await balanceOf(exposed);
  const dusd = await tokenBalance(s.token!, exposed);
  const sponsorBefore = await balanceOf(s.sponsor!);
  console.log(`  moving ${fmt(eth)} ETH (all of it: gas is sponsored) and ${fmt(dusd, 6, 2)} dUSD`);

  const unsigned = buildMigrationTx({
    exposed,
    lifeboat: s.lifeboat,
    sponsor: s.sponsor!,
    nonce: await nonceOf(exposed),
    eth,
    tokens: dusd > 0n ? [{ token: s.token!, amount: dusd }] : [],
    create: exists ? undefined : { factory: s.factory!, pubSeed: args[1], root: args[2], height: args[3] },
  });
  const signed = await ftx.signTx(profile, unsigned, s.exposedKey, 0);
  if (!(await submit(s, "migrate", signed))) return;

  console.log(`  old EOA now: ${fmt(await balanceOf(exposed))} ETH, ${fmt(await tokenBalance(s.token!, exposed), 6, 2)} dUSD`);
  console.log(`  Lifeboat:    ${fmt(await balanceOf(s.lifeboat!))} ETH, ${fmt(await tokenBalance(s.token!, s.lifeboat!), 6, 2)} dUSD`);
  console.log(`  sponsor paid ${fmt(sponsorBefore - (await balanceOf(s.sponsor!)), 18, 6)} ETH of gas`);
}

async function spend(senderData: Hex, step: string) {
  const s = load();
  if (!s.lifeboat) throw new Error("migrate first");
  const kp = keys(s);
  const st = await readState(s.lifeboat);
  const journal = Journal.fromJSON(s.journal);
  const unsigned = buildTx({ account: s.lifeboat, owner: addr(s.exposedKey), nonce: st.nonce, mode: st.mode, senderData });
  const { tx, leaf } = await signTx(unsigned, { mode: st.mode, ecdsaKey: s.exposedKey, kp, journal, nonceBase: st.nonceBase });
  s.journal = journal.toJSON();
  save(s); // journal first, broadcast second
  console.log(`  ${st.mode}: ${st.mode === "HYBRID" ? "ECDSA + " : ""}quantum-safe signature, one-time key ${leaf} of ${2 ** s.height}`);
  await submit(s, step, tx);
}

async function attack() {
  const s = load();
  if (!s.lifeboat) throw new Error("migrate first");
  const st = await readState(s.lifeboat);
  console.log(`  attacker holds the old ECDSA private key (as a quantum computer would) but no quantum-safe key`);
  const mode: Mode = st.mode;
  const t = buildTx({ account: s.lifeboat, owner: addr(s.exposedKey), nonce: st.nonce, mode, senderData: calldata.execute(RECIPIENT, await balanceOf(s.lifeboat)) });
  let forged = t;
  if (mode === "HYBRID") forged = await ftx.signTx(profile, t, s.exposedKey, 0);
  // Without the seed, the best an attacker can do is a correctly sized signature of random bytes.
  const pqIndex = mode === "HYBRID" ? 1 : 0;
  const junk = bytesToHex(crypto.getRandomValues(new Uint8Array(8 + 128 * 32 + s.height * 32)));
  forged = { ...forged, signatures: forged.signatures.map((e, i) => (i === pqIndex ? { ...e, signature: junk } : e)) };
  const res = await submit(s, "attack", forged, "should be rejected");
  console.log(res ? "  !!! attack admitted: investigate" : "  funds stay put");
}

/** The sponsor's guardrails, and the canonical mempool's verdict on the same valid migration. */
async function sponsorChecks() {
  const s = load();
  const kp = keys(s);
  const f = artifact("LifeboatFactory");

  // A second exposed EOA with its own Lifeboat account.
  const k2 = generatePrivateKey();
  const a2 = addr(k2);
  console.log(`exposed EOA #2 ${a2}`);
  await ensureFunds(k2);
  await waitReceipt(await sendLegacy(k2, { to: RECIPIENT, value: 1n, gas: 210_000n }));
  const created = await waitReceipt(await sendLegacy(s.operatorKey, {
    to: s.factory!,
    data: encodeFunctionData({ abi: f.abi, functionName: "create", args: [a2, bytesToHex(kp.pub.pubSeed), bytesToHex(kp.pub.root), BigInt(s.height)] }),
    gas: devnet.deployGasLimit,
  }));
  let lifeboat2: Address | undefined;
  for (const log of created.logs) {
    try {
      const ev = decodeEventLog({ abi: f.abi, data: log.data, topics: log.topics }) as any;
      if (ev.eventName === "Created") lifeboat2 = ev.args.account;
    } catch {}
  }
  console.log(`  its Lifeboat account ${lifeboat2}`);

  const plan = async (to: Address, key: Hex) =>
    ftx.signTx(profile, buildMigrationTx({ exposed: addr(key), lifeboat: to, sponsor: s.sponsor!, nonce: await nonceOf(addr(key)), eth: 1_000_000n, tokens: [] }), key, 0);

  console.log("1. sponsored migration into an address that is not a Lifeboat account");
  await submit(s, "check", await plan(RECIPIENT, k2), "expect NotALifeboat");

  console.log("2. the same valid migration, sent to the canonical (public) mempool instead");
  try {
    const raw = ftx.encodeTx(profile, await plan(lifeboat2!, k2));
    const h = await call("eth_sendRawTransaction", [raw]);
    console.log(`  !!! canonical mempool accepted it: ${h}`);
  } catch (e) {
    console.log(`  canonical mempool REJECTED it: ${(e as Error).message}`);
  }

  console.log("3. an EOA that has never sent a transaction (key not exposed)");
  const k3 = generatePrivateKey();
  await ensureFunds(k3);
  await submit(s, "check", await plan(lifeboat2!, k3), "expect NotExposed");

  console.log("4. the valid migration through the alt mempool");
  await submit(s, "check", await plan(lifeboat2!, k2), "expect admitted");

  console.log("5. a second sponsored migration for the same EOA");
  await submit(s, "check", await plan(lifeboat2!, k2), "expect AlreadySponsored");
}

/**
 * Opt-in: publish the completed migration to the public Arkiv log. Every field comes from the
 * devnet: the mined migration transaction's own frames, its receipt, and the factory registry.
 * (The devnet node keeps no historical state, so we read what the tx moved, not old balances.)
 */
/** Deployments whose migrations the log accepts: the current one and the first (pre-CREATE2). */
const FIRST_DEPLOYMENT = {
  factory: "0xb343620fe0f4125acb960e7613ddcd7a3ce0f494" as Address,
  sponsor: "0x4b94121f0343a95c90e9fd6bb3e0d6fa7448ed0c" as Address,
  token: "0x53af43f3d696bef8e7fb022b8a707f7103f952a0" as Address,
};

async function publish() {
  const s = load();
  const arg = process.argv[3] as Hex | undefined;
  const hash = arg ?? [...s.log].reverse().find((l) => l.step === "migrate")?.hash;
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("usage: pnpm devnet publish [migration tx hash]");
  const m = { hash };

  const r = await waitReceipt(m.hash);
  const failed = (r.frameReceipts ?? []).some((f: any) => f.status !== "0x1");
  if (r.status !== "0x1" || failed) throw new Error("migration tx did not fully succeed");
  const t = await call("eth_getTransactionByHash", [m.hash]);
  const summary = summarizeMigrationTx(t);
  const deployments = [{ factory: s.factory!, sponsor: s.sponsor!, token: s.token! }, FIRST_DEPLOYMENT];
  const isLifeboat = async (factory: Address) =>
    BigInt(await call("eth_call", [{ to: factory, data: encodeFunctionData({ abi: artifact("LifeboatFactory").abi, functionName: "isLifeboat", args: [summary.lifeboat] }) }, "latest"])) === 1n;
  let dep: (typeof deployments)[number] | undefined;
  for (const d of deployments) if (await isLifeboat(d.factory)) { dep = d; break; }
  if (!dep) throw new Error("destination is not a registered Lifeboat account of any known factory");

  const tokenText = summary.tokens.map((x) =>
    x.token === dep!.token.toLowerCase() ? `${(Number(x.amount) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2 })} dUSD` : `${x.amount} of ${x.token}`,
  );
  const record = {
    exposed: summary.exposed,
    lifeboat: summary.lifeboat,
    chainId: devnet.chainId,
    block: BigInt(r.blockNumber),
    txHash: m.hash,
    sponsored: summary.sponsor === dep.sponsor.toLowerCase(),
    ethWei: summary.ethWei,
    assets: [`${fmt(summary.ethWei)} ETH`, ...tokenText].join(", "),
  };
  console.log(`  verified from tx ${m.hash.slice(0, 10)}… (block ${record.block}): ${record.assets}, sponsored ${record.sponsored}`);

  const key = arkivKey();
  const listed = await readMigrations(key.address, { lifeboat: summary.lifeboat });
  if (listed.some((row) => row.txHash.toLowerCase() === m.hash.toLowerCase())) {
    console.log(`  already listed: entity ${listed[0]!.key}`);
    return;
  }
  const { entityKey, txHash } = await publishMigration(key.privateKey, record);
  console.log(`  listed on Arkiv: entity ${entityKey}`);
  console.log(`  arkiv tx ${txHash}, publisher ${key.address}`);
  const rows = await readMigrations(key.address, { lifeboat: summary.lifeboat });
  console.log(`  read back: ${rows.length} entr${rows.length === 1 ? "y" : "ies"} for this Lifeboat account`);
}

/** Fund any address from the operator key: the faucet is shared and can run dry. */
async function fund() {
  const s = load();
  const to = process.argv[3] as Address | undefined;
  if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error("usage: pnpm devnet fund <address> [eth]");
  const amount = BigInt(Math.round(Number(process.argv[4] ?? "0.1") * 1e6)) * 1_000_000_000_000n;
  const h = await sendLegacy(s.operatorKey, { to, value: amount, gas: 210_000n });
  await waitReceipt(h);
  console.log(`sent ${fmt(amount)} ETH to ${to} (${h}); operator has ${fmt(await balanceOf(addr(s.operatorKey)))} ETH left`);
}

async function status() {
  const s = load();
  console.log(JSON.stringify({ operator: addr(s.operatorKey), exposed: addr(s.exposedKey), factory: s.factory, sponsor: s.sponsor, token: s.token, lifeboat: s.lifeboat }, null, 2));
  if (s.lifeboat) console.log(await readState(s.lifeboat), `${fmt(await balanceOf(s.lifeboat))} ETH`);
  for (const l of s.log) console.log(`  ${l.step.padEnd(8)} ${l.hash}`);
}

const commands: Record<string, () => Promise<void>> = {
  setup,
  expose,
  check,
  migrate,
  send: () => spend(calldata.execute(RECIPIENT, 1_000_000_000n), "send"),
  "pq-only": () => spend(calldata.enablePqOnly(), "pq-only"),
  attack,
  "sponsor-checks": sponsorChecks,
  publish,
  fund,
  status,
};
const run = commands[process.argv[2] ?? ""];
if (!run) {
  console.log(`usage: pnpm devnet <${Object.keys(commands).join("|")}>`);
  process.exit(1);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
