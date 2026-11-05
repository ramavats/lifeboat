import type { Address } from "viem";

/**
 * The public Lifeboat deployment on the ERC-8421 alt-mempool devnet (chain 1337), from
 * `pnpm devnet setup` on Nov 6, 2026 (the factory creates accounts with CREATE2). Anyone can deploy their own factory and sponsor;
 * these are just ours. If the devnet is reset, redeploy and update these four lines.
 */
export const deployment = {
  factory: "0x0386ba72f350e5bd1a765857abcf196e423959c3" as Address,
  sponsor: "0x7d426bc3981733b997c1c68212d5d14ee0e397c7" as Address,
  token: "0x10b355456a9f80fb9e36257aa38dc9ec8cf585ef" as Address, // dUSD, test only
  arkivPublisher: "0x09Ad723E95ad58D9b963c93dc212fC4DfdAe3631" as Address,
  /** Where demo sends go: the devnet workshop's recipient. */
  recipient: "0x8943545177806ED17B9F23F0a21ee5948eCaa776" as Address,
  explorer: "https://explorer.altmempool.wtf/",
};

export const KEY_TREE_HEIGHT = 10;
