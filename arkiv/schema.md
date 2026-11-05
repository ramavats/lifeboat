# Arkiv schema: `lifeboat.migration.v1`

One entity per **completed, opted-in** Lifeboat migration: an exposed Ethereum account moving
its assets into a quantum-safe Lifeboat account. Defined in [`src/arkiv/log.ts`](../src/arkiv/log.ts).

| Column | Type | Indexed | Meaning |
|---|---|---|---|
| `exposed` | addr | yes | The old account whose public key is onchain |
| `lifeboat` | addr | yes | The quantum-safe account it moved into |
| `chainId` | u64 | yes | Chain of the migration (1337 = alt-mempool devnet) |
| `block` | u64 | yes | Block the migration landed in; the log is sorted by it |
| `txHash` | str | yes | The migration transaction (lowercase hex) |
| `sponsored` | bool | yes | Whether the MigrationSponsor paid the gas |
| `ethWei` | u256 | no | ETH the migration moved, read from the tx's own frames |
| `assets` | str | no | Human summary, e.g. `1.0000 ETH, 2,400.00 dUSD` |

The named schema also tags each entity with `arkiv.schema = "lifeboat.migration.v1"`.

## Who owns them
Entities are created and owned by the **publisher wallet** of a Lifeboat deployment
(ours: printed by `pnpm arkiv:key`, and listed in the README). Readers query with
`.ownedBy(publisher)`. Anyone can write an entity matching this schema, so an entity
from anyone else is ignored.

## What we filter on
- `lifeboat`: "is this account's migration on the log?" (account page)
- `exposed`: "did this old address migrate?"
- `block` (sort, descending): the recent-migrations feed
- `sponsored`, `chainId`: feed filters

## When they expire
`ExpirationTime.max()`, the chain's longest lifetime (~182 days). That covers the hackathon
and well beyond. A permanent record would need a periodic extend. See `friction.md`.

## Never stored
Exposure checks, IP addresses, the quantum-safe public key or seed, the one-time-key journal.
Only facts already public in the migration transaction itself.
