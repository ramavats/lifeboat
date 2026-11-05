# Why Arkiv

## What users would lose with Postgres instead
- **A record that outlives the devnet.** The migrations happen on the EIP-8141 alt-mempool
  devnet, which "may be reset at any time", and whose explorer keeps history in memory only.
  A Postgres table on our server would survive a reset, but only for as long as *we* keep
  running it, and only showing what *we* choose to show.
- **Readable without us.** Anyone can query the log straight from Arkiv with the SDK or the
  JSON-RPC API: a wallet deciding whether to show "migrated" on an address, or a dashboard
  counting migrations. No API of ours, no key from us, no uptime from us. This matters for
  the project's censorship-resistance claim (README, CROPS section).
- **Attributable entries.** Each entity has an owner wallet. Readers trust exactly one
  publisher per deployment and ignore everything else, with no auth layer to build.
- **Queries without an indexer.** "Migrations into this account", "latest sponsored
  migrations", sorted by block: indexed attributes give us this without running an indexer
  against a devnet that resets.

## What we kept off Arkiv, and why
- **Exposure checks.** They go through Anon-RPC precisely so nobody learns who looked up which
  address. Logging them anywhere would undo that.
- **Keys and the one-time-key journal.** They stay on the user's device.
- **Anything not already public onchain.** Before publishing (`pnpm devnet publish`), every
  field is derived from the devnet itself: the mined migration transaction's frames (who, into
  which account, how much ETH, which `transfer`s), its receipt (all frames succeeded), and the
  factory registry. The log can't say more than the chain proves.
- **Migrations the user didn't opt into.** Publishing is a separate, explicit step.
