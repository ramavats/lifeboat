# How Lifeboat uses Arkiv

| Arkiv feature | How we use it | What the user sees |
|---|---|---|
| Named schema (`lifeboat.migration.v1`) | Typed writes and reads; the tag keeps our entities apart | Consistent rows in the migration feed |
| Indexed `lifeboat` | `where(eq("lifeboat", …))` | Account page: "Your migration is on the public log" with the tx link |
| Indexed `exposed` | lookup by old address | "This address already moved to Lifeboat 0x…" |
| `orderBy(desc("block"))` + `limit` | newest-first feed | The "Recent migrations" list |
| Indexed `sponsored` | filter | Feed filter: sponsored vs self-paid |
| Entity owner + `ownedBy(publisher)` | trust only our publisher | Spoofed entries never appear |
| Expiration `max()` | ~182 days | The record outlives the devnet's resets |

## Who can edit what
Only the publisher wallet creates entities. We never update or delete a migration: it's
a historical fact. A correction would be a new entity, and the feed shows the latest per
`lifeboat`.

## Do the filters fit what the app does?
Yes. The app asks exactly three questions: "is this account's migration listed?", "did this
old address migrate?" and "what migrated recently?". Each one is a single indexed query.

## Reads
- CLI: `pnpm arkiv [<lifeboat address>]`
- Library: `readMigrations(publisher, { lifeboat, limit })` in `src/arkiv/log.ts`, used by the
  web app's account page and feed. It's read-only, needs no wallet, and works with or without
  an access key.
