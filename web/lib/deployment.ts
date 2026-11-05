import type { Address } from "viem";

/**
 * The public Lifeboat deployment on the ERC-8421 alt-mempool devnet (chain 1337), from
 * `pnpm devnet setup` on Nov 5, 2026. Anyone can deploy their own factory and sponsor;
 * these are just ours. If the devnet is reset, redeploy and update these four lines.
 */
export const deployment = {
  factory: "0xb343620fe0f4125acb960e7613ddcd7a3ce0f494" as Address,
  sponsor: "0x4b94121f0343a95c90e9fd6bb3e0d6fa7448ed0c" as Address,
  token: "0x53af43f3d696bef8e7fb022b8a707f7103f952a0" as Address, // dUSD, test only
  arkivPublisher: "0x09Ad723E95ad58D9b963c93dc212fC4DfdAe3631" as Address,
  /** Where demo sends go: the devnet workshop's recipient. */
  recipient: "0x8943545177806ED17B9F23F0a21ee5948eCaa776" as Address,
  explorer: "https://explorer.altmempool.wtf/",
};

export const KEY_TREE_HEIGHT = 10;
