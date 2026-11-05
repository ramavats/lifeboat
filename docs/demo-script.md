# Lifeboat: 3-minute demo video script

Written so someone who has never heard of quantum computers or Ethereum accounts can follow it.
About 410 spoken words, which is 3 minutes at a calm pace. Cut waiting time in the edit:
nobody needs to watch a progress bar.

---

## Before you record

- [ ] `pnpm web` running, browser window about 1440 × 900, zoom 100%, light theme
- [ ] Start from a clean wallet: footer → "Start over with a new demo wallet"
- [ ] Faucet check: if "Get devnet ETH" says the faucet is empty, run
      `pnpm devnet fund <address shown on the page>` in a terminal off camera
- [ ] Do one full rehearsal run first (Move aboard → Account → Q-day), then reset and record
- [ ] Have a famous mainnet address ready to paste, e.g. `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`
- [ ] Open the Check page early so Tor is already connected ("Private reads ready")

---

## Scene 1 · The problem (0:00–0:20)

**On screen:** the Check page. Slowly move the pointer over the lifeboat so it lowers to the water.

**Say:**
> Every Ethereum wallet is protected by a key. The first time you send a transaction,
> part of that key, the public key, becomes visible to everyone. Today that's fine. But a
> large enough quantum computer could turn that public key back into your private key, and
> empty your wallet. Ethereum is planning for that day. Lifeboat gets you ready for it now.

---

## Scene 2 · Check an address (0:20–0:40)

**On screen:** paste the address, click **Check**. Result: **Exposed**.

**Say:**
> First, check any address. This one is exposed: it has sent thousands of transactions, so
> its public key is out there. And the check itself is private. It goes through Tor, so
> nobody learns which address you looked up.

---

## Scene 3 · Move aboard (0:40–1:25)

**On screen:** click **Try the move on the devnet**, or open **Move aboard**. Click through:
Get devnet ETH → Send one transaction → **Make keys** (pause on "1,024 one-time keys, made in this
browser") → Download → I stored it → **Try the public mempool first** (the panel shows "Refused") →
**Move everything**. *Cut the wait.* Show "Done in one atomic transaction. The old account is empty."
and the panel's second row: "Admitted and mined".

**Say:**
> Here's a demo account in the same situation. Lifeboat makes it a new set of quantum-safe keys,
> a thousand and twenty-four of them, right here in the browser. They never leave this device.
>
> Then one click creates the new account and moves everything into it, the ETH and the tokens,
> in a single transaction. All of it moves, or none of it does. And the user pays nothing, not
> even for the new account: a sponsor covers the fee. Ethereum's normal mempool refuses this
> transaction. The new alternative mempool accepts it. Done. The old account is empty.

---

## Scene 3b · The public log (about 15 s)

**On screen:** open **Public log**. Click **Verify on the devnet** on the newest row → "Matches the chain".

**Say:**
> If you want, your move can be listed on a public log stored on Arkiv, so there's a lasting record
> even after this test network resets. You don't have to trust the log: one click checks it
> against the real transaction.

---

## Scene 4 · Q-day: attack it (1:25–2:05)

**On screen:** open **Q-day test**. Point at "Its private key (handed over)". Click
**Send the forgery** → "Refused". Click **Replay it** → "Refused". Point at "Still in the account".

**Say:**
> Now let's pretend Q-day has arrived. We hand an attacker the old private key, exactly what a
> quantum computer would recover. On a normal wallet, that's game over.
>
> The attacker signs a transaction to drain the Lifeboat account, and fakes the quantum-safe
> part. Refused. They try something smarter: copying a real quantum-safe signature from an
> earlier transaction. Also refused. Each signature only works for the one transaction it was
> made for. The money stays put.

---

## Scene 5 · Switch off the old key (2:05–2:30)

**On screen:** open **Account**. Click **Switch** → **Yes, ignore ECDSA from now on**. Badge
changes to **Quantum-safe only**. Send 0.01 ETH. Point at the key grid: an orange cell fills.

**Say:**
> Today the account asks for both: the old key and the new quantum-safe one. When the day comes,
> one switch turns the old key off for good. From then on only the quantum-safe keys count.
> Each orange square is a key that has been used once and is now retired.

---

## Scene 6 · What's new, and close (2:30–3:00)

**On screen:** back to the Check page with the lifeboat.

**Say:**
> Under the hood: this runs on EIP-8141, Ethereum's new kind of smart account, on its test
> network.
>
> Quantum-safe signatures already exist. What didn't exist was a way to get your account there.
> Lifeboat is that way: check, move aboard in one free transaction, and stay safe after Q-day.

---

## If something goes wrong while recording

| Problem | Fix |
|---|---|
| Faucet is empty | `pnpm devnet fund <address> 0.1`; the step continues by itself |
| "Move everything" is slow | It retries dropped transactions; keep recording and cut the wait |
| Tor won't connect on the Check page | Reload once; or skip Scene 2's privacy line and record the check later |
| Devnet down | Use the CLI run as backup: `pnpm devnet migrate`, `send`, `attack`, `pq-only` |

## Words to avoid on camera
"Merkle tree", "WOTS+C", "VERIFY frame", "nonce", "paymaster". Use instead: "a set of
one-time keys", "quantum-safe signature", "the account checks it", "each key works once",
"a sponsor pays the fee".
