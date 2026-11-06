# Lifeboat

**Move an Ethereum account to quantum-safe keys before anyone can break the ones it uses
today.**

Every Ethereum account that has sent a transaction has published its secp256k1 public key.
A large enough quantum computer can derive the private key from it. Ethereum's plan is
to let accounts migrate to post-quantum signatures through account abstraction (EIP-8141),
with no flag day. ethereum.org says wallets "will guide you through future migration". No
such path exists yet. Lifeboat is that path:

1. **Check** any mainnet address for exposure, with every read routed through Anon-RPC.
2. **Migrate** an exposed account into a quantum-safe Lifeboat account with **one sponsored
   transaction** that also creates the account. All ETH and tokens move atomically, and the
   user pays nothing: a wallet holding only tokens, with no ETH for gas, can still move.
3. **Live in hybrid mode** (ECDSA *and* a hash-based signature), then **switch to
   quantum-safe only** when ECDSA can no longer be trusted.

**Try it live:** https://lifeboat-iota.vercel.app (test network, test money; keys stay in your browser).

**See it on the devnet explorer:** a fully sponsored migration, the account created inside the same
transaction, admitted by the ERC-8421 alt mempool and mined:
[`0xa1a2907a…d150`](https://explorer.altmempool.wtf/tx/0xa1a2907a580b8b5badd5073e12b04e40a1cd40784164896b18f48d4493a7d150) (block 488, 6 of 6 frames succeed).

## What it does, live

Everything here ran on the public ERC-8421 alt-mempool devnet (chain 1337). The devnet was reset on
the afternoon of Nov 6, 2026; we redeployed (the contracts landed at the same addresses) and ran
everything again.

### After the reset (Nov 6)

| What | Transaction | Result |
|---|---|---|
| **Fully sponsored migration, account created in the same transaction** | [`0xa1a2907a…d150`](https://explorer.altmempool.wtf/tx/0xa1a2907a580b8b5badd5073e12b04e40a1cd40784164896b18f48d4493a7d150), block 488 | 1.0000 ETH + 2,400 dUSD moved, 6 of 6 frames succeed, 7,872,284 gas, all paid by the sponsor |
| Two more, from the browser | `0xa339f72c…03cc` (block 366), `0x699e9299…996e` (block 463) | Same result |
| **The same signed migration, sent to the public mempool** | *(refused)* | `StorageReadNonSender`: the sponsor reads the factory's registry during validation, which only the alt mempool allows |
| Send with both signatures, two attacks with the stolen ECDSA key (a forged quantum-safe signature, a replayed real one), switch to quantum-safe only, send, attack again | in the app's activity list | Both sends mined; every attack refused with `LifeboatAccount.BadPqSignature()` |
| Public log on Arkiv | entities `0x97c595c1…`, `0xa85e9919…`, `0x072b7238…` | Each row checks out against the chain from the Public log page |

The whole browser flow above was driven in Chromium three times on the reset devnet (Move → Use it →
Try to break in → turn off the old key → attack again), each run 2 to 2.5 minutes.

### Before the reset (Nov 5–6)

These transactions are no longer on the devnet's explorer; they're kept as the record of the first runs.

| Step | Transaction | Result |
|---|---|---|
| **Fully sponsored migration: the account is created inside the same transaction** (Nov 6) | `0x02f89fb8…9b83`, block 406,552 | All 6 frames succeed: approval, sponsor check, create account, ETH, dUSD, record. 7.87M gas, all paid by the sponsor |
| Sponsored migration: 1.0000 ETH + 2,400 dUSD from an exposed EOA into its Lifeboat account | `0xe0645ace…b02c` | All 5 frames succeed, old EOA left at exactly 0, the sponsor paid 0.000589 ETH of gas |
| Send in HYBRID mode (ECDSA + XMSS) | `0x9995dc0c…0a34` | Admitted, mined |
| Attacker with the old ECDSA private key and a forged quantum-safe signature | *(rejected)* | `LifeboatAccount.BadPqSignature()` |
| Switch to PQ_ONLY | `0x758ea20e…61ab` | Admitted, mined |
| Send with the quantum-safe signature alone | `0x6d97f2d6…162a` | Admitted, mined |
| Same attack again | *(rejected)* | `LifeboatAccount.BadPqSignature()` |
| **The same valid migration, sent to the canonical mempool** | *(rejected)* | `StorageReadNonSender` |
| The same valid migration through the alt mempool | `0x888b3d32…0015` | Admitted, mined |
| A Lifeboat account transaction, same bytes, through the **public** mempool | `0xfe29a799…b584`, block 406,088 | Mined: account transactions don't need the alt mempool, only the sponsor does |

Full hashes are in [Devnet deployment](#devnet-deployment).

## Why the alt mempool

The Lifeboat **account** fits the public mempool's 100,000-gas validation budget: quantum-safe
verification costs a fixed 48.6k gas. The **migration sponsor** does not fit the public mempool's rules.

To pay gas for a stranger's migration safely, the sponsor checks during validation that every
frame only moves assets into a *genuine* Lifeboat account. That means reading
`LifeboatFactory.isLifeboat(...)`, which is another contract's storage. EIP-8141's public
mempool forbids that. ERC-8421 lets a **staked** entity do it, so the sponsor stakes itself
in its constructor. We sent the same signed migration both ways:

- canonical mempool (`eth_sendRawTransaction`): **rejected**, `StorageReadNonSender`
- alt mempool (`eth_sendFrameTransaction`): **admitted and mined**

Free, safe migration for exposed accounts exists only because the alt mempool exists.

## How it works

```
 Browser                                   Alt-mempool devnet (chain 1337)
 ───────                                   ───────────────────────────────
 Exposure check ──Anon-RPC (Tor/Nym)──▶ mainnet RPC   (read-only, no funds)

 XMSS signer (TS)                          LifeboatFactory ── isLifeboat[addr]
  seed → 1,024 one-time keys                     ▲ create()
  journal: never reuse a key                     │
                                          MigrationSponsor (staked paymaster)
 Migration tx (sender = exposed EOA)  ──▶   VERIFY(PAYMENT): reads isLifeboat,
  [VERIFY self][VERIFY sponsor]              checks every SENDER frame, 1 per EOA
  [SENDER moves… atomic][DEFAULT record]
                                          LifeboatAccount
 Lifeboat tx (sender = Lifeboat)      ──▶   VERIFY: XMSS sig over sigHash,
  [VERIFY validateTx][SENDER execute]        one-time key = tx nonce,
  sigs: [ECDSA owner][XMSS]  (HYBRID)        + owner ECDSA in HYBRID
        [XMSS]               (PQ_ONLY)
```

### The signature scheme: XMSS-lite with WOTS+C
- **Hash-based only** (keccak256): the most conservative post-quantum assumption, cheap in the EVM.
- **WOTS+C one-time signatures**, w = 4, 128 chains. Instead of checksum chains, the signer
  grinds a 32-bit counter until the digest's base-4 digits sum to exactly 240. Any other
  message with the same sum has a lower digit somewhere, and reaching it means inverting a
  hash chain. Verification walks exactly 144 hash steps, whatever the message.
- **Merkle tree of 2^10 one-time keys** per account root. Signature: 4,424 bytes.
- Every hash is domain-separated by (tag, leaf, chain, step), as in XMSS's address scheme.
- The TypeScript signer (`src/pq/`) and the Solidity verifier (`contracts/XmssVerifier.sol`)
  mirror each other step for step, and the tests check one against the other in an
  in-process EVM.

| | |
|---|---|
| Verify gas | **48.6k, fixed** (an earlier w = 16 version averaged 101k and didn't fit) |
| Signature | 4,424 bytes |
| Keygen (1,024 keys) | ~4.5 s in Node |
| Sign | ~0.3 s (includes the grind) |

### Never reusing a one-time key
A hash-based one-time key that signs two different messages leaks enough to forge. Two layers:
- **Onchain:** the account accepts a signature only from the one-time key matching the tx's
  nonce (`leaf = nonce − nonceBase`). The protocol consumes a nonce once, so no key is
  accepted twice.
- **Off-chain:** the signer's journal (`src/pq/journal.ts`) records which transaction each key
  signed. It refuses a second, different transaction for the same key, and it is saved
  before broadcast. Re-sending the identical signed transaction is safe.

### Modes
- **HYBRID** (default): the owner's ECDSA signature *and* the XMSS signature. The account is
  never weaker than the wallet it replaced, and a quantum attacker who derives the ECDSA
  key still can't spend.
- **PQ_ONLY**: a one-way switch, itself authorized by a quantum-safe signature. ECDSA no
  longer counts.
- **Key rotation**: `rotateKeys` moves to a fresh tree before the 1,024 keys run out.

### The migration sponsor's rules (`contracts/MigrationSponsor.sol`)
It pays only when all of these hold, each verified live on the devnet:
- the destination is a genuine Lifeboat account (`NotALifeboat`)
- the sender's key is actually exposed, meaning its nonce is above 0 (`NotExposed`)
- one sponsorship per account (`AlreadySponsored`)
- every SENDER frame is an ETH transfer to the Lifeboat account or `transfer(lifeboat, x)`,
  and the declared gas is capped.

## CROPS

- **C, censorship resistance.** Nothing here depends on a server we run. The account,
  factory and sponsor are contracts, and anyone can deploy their own factory and sponsor. The
  sponsor is optional: an exposed account with ETH can pay for its own migration. The
  exposure check needs only an RPC URL. If our sponsor runs dry or refuses someone, they
  migrate unsponsored.
- **O, open source.** MIT. Contracts compile with solc-js and tests run in an in-process EVM
  (`pnpm install && pnpm test`), so no Foundry or system installs are needed.
- **P, privacy.**
  - The exposure check routes all five RPC reads through **Anon-RPC** (tor-js or Nym), with
    the checked address as the isolation key. The RPC provider sees an exit node, and checks
    of different addresses aren't linkable.
  - The harness's one bootstrap read (the specifier contract) is not anonymized, and it
    carries no address.
  - Migration itself is an onchain transaction and is public by nature.
  - No analytics or trackers.
- **S, security.**
  - Quantum-safe signatures rest on keccak256 alone.
  - The XMSS seed and the journal stay on the user's device.
  - Trust assumptions: our unaudited implementation; the user keeping the seed and journal;
    and, for Tor checks, the tor-js demo gateway.

## Prior art, and what's new here

| Exists | What it is | Difference |
|---|---|---|
| [sm-stack/eip8141-poc](https://github.com/sm-stack/eip8141-poc) `contracts/sphincs` | A self-paying EIP-8141 account with SPHINCS⁻ C13 and PQ owner rotation | Needs a modified geth, solc and viem and a Rust signer, with no migration path. We built our own TS-native XMSS/WOTS+C and the migration around it, on the public devnet |
| [ZKnox ETHFALCON](https://github.com/ZKNoxHQ), LimeChain FlyFlow | Falcon verifiers, ERC-4337 PQ accounts | Not frame transactions, no migration |
| StablePQC, Quantus | Ethereum address exposure checkers | We act on the result, and our check is private (Anon-RPC) |
| BitGo quantum checker | Bitcoin checker + sweep | Ethereum, into a PQ account |

**New:** a self-serve path from an exposed Ethereum account into a quantum-safe frame account
in one sponsored transaction, with a hybrid period and a one-way switch. The sponsor is
something only the alt mempool allows.

## The app

`pnpm web`, then open http://127.0.0.1:5173. Keys and signing stay in the browser.

| Page | What it does |
|---|---|
| 1 · Check | Home page: a pixel-grid hero, the problem in three steps, and an exposure check for any mainnet address. Every read goes over Anon-RPC: Tor first, the Nym mixnet if Tor's gateway is slow or down |
| 2 · Move | Five steps: a practice account with an exposed key, 1,024 keys made in a Web Worker, backup, review, one sponsored migration. A panel sends the same signed migration to the public mempool to show it refused |
| 3 · Use it | Balances, send, the one-way switch to quantum-safe only, the 32 × 32 key grid, activity, the Arkiv entry |
| 4 · Try to break in | Two real attacks with the stolen ECDSA key: a forged quantum-safe signature, and a genuine one replayed from an earlier tx. Both refused by the mempool |
| Public log | The Arkiv feed, filters, "did this address move?", and "Check against the chain" on every row |
| How it works | The short version in plain words, then the scheme, why the alt mempool, privacy, prior art, limits |

The nav is the journey: each of the four steps gets a tick once it's done. Technical terms carry a
plain-language definition on hover, and every page ends with the next step.

The whole flow was driven end to end in Chromium on the live devnet, three times after the Nov 6
reset (latest migration [`0xa1a2907a…d150`](https://explorer.altmempool.wtf/tx/0xa1a2907a580b8b5badd5073e12b04e40a1cd40784164896b18f48d4493a7d150)): hybrid send, both attacks refused
(`BadPqSignature`), switch to quantum-safe only, a send with the quantum-safe signature alone, the
forgery refused again.
If the shared faucet is empty, the Move page shows the demo address to fund and continues on
its own once ETH arrives.

## Public migration log (Arkiv)

Completed migrations can be listed on a public log on Arkiv's Rabdi testnet (chain 7794095).
Listing is **opt-in**, and the migration never depends on it.
- **What's logged:** only completed migrations, and only facts already public onchain. Every
  field is derived from the mined migration transaction's own frames and receipt before
  publishing.
- **What's never logged:** exposure checks, keys, IPs.
- **Why:** the devnet can be reset and its explorer keeps history in memory only. The log
  keeps a durable record that anyone can query without us.

Readers trust only entries owned by the deployment's publisher wallet. Schema and rationale:
[`arkiv/`](arkiv/).

- Publisher wallet: `0x09Ad723E95ad58D9b963c93dc212fC4DfdAe3631`
- Latest entries (after the devnet reset): `0x072b7238c9ab8f256aebec032d03f37ae081e81428a93ccdd13aa82412a89386`
  (the migration linked at the top), `0xa85e991934e3f8976b0fbd88d66e6b91b105d0ef753c24076c11bbda9e7c98d6`,
  `0x97c595c11a251457c7cdf61c14eb55e41c8dc0d8da3ed42695bafe101b470bf7`. Each checks out against the chain.
- First entry: `0x2bf86f4fb65770ebc7a4da64ad7c51ebc43ac6244597cae2ef7da865a9dbaf38`
  (Arkiv tx `0x745669bc99016628f112f6ed605ca795a19822cd19e7d140941da117b14f6c07`), from before the
  reset. Entries whose transaction the devnet no longer has show "Doesn't match" in the app, which is
  the right answer; the page lists entries newest-listed first.
- One query you can run:

```ts
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { desc } from "@arkiv-network/sdk/query";
import { http } from "viem";
import { Migrations } from "./src/arkiv/log.js";

const client = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });
const { entities } = await client
  .select({ exposed: true, lifeboat: true, block: true, txHash: true, assets: true })
  .from(Migrations)
  .ownedBy("0x09Ad723E95ad58D9b963c93dc212fC4DfdAe3631")
  .orderBy(desc("block"))
  .limit(20)
  .fetch();
```

Or from the repo: `pnpm arkiv`.

## Run it

```bash
pnpm install
pnpm build:contracts          # solc-js 0.8.28 → out/
pnpm test                     # signer, verifier (in-process EVM), exposure check

pnpm exposure 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   # mainnet, direct (not anonymous)
pnpm web                      # http://127.0.0.1:5173: the same check via Anon-RPC (browser)

# The full story on the alt-mempool devnet (uses its faucet; throwaway keys in .lifeboat-state.json)
pnpm devnet setup             # factory, staked sponsor, demo token
pnpm devnet expose            # an EOA that has sent a tx and holds 2,400 dUSD
pnpm devnet check
pnpm devnet migrate           # one sponsored atomic migration
pnpm devnet send              # HYBRID
pnpm devnet attack            # stolen ECDSA key + forged PQ sig → rejected
pnpm devnet pq-only
pnpm devnet send              # PQ only
pnpm devnet sponsor-checks    # canonical vs alt mempool, and the sponsor's guardrails
pnpm devnet publish           # opt in: list the migration on the Arkiv log (needs tGLM, see pnpm arkiv:key)
pnpm devnet fund <address>    # send 0.1 devnet ETH from the operator when the shared faucet is empty
pnpm devnet status            # are our contracts on the chain (after a reset)? operator and sponsor balances
pnpm arkiv                    # read the log
```

## Devnet deployment

Alt-mempool devnet, chain 1337, gateway `https://altmempoolgateway.forshtat.com/rpc`,
explorer https://explorer.altmempool.wtf/ (the devnet can be reset; it was on Nov 6, and these are the
addresses after redeploying).

| Contract | Address |
|---|---|
| LifeboatFactory | `0xb343620fe0f4125acb960e7613ddcd7a3ce0f494` |
| MigrationSponsor (staked 0.012 ETH) | `0x4b94121f0343a95c90e9fd6bb3e0d6fa7448ed0c` |
| DemoToken (dUSD, test only) | `0x53af43f3d696bef8e7fb022b8a707f7103f952a0` |
| Migrated Lifeboat account (after the reset) | `0x14970814120b08E4b976C1E0072c16BB493BBE7e` |

After the reset:

| Step | Tx hash |
|---|---|
| migrate (fully sponsored, creates the account) | [`0xa1a2907a580b8b5badd5073e12b04e40a1cd40784164896b18f48d4493a7d150`](https://explorer.altmempool.wtf/tx/0xa1a2907a580b8b5badd5073e12b04e40a1cd40784164896b18f48d4493a7d150) |
| migrate | `0x699e92993a2681dee7d346a9558e6d86b59ba36631f39e635405515f9453996e` |
| migrate | `0xa339f72ce69cf0913e0bfbb2e41453004740dc7391d8221c44d2934e5bba03cc` |

Before the reset (no longer on the devnet), the CLI run into `0x94a8eC3865A9Dbb50778361eD05a1f17af296d62`:

| Step | Tx hash |
|---|---|
| migrate | `0xe0645ace1cb82e98b9df010cb897d910cf3af7522ee90969c6da302f7b2db02c` |
| send (HYBRID) | `0x9995dc0c5cba8010da4ee8803c9a9f1e539c26c6776602ecde5b359d6fc80a34` |
| pq-only | `0x758ea20e76111f3ee6e9573cdd2083358f284162f3967131690f2140ae2161ab` |
| send (PQ_ONLY) | `0x6d97f2d606b610af795d234db416c190759ab2482b106f4ff7290cc41289162a` |
| alt-mempool migration (sponsor checks) | `0x888b3d326d9b385eee21670d7ae2b84e427b655e7d0f805622dd9043d6920015` |

## Limitations
- Unaudited, experimental cryptography. Devnet only: EIP-8141 is not on mainnet.
- XMSS is stateful: losing the journal and signing a different transaction with a used key
  weakens that key. The onchain nonce binding stops a key being *accepted* twice, but it
  can't stop a careless signer from *producing* two signatures.
- 1,024 transactions per key tree before `rotateKeys`.
- A Lifeboat account uses the helper contracts of `@forshtat/hegota-support` for the frame
  opcodes, so creating one costs ~7.7M *state* gas on this devnet (~158k execution), which
  the sponsor pays.
- Two alt-mempool nodes run on the devnet. On Nov 6 the workshop gateway
  (`altmempoolgateway.forshtat.com`) stopped relaying for over an hour without gossiping to
  the main node, so Lifeboat now sends to `altmempool.forshtat.com`. Ordinary Lifeboat
  account transactions also fall back to the node's own mempool after 45 s (they qualify
  there; the sponsored migration doesn't).
- The sponsor's "exposed" test is nonce > 0. An EIP-7702 delegated EOA with nonce 0 is
  exposed too, but the sponsor can't see its code during validation.
- The Tor route of the exposure check relies on the tor-js demo gateway, which the Anon-RPC docs
  call limited capacity. It went down on Nov 6; the check now falls back to the Nym mixnet
  (about 25 s to connect) and, if neither connects, offers a direct check labelled as not private.
- The alt mempool sometimes gives up on a valid transaction its relayer couldn't get into a block
  ("relayed 4 times without being included", seen once on Nov 6). The app watches for that and
  hands the same signed bytes back.
- The sponsor pays about 0.02 devnet ETH per migration (account creation is ~7.7M state gas);
  `pnpm devnet status` shows its balance.

## Credits
- The hero is a canvas drawn for Lifeboat (`web/app/PixelHero.tsx`): the wordmark, in its own pixel
  lettering, is etched in by signals running across a grid, and the pointer breaks it up.
- An earlier hero, `web/figure/davits.js` (a lifeboat on its davits, drawn with the `hairline-create`
  skill on the engine of [Hairline](https://github.com/lucasmarkes/hairline) by Lucas Marques, MIT),
  is kept in the repo but no longer shown. `web/figure/kernel.js` is that engine, copied unchanged.
- The first version of the interface was checked against [unslop](https://heydamir.design/unslop) by
  Damir Sokolovsky (CC BY 4.0); the current design came after that pass.
- Anon-RPC (Ethereum Foundation), Arkiv SDK, `@forshtat/hegota-support` (alt-mempool workshop).

## How AI was used
Claude Code (Anthropic) helped research the idea and prior art, write and test the code
(signer, contracts, devnet scripts, exposure check, the web app and its design), drive the
browser tests on the live devnet, and draft this README and the demo script. Every devnet
result above comes from real runs.

## License
MIT
