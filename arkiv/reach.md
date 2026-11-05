# Reach

## Who it's for
- **People moving an exposed account to quantum-safe keys.** Listing their migration lets
  others (counterparties, a DAO, an exchange) see that the old address is retired and where
  its assets went, without trusting a screenshot.
- **Wallets and explorers** that want to show "migrated to a quantum-safe account" next to an
  address. It's one indexed query, with no API key from us.
- **Anyone tracking how Ethereum's post-quantum migration is going.** ethereum.org says
  wallets "will guide you through future migration", and an open, queryable record of
  migrations is what you would count it with.

## Would they use it?
Honest answer: today it's a devnet, so the only real migrations are our demo runs.
The data is real (verified from chain before publishing), but the audience is the people
building and evaluating EIP-8141 accounts right now: the EF's alt-mempool team, wallet
teams experimenting with frame transactions, and hackathon judges.

## Can they try it today?
Yes:
- `pnpm arkiv` lists the log.
- `pnpm devnet migrate && pnpm devnet publish` adds a new migration.
- The query in the README runs with nothing but the SDK.

## After Mumbai
The log is the piece of Lifeboat that keeps its value as EIP-8141 moves toward mainnet
(Hegotá). The plan is to keep the schema stable (`v1`), point the publisher at each new
devnet/testnet, and add the `extend` job that `friction.md` describes.
