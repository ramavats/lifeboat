import { useState } from "react";
import { KeyRound, Repeat, ShieldCheck } from "lucide-react";
import { reasonText, type RejectedError } from "../lib/wallet.js";
import { eth, short } from "./format.js";
import { useAction, useWallet } from "./wallet-context.js";
import { Next, Term, Typed } from "./guide.js";

type Result = { at: number; kind: "forge" | "replay"; reason: string; raw: string };

/**
 * The demo's attacker view. Q-day is simulated the only honest way: we hand the attacker the
 * old ECDSA private key, which is exactly what a quantum computer would recover from the
 * public key. Everything else is a real transaction sent to the real mempool.
 */
export function QdayPage() {
  const { wallet, snapshot, refresh } = useWallet();
  const { busy, error, run } = useAction();
  const [results, setResults] = useState<Result[]>([]);
  const lb = snapshot?.lifeboat;
  const replayable = wallet.lastOwnSpend();

  if (!wallet.state.lifeboat) {
    return (
      <>
        <p className="meta" style={{ margin: "0 0 8px" }}>Step 4 of 4</p>
        <h1>Try to break in</h1>
        <p className="lede">There's nothing to break into yet. Do step 2 first, then come back and play the attacker.</p>
        <a className="btn primary" href="#/move">Go to step 2</a>
      </>
    );
  }

  const attack = (kind: Result["kind"]) =>
    run(kind, async () => {
      const e: RejectedError = kind === "forge" ? await wallet.attack() : await wallet.attackReplay();
      setResults((r) => [{ at: Date.now(), kind, reason: e.reason ?? "rejected", raw: e.message }, ...r]);
      await refresh();
    });

  return (
    <>
      <p className="meta" style={{ margin: "0 0 8px" }}>Step 4 of 4</p>
      <Typed as="h1" text="Try to break in" />
      <p className="lede">
        It's <Term t="Q-day" />. You're the attacker, and a quantum computer has handed you the old account's{" "}
        <Term t="private key" />. On any normal account that's game over. Try to take the money from the Lifeboat account.
      </p>

      <div className="grid-2">
        <div className="stack-16">
          <section className="card">
            <h2>What you, the attacker, have</h2>
            <dl className="facts" style={{ marginTop: 12 }}>
              <dt>The old account</dt>
              <dd>{wallet.exposedAddress}</dd>
              <dt>Its stolen key</dt>
              <dd>
                {wallet.state.exposedKey.slice(0, 10)}…{wallet.state.exposedKey.slice(-6)} <span className="muted">(handed over)</span>
              </dd>
              <dt>Your target</dt>
              <dd>{wallet.state.lifeboat}</dd>
              <dt>At stake</dt>
              <dd>{lb ? `${eth(lb.eth)} ETH` : "…"}</dd>
              <dt>Account mode</dt>
              <dd>{lb ? (lb.mode === "HYBRID" ? "Two locks: old key and quantum-safe key" : "Quantum-safe only") : "…"}</dd>
            </dl>
            <p className="t2 small" style={{ marginBottom: 0 }}>
              The key is shown because it's a throwaway test-network key. Never paste a real one anywhere.
            </p>
          </section>

          <section className="card">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <KeyRound size={18} strokeWidth={1.5} className="muted" style={{ marginTop: 4, flex: "none" }} />
              <div style={{ flex: 1 }}>
                <h2>Attack 1: fake the second signature</h2>
                <p className="t2 small">
                  Sign with the stolen key, which works perfectly. For the quantum-safe signature you don't have the key, so
                  send convincing-looking bytes instead.
                </p>
                <button className="btn secondary" disabled={!!busy} onClick={() => void attack("forge")}>
                  {busy === "forge" ? "Sending" : "Send the forgery"}
                </button>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <Repeat size={18} strokeWidth={1.5} className="muted" style={{ marginTop: 4, flex: "none" }} />
              <div style={{ flex: 1 }}>
                <h2>Attack 2: reuse a real signature</h2>
                <p className="t2 small">
                  Every transaction is public, signatures included. Copy the real quantum-safe signature from the account's
                  last send{replayable ? <> (<span className="mono">{short(replayable, 8, 4)}</span>)</> : null} and attach it
                  to your own transaction.
                </p>
                <button className="btn secondary" disabled={!!busy || !replayable} onClick={() => void attack("replay")}>
                  {busy === "replay" ? "Sending" : "Replay it"}
                </button>
                {!replayable && (
                  <p className="meta" style={{ marginBottom: 0 }}>
                    Send money from the account in step 3 first, so there's a real signature to copy.
                  </p>
                )}
              </div>
            </div>
          </section>
          {error && <div className="notice negative small">{error}</div>}
        </div>

        <section className="card" aria-live="polite">
          <h2>What the network said</h2>
          {results.length === 0 ? (
            <p className="t2 small" style={{ marginBottom: 0 }}>
              Nothing tried yet. Each attack is a real transaction sent to the test network, and its answer appears here.
            </p>
          ) : (
            <ul className="list" style={{ marginTop: 8 }}>
              {results.map((r) => (
                <li key={r.at} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                  <span className="status">
                    <ShieldCheck size={16} strokeWidth={1.5} /> Refused · {r.kind === "forge" ? "forged signature" : "replayed signature"}
                  </span>
                  <span className="small">{reasonText(r.reason)}</span>
                  <span className="meta" style={{ overflowWrap: "anywhere" }}>
                    {r.reason} · {r.raw.slice(0, 120)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <hr className="rule" />
          <p className="t2 small" style={{ margin: 0 }}>
            {lb ? `Still in the account: ${eth(lb.eth)} ETH.` : ""} Both attacks fail for the same reason: a quantum-safe
            signature only fits the one transaction it was made for, and only this browser holds the keys to make new ones.
          </p>
        </section>
      </div>

      {results.length > 0 &&
        (lb?.mode === "HYBRID" ? (
          <Next href="#/account" title="Last step: turn off the old key">
            The stolen key never worked on its own. Switch it off for good in your account, then attack again if you like.
          </Next>
        ) : (
          <Next href="#/how" title="See how it works">
            You've done the whole journey. Here's what happened under the hood.
          </Next>
        ))}
    </>
  );
}
