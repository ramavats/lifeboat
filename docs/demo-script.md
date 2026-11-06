# Lifeboat: 3-minute demo video script

Written so someone who has never heard of quantum computers or Ethereum accounts can follow it.
About 420 spoken words, which is 3 minutes at a calm pace. Cut waiting time in the edit:
nobody needs to watch a progress bar.

The site is laid out as the story: the nav reads **1 Check · 2 Move · 3 Use it · 4 Try to break in**,
and each step gets a green tick as you finish it. Let the ticks show on camera; they do the
narrating for you.

---

## Before you record

- [ ] `pnpm web` running, browser window about 1440 × 900, zoom 100%, light theme
- [ ] Start from a clean wallet: footer → Your wallet → **Start over with a new demo wallet**
- [ ] Devnet up and our contracts there: `pnpm devnet status` says "contracts: deployed" (if not, see the table at the end)
- [ ] `pnpm devnet status` shows the operator with at least 0.15 ETH (emergencies) and the sponsor
      with at least 0.1 ETH (each migration costs it about 0.02). Top up the sponsor with
      `pnpm devnet fund 0x4b94121f0343a95c90e9fd6bb3e0d6fa7448ed0c 0.3`
- [ ] Do one full rehearsal run (Move → Use it → Try to break in → Use it), then start over and record
- [ ] Have a famous mainnet address ready to paste: `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`
- [ ] **Open the home page about 30 seconds before you start**, so the private connection is
      already up ("Private connection ready through the Nym mixnet" under the Check field, usually
      within 20 seconds). A check then takes 10–40 s; cut the wait in the edit. If it says the
      private network is too slow, just press Check again (or record this scene later)
- [ ] Reload the home page right before recording, so the hero animation plays from the start

---

## Scene 1 · The problem (0:00–0:20)

**On screen:** the home page loads. The LIFEBOAT wordmark etches itself in, square by square.
Once it settles, sweep the pointer slowly across the letters: they break up where it passes.

**Say:**
> Every Ethereum wallet is protected by a key. The first time you send a transaction,
> part of that key, the public key, becomes visible to everyone. Today that's fine. But a
> large enough quantum computer could turn that public key back into your private key, and
> empty your wallet. Lifeboat gets you out before that day comes.

---

## Scene 2 · Check an address (0:20–0:40)

**On screen:** click **Check an address** (the page scrolls to "Is your key already out?").
Paste the address, click **Check**. Result: **Exposed: this account would need to move**.
Open **How this was checked** for a second.

**Say:**
> First, check any address. This one is exposed: it has sent thousands of transactions, so
> its public key is out there. And the check itself is private. It goes through Tor or a
> mixnet, so nobody learns which address you looked up.

---

## Scene 3 · Move (0:40–1:20)

**On screen:** click **2 Move** in the nav. Click through: **Get test money** → **Send one
transaction** → **Make keys** (pause on "1,024 one-time keys, made in this browser") →
**Download** → **I saved it** → **Try the public mempool first** (the panel shows "Refused") →
**Move everything**. *Cut the wait.* Show "Done in one transaction. The old account is empty and
your funds are in the new one." and the panel's second row: "Let in and done". Then click the
transaction hash in that line: the explorer opens on it, showing **On chain**, the payer (our
sponsor) and its six frames. Hold for about 3 seconds, then switch back to the app tab.

**Say:**
> Here's a practice account in the same situation. Lifeboat makes it a new set of quantum-safe
> keys, a thousand and twenty-four of them, right here in the browser. They never leave this device.
>
> Then one click creates the new account and moves everything into it, the ETH and the tokens,
> in a single transaction. All of it moves, or none of it does. And it's free: a sponsor pays
> the fee. Ethereum's normal mempool refuses this transaction. The new alternative mempool lets
> it in. Done. The old account is empty, and here it is on the network's explorer.

---

## Scene 4 · Use it (1:20–1:35)

**On screen:** click the **Next: Open your new account** card. Status reads **Hybrid: two locks**.
Click **Send**. Point at the key grid: one orange square fills, "key 9 of 1,024 is next".

**Say:**
> This is the new account. Every payment is signed twice: with the old key, and with one of the
> new quantum-safe keys. Each orange square is a key that's been used once, and is now retired.

---

## Scene 5 · Try to break in (1:35–2:10)

**On screen:** click **4 Try to break in**. Point at "Its stolen key (handed over)". Click
**Send the forgery** → "Refused". Click **Replay it** → "Refused". Point at "Still in the account".

**Say:**
> Now let's pretend that day has arrived. We hand an attacker the old private key, exactly what
> a quantum computer would recover. On a normal wallet, that's game over.
>
> The attacker signs a transaction to drain the account, and fakes the quantum-safe part.
> Refused. They try something smarter: copying a real quantum-safe signature from an earlier
> payment. Also refused. Each signature only works for the one transaction it was made for.
> The money stays put.

---

## Scene 6 · Turn off the old key (2:10–2:30)

**On screen:** click the **Next: Last step: turn off the old key** card. Under "Turn off the old key
for good", click **Turn it off** → **Yes, turn off the old key**. The status changes to
**Quantum-safe only**. Send 0.01 ETH; another square fills. All four steps in the nav are ticked.

**Say:**
> Today the account asks for both keys. When the threat is real, one switch turns the old key
> off for good. From then on, only the quantum-safe keys count. And payments keep working.

---

## Scene 7 · Public log, and close (2:30–3:00)

**On screen:** click **Log** in the header. Click **Check against the chain** on the top row →
"Matches the chain". Then back to the home page, pointer resting on the wordmark.

**Say:**
> If you choose, your move is listed on a public log on Arkiv, so the record outlives this test
> network. You don't have to trust it: one click checks it against the real transaction.
>
> Quantum-safe signatures already exist. What didn't exist was a way to get your account there.
> Lifeboat is that way: check, move in one free transaction, and stay safe after the day
> quantum computers arrive.

---

## If something goes wrong while recording

| Problem | Fix |
|---|---|
| "The shared test-money tap is empty" | `pnpm devnet fund <address on the page> 0.1`; the step continues by itself |
| "Move everything" takes longer than 20 s | Keep recording and cut the wait. If the alt mempool gives up on it ("relayed N times without being included"), the app hands it the same transaction again automatically |
| Check says "Connecting" or "Checking" for a while | It's waiting on the Nym mixnet. Cut the wait. If it says the private network is too slow, press Check again |
| "No private connection could be opened" | Skip the privacy line in Scene 2; **Check directly** still works (not private, and it says so) |
| Devnet was reset (our contracts gone) | `pnpm devnet setup`, put the three printed addresses in `web/lib/deployment.ts`, restart `pnpm web`, start over with a new demo wallet |
| Devnet RPC returns 502 for a moment | Wait a few seconds and click again; it has recovered on its own so far |

## Words to avoid on camera
"Merkle tree", "WOTS+C", "VERIFY frame", "nonce", "paymaster", "ECDSA". Use instead: "a set of
one-time keys", "quantum-safe signature", "the account checks it", "each key works once",
"a sponsor pays the fee", "the old key".
