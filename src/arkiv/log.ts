import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { desc, eq } from "@arkiv-network/sdk/query";
import { addr, bool, defineSchema, str, u256, u64 } from "@arkiv-network/sdk/schema";
import { http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../frame/devnet.js";

/**
 * The public migration log: one Arkiv entity per completed, opted-in Lifeboat migration.
 *
 * Rules (see README, Arkiv section):
 *  - Only completed migrations, and only facts already public onchain. Never exposure checks.
 *  - Opt-in: nothing is published unless the user asks for it.
 *  - The migration never depends on this log. If Arkiv is unreachable, nothing breaks.
 *  - Anyone can write an entity that matches this schema, so readers only trust entries
 *    owned by the publisher wallet, and can re-check each one against the devnet.
 */
export const Migrations = defineSchema("lifeboat.migration.v1", {
  exposed: addr().indexed(), // the old, exposed EOA
  lifeboat: addr().indexed(), // the quantum-safe account it moved into
  chainId: u64().indexed(),
  block: u64().indexed(),
  txHash: str().indexed(),
  sponsored: bool().indexed(),
  ethWei: u256(),
  assets: str(), // human summary, e.g. "1.0000 ETH, 2,400.00 dUSD"
});

export interface MigrationRecord {
  exposed: Address;
  lifeboat: Address;
  chainId: number;
  block: bigint;
  txHash: Hex;
  sponsored: boolean;
  ethWei: bigint;
  assets: string;
}

export const arkivChain = () => rabdi({ accessKey: env("ARKIV_ACCESS_KEY") ?? "" });

export function arkivReader() {
  return createPublicClient({ chain: arkivChain(), transport: http() });
}

export function arkivWriter(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  return { account, client: createWalletClient({ chain: arkivChain(), transport: http(), account }) };
}

/** Publish one migration. The devnet can be reset at any time; the log keeps the record (~182 days, the chain's maximum). */
export async function publishMigration(privateKey: Hex, r: MigrationRecord) {
  const { client } = arkivWriter(privateKey);
  return client.createEntity(
    Migrations,
    {
      exposed: addr(r.exposed),
      lifeboat: addr(r.lifeboat),
      chainId: u64(r.chainId),
      block: u64(r.block),
      txHash: str(r.txHash.toLowerCase()),
      sponsored: bool(r.sponsored),
      ethWei: u256(r.ethWei),
      assets: str(r.assets),
    },
    { expiration: ExpirationTime.max() },
  );
}

export interface LogRow extends MigrationRecord {
  key: Hex;
  publisher: Address;
}

/** Latest migrations listed by `publisher`, newest block first. */
export async function readMigrations(publisher: Address, opts: { lifeboat?: Address; limit?: number } = {}): Promise<LogRow[]> {
  const q = arkivReader()
    .select({ $key: true, $owner: true, exposed: true, lifeboat: true, chainId: true, block: true, txHash: true, sponsored: true, ethWei: true, assets: true })
    .from(Migrations);
  const filtered = opts.lifeboat ? q.where(eq("lifeboat", addr(opts.lifeboat))) : q;
  const page = await filtered.ownedBy(publisher).orderBy(desc("block")).limit(opts.limit ?? 50).fetch();
  return page.entities.map((e) => ({
    key: e.$key as Hex,
    publisher: e.$owner as Address,
    exposed: e.exposed.value as Address,
    lifeboat: e.lifeboat.value as Address,
    chainId: Number(e.chainId.value),
    block: BigInt(e.block.value),
    txHash: e.txHash.value as Hex,
    sponsored: Boolean(e.sponsored.value),
    ethWei: BigInt(e.ethWei.value),
    assets: String(e.assets.value),
  }));
}

