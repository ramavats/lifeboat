# Arkiv friction log

Written while building, Nov 5, 2026. SDK `@arkiv-network/sdk@1.0.1`, Node 26, Rabdi testnet.

1. **No way to fund a test wallet from a script.** Writes need tGLM, and the faucet is a web
   page. For a CLI-first project, we had to stop and hand the address to a human. A rate-limited
   JSON-RPC or HTTP faucet endpoint (like the alt-mempool devnet's `skandha_explorer_faucet`)
   would remove the only manual step.

2. **The npm `license` field is empty.** `pnpm view @arkiv-network/sdk license` prints
   nothing, though `LICENSE.md` in the tarball is MIT. License checkers and some companies'
   dependency policies read the field. Expected `"license": "MIT"` in package.json.

3. **A Node ExperimentalWarning on the first query.** Under Node 26, the first `fetch()` of a
   query prints `ExperimentalWarning: localStorage is not available because
   --localstorage-file was not provided`. Import and plain reads (`getBlockNumber`) are
   quiet. `node --trace-warnings` points at the debug logger: `getDebugEnv`
   (`src/utils/logger.ts:17`) reads `localStorage`, called from `isEnabled` (`:43`) via
   `runQuery` (`src/query/engine.ts:68`). Node 26 exposes a `localStorage` global that warns
   when touched. Expected: in Node, check `process.env` first and don't touch
   `localStorage`. Repro: any `.select().fetch()` under Node 26.

4. **Anyone can write entities that match my schema.** That's correct for an open database,
   but it puts the burden of filtering spoofed rows on every reader. We filter with
   `ownedBy(publisher)`. A way to declare "entities of schema X are only valid from owner Y",
   or a documented recommended pattern, would help apps like ours that publish
   attestations.

5. **182-day maximum lifetime for a historical record.** A migration is a permanent fact,
   but `ExpirationTime.max()` caps it at about 182 days. We'll need a job that extends every
   entity before it expires. A documented "keep alive" pattern, or a pay-once permanent tier,
   would fit records like ours better.

6. **What went well.** `defineSchema` plus typed `select` made the reader a few lines with
   real types. The README walks from schema to query without detours, and reads worked
   immediately against the public endpoint with no key.

7. **First write worked first time.** `createEntity` with `ExpirationTime.max()` landed and
   read back through `select().from(Migrations).where(eq("lifeboat", …)).ownedBy(…)` with no
   changes. It cost 0.000507 tGLM. One gap: the faucet sent 10 tGLM and nothing in the SDK or
   hub said what a typical write costs, so we couldn't tell up front whether that was
   enough for one entity or ten thousand. A line like "a ~1 KB entity costs about X tGLM" in
   the README would answer it.

8. **The public endpoint printed a rate-limit notice on every run, but never limited us.**
   We made a handful of reads and one write without an access key and saw no throttling. The
   notice is useful, but it doesn't say what the limit *is*, so it's hard to judge whether a
   demo will survive a judge clicking around. Publishing the public endpoint's limits
   (requests/minute) would help.

_Not Arkiv's issue, but worth knowing:_ our source chain (the EIP-8141 devnet) keeps no
historical state, so we derive the published facts from the migration transaction itself,
not from balances at its block. That turned out stronger: the record says exactly what the
transaction moved.
