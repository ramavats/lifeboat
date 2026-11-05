import * as tx from "@forshtat/hegota-support/tx";
import type { FrameTx } from "@forshtat/hegota-support/tx";
import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { devnet, profile } from "./devnet.js";

const sponsorAbi = parseAbi(["function sponsor(address lifeboat)", "function recordSponsorship()"]);
const erc20Abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

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
    fees: { maxFeePerGas: devnet.maxFeePerGasWei },
  });
}
