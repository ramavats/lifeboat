import * as tx from "@forshtat/hegota-support/tx";
import type { FrameTx } from "@forshtat/hegota-support/tx";
import { encodeFunctionData, parseAbi, toFunctionSelector, type Address, type Hex } from "viem";
import { devnet, profile } from "./devnet.js";

const sponsorAbi = parseAbi(["function sponsor(address lifeboat)", "function recordSponsorship()"]);
const erc20Abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
const factoryAbi = parseAbi(["function create(address owner, bytes32 pubSeed, bytes32 root, uint256 height) payable returns (address)"]);
const CREATE_SELECTOR = toFunctionSelector("create(address,bytes32,bytes32,uint256)");
/**
 * Gas for the create frame, measured with ethrex_simulateFrameTransaction on the devnet: creating
 * an account uses ~158k execution gas but ~7.7M state gas (it stores the account and its opcode
 * helpers). Too little state gas makes a nested deploy halt and swallow its execution gas.
 */
export const CREATE_LIMITS = { execution: 400_000n, state: 8_500_000n };

/** EIP-8141 ATOMIC_BATCH_FLAG: this frame and the next SENDER frame succeed or fail together. */
const ATOMIC_BATCH = 0x4;

/** Gas the EOA's own VERIFY and the sponsor's VERIFY may declare: 100k minus the ECDSA sig cost. */
const EOA_VERIFY_GAS = 20_000n;
const SPONSOR_VERIFY_GAS = 100_000n - 2_800n - EOA_VERIFY_GAS;

export interface MigrationPlan {
  exposed: Address;
  lifeboat: Address;
  sponsor: Address;
  nonce: bigint;
  /** Wei to move. Gas is sponsored, so this can be the whole balance. */
  eth: bigint;
  tokens: { token: Address; amount: bigint }[];
  /** When the Lifeboat account doesn't exist yet: create it in the same sponsored tx. */
  create?: { factory: Address; pubSeed: Hex; root: Hex; height: bigint };
}

/**
 * One frame transaction from the exposed EOA that moves everything into its Lifeboat account,
 * gas paid by the MigrationSponsor:
 *   [VERIFY(EXECUTION) self] [VERIFY(PAYMENT) sponsor] [SENDER moves… atomic] [DEFAULT record]
 */
export function buildMigrationTx(p: MigrationPlan): FrameTx {
  const moves: { target: Address; value: bigint; data: Hex; execution: bigint; state: bigint }[] = [];
  if (p.eth > 0n) moves.push({ target: p.lifeboat, value: p.eth, data: "0x", execution: 30_000n, state: 0n });
  for (const t of p.tokens) {
    moves.push({
      target: t.token,
      value: 0n,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [p.lifeboat, t.amount] }),
      execution: 60_000n,
      state: 250_000n,
    });
  }
  if (moves.length === 0) throw new Error("nothing to migrate");
  if (p.create) {
    // Deploying the account (and its opcode helpers) costs ~7.5M gas; the sponsor pays it.
    moves.unshift({
      target: p.create.factory,
      value: 0n,
      data: encodeFunctionData({ abi: factoryAbi, functionName: "create", args: [p.exposed, p.create.pubSeed, p.create.root, p.create.height] }),
      execution: CREATE_LIMITS.execution,
      state: CREATE_LIMITS.state,
    });
  }

  const frames = [
    tx.frame(profile, "VERIFY", { scope: "EXECUTION", target: null, execution: EOA_VERIFY_GAS }),
    tx.frame(profile, "VERIFY", {
      scope: "PAYMENT",
      target: p.sponsor,
      execution: SPONSOR_VERIFY_GAS,
      data: encodeFunctionData({ abi: sponsorAbi, functionName: "sponsor", args: [p.lifeboat] }),
    }),
    ...moves.map((m, i) =>
      tx.frame(profile, "SENDER", {
        target: m.target,
        value: m.value,
        data: m.data,
        execution: m.execution,
        state: m.state,
        // Chain every move to the next one so the migration is all-or-nothing.
        flags: i < moves.length - 1 ? ATOMIC_BATCH : 0,
      }),
    ),
    tx.frame(profile, "DEFAULT", {
      target: p.sponsor,
      execution: 60_000n,
      state: 100_000n,
      data: encodeFunctionData({ abi: sponsorAbi, functionName: "recordSponsorship", args: [] }),
    }),
  ];

  return tx.newTx({
    chainId: devnet.chainId,
    sender: p.exposed,
    nonceSeq: p.nonce,
    frames,
    signatures: [tx.secp256k1Placeholder(profile)],
    // The base fee here is a few wei: a small tip keeps the sponsor's cost per migration low.
    // (2.5 gwei / 0.002 gwei sit 10%+ above earlier attempts, so a stuck one gets replaced.)
    fees: { maxFeePerGas: 2_500_000_000n, maxPriorityFeePerGas: 2_000_000n },
  });
}

/** What a mined migration transaction moved, read from its own frames (no historical state needed). */
export interface MigrationSummary {
  exposed: Address;
  lifeboat: Address;
  sponsor: Address | null;
  ethWei: bigint;
  tokens: { token: Address; amount: bigint }[];
  /** Whether the same transaction created the Lifeboat account. */
  created: boolean;
}

const TRANSFER_SELECTOR = "0xa9059cbb";
const SPONSOR_SELECTOR = "0x766c4f37"; // sponsor(address)

/**
 * Parse a frame transaction as returned by eth_getTransactionByHash on the devnet node and
 * check it has the migration shape. Throws if any SENDER frame moves value anywhere but the
 * Lifeboat account, the same rule the sponsor enforces during validation.
 */
export function summarizeMigrationTx(t: {
  sender: string;
  frames: { mode: string; to: string | null; value: string; data: string }[];
}): MigrationSummary {
  const exposed = t.sender.toLowerCase() as Address;
  const sponsorFrame = t.frames.find((f) => Number(f.mode) === 1 && f.data.toLowerCase().startsWith(SPONSOR_SELECTOR));
  if (!sponsorFrame) throw new Error("no sponsor(lifeboat) VERIFY frame: not a sponsored migration");
  const lifeboat = `0x${sponsorFrame.data.slice(2 + 8 + 24, 2 + 8 + 64)}`.toLowerCase() as Address;

  let ethWei = 0n, created = false;
  const tokens: { token: Address; amount: bigint }[] = [];
  for (const f of t.frames.filter((f) => Number(f.mode) === 2)) {
    const to = (f.to ?? exposed).toLowerCase() as Address;
    const data = f.data.toLowerCase();
    if (data.startsWith(CREATE_SELECTOR) && data.length === 2 + 8 + 256 && Number(f.value) === 0) {
      created = true; // the account is created for the sender; the sponsor checks its address
      continue;
    }
    if (data === "0x") {
      if (to !== lifeboat) throw new Error(`ETH frame pays ${to}, not the Lifeboat account`);
      ethWei += BigInt(f.value);
    } else if (data.startsWith(TRANSFER_SELECTOR) && data.length === 2 + 8 + 128) {
      const recipient = `0x${data.slice(2 + 8 + 24, 2 + 8 + 64)}` as Address;
      if (recipient !== lifeboat) throw new Error(`token frame pays ${recipient}, not the Lifeboat account`);
      tokens.push({ token: to, amount: BigInt(`0x${data.slice(2 + 8 + 64)}`) });
    } else {
      throw new Error("a SENDER frame is neither an ETH move nor transfer(lifeboat, amount)");
    }
  }
  return { exposed, lifeboat, sponsor: (sponsorFrame.to?.toLowerCase() as Address) ?? null, ethWei, tokens, created };
}
