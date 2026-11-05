import { useState } from "react";
import { KeyRound, Repeat, ShieldCheck } from "lucide-react";
import { reasonText, type RejectedError } from "../lib/wallet.js";
import { eth, short } from "./format.js";
import { useAction, useWallet } from "./wallet-context.js";

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
        <h1>Q-day test</h1>
        <p className="lede">There's nothing to attack yet. Move an account aboard first, then come back with the stolen key.</p>
        <a className="btn primary" href="#/move">Move aboard</a>
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
      <h1>Q-day test</h1>
      <p className="lede">
        Play the attacker. Assume a quantum computer has recovered the old account's private key from its public key,
        then try to drain the Lifeboat account with it.
      </p>

      <div className="grid-2">
        <div className="stack-16">
          <section className="card">
            <h2>What the attacker has</h2>
            <dl className="facts" style={{ marginTop: 12 }}>
              <dt>Old address</dt>
              <dd>{wallet.exposedAddress}</dd>
              <dt>Its private key</dt>
              <dd>
                {wallet.state.exposedKey.slice(0, 10)}…{wallet.state.exposedKey.slice(-6)} <span className="muted">(handed over)</span>
              </dd>
              <dt>Target</dt>
              <dd>{wallet.state.lifeboat}</dd>
              <dt>At stake</dt>
              <dd>{lb ? `${eth(lb.eth)} ETH` : "…"}</dd>
              <dt>Account mode</dt>
              <dd>{lb ? (lb.mode === "HYBRID" ? "Hybrid: ECDSA and quantum-safe" : "Quantum-safe only") : "…"}</dd>
            </dl>
            <p className="t2 small" style={{ marginBottom: 0 }}>
              On an ordinary account, this key alone would be enough to take everything. The test key is shown because it's
              a throwaway devnet key.
            </p>
          </section>

          <section className="card">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <KeyRound size={18} strokeWidth={1.5} className="muted" style={{ marginTop: 4, flex: "none" }} />
              <div style={{ flex: 1 }}>
                <h2>Forge the quantum-safe signature</h2>
                <p className="t2 small">
                  Sign the ECDSA part with the stolen key, perfectly. Fill the quantum-safe slot with 4,424 bytes of the right
                  shape and no key behind them.
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
                <h2>Replay a real signature</h2>
                <p className="t2 small">
                  Every transaction's signatures are public. Copy the genuine quantum-safe signature out of the account's last
                  transaction{replayable ? <> (<span className="mono">{short(replayable, 8, 4)}</span>)</> : null} and attach it
                  to a new one.
                </p>
                <button className="btn secondary" disabled={!!busy || !replayable} onClick={() => void attack("replay")}>
                  {busy === "replay" ? "Sending" : "Replay it"}
                </button>
                {!replayable && (
                  <p className="meta" style={{ marginBottom: 0 }}>
                    Send one transaction from the account first, so there's a real signature to steal.
                  </p>
                )}
              </div>
            </div>
          </section>
          {error && <div className="notice negative small">{error}</div>}
        </div>

        <section className="card" aria-live="polite">
          <h2>What the mempool said</h2>
          {results.length === 0 ? (
            <p className="t2 small" style={{ marginBottom: 0 }}>
              Nothing sent yet. Each attempt is a real transaction to the alt mempool, and its answer lands here verbatim.
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
            {lb ? `Still in the account: ${eth(lb.eth)} ETH.` : ""} Both attacks fail for the same reason: the quantum-safe
            signature covers one transaction's exact hash, made with a key only this browser holds.
          </p>
        </section>
      </div>
    </>
  );
}
