import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Copy } from "lucide-react";
import { bytesToHex, parseEther, type Address } from "viem";
import { readMigrations, type LogRow } from "../../src/arkiv/log.js";
import { deployment, KEY_TREE_HEIGHT } from "../lib/deployment.js";
import { KeyGrid } from "./KeyGrid.js";
import { ago, dusd, eth, short } from "./format.js";
import { useAction, useWallet } from "./wallet-context.js";
import { Next, Term, Typed } from "./guide.js";

function useLog(lifeboat: Address | undefined) {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!lifeboat) return;
    readMigrations(deployment.arkivPublisher, { lifeboat }).then(setRows, () => setFailed(true));
  }, [lifeboat]);
  return { rows, failed };
}

export function AccountPage() {
  const { wallet, keys, snapshot, refresh, touch, deriveKeys } = useWallet();
  const { busy, error, run } = useAction();
  const [amount, setAmount] = useState("0.0100");
  const [to, setTo] = useState<string>(deployment.recipient);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const lb = snapshot?.lifeboat;
  const log = useLog(wallet.state.lifeboat);

  const signed = useMemo(() => new Set(Object.keys(wallet.state.journal).map(Number)), [wallet.state.journal, snapshot]);

  if (!wallet.state.lifeboat) {
    return (
      <>
        <p className="meta" style={{ margin: "0 0 8px" }}>Step 3 of 4</p>
        <h1>You don't have a Lifeboat account yet</h1>
        <p className="lede">Do step 2 first: it gives you a practice account and moves it here in one transaction.</p>
        <a className="btn primary" href="/move">Go to step 2</a>
      </>
    );
  }

  const act = (label: string, fn: () => Promise<unknown>) =>
    run(label, async () => {
      await fn();
      await refresh();
      touch();
    });

  const keysReady = keys.state === "ready";
  const nextLeaf = lb ? Number(lb.nonce - lb.nonceBase) : 0;
  const pqOnly = lb?.mode === "PQ_ONLY";

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end", flexWrap: "wrap", marginBottom: 32 }}>
        <div>
          <p className="meta" style={{ margin: "0 0 8px" }}>Step 3 of 4 · on the test network</p>
          <Typed as="h1" text="Your Lifeboat account" />
          <p className="mono t2" style={{ margin: 0, overflowWrap: "anywhere" }}>{wallet.state.lifeboat}</p>
        </div>
        <span className="status">
          <span className={`dot ${pqOnly ? "positive" : "accent"}`} />
          {lb ? (
            pqOnly ? (
              "Quantum-safe only"
            ) : (
              <Term t="Hybrid">Hybrid: two locks</Term>
            )
          ) : (
            "Reading"
          )}
        </span>
      </div>

      <div className="grid-2">
        <div className="stack-16">
          <section className="card">
            <div className="row" style={{ gap: 48, flexWrap: "wrap" }}>
              <div>
                <div className="meta">ETH</div>
                <div className="mono num" style={{ fontSize: 30, lineHeight: 1, marginTop: 8 }}>{lb ? eth(lb.eth) : "…"}</div>
              </div>
              <div>
                <div className="meta">dUSD</div>
                <div className="mono num" style={{ fontSize: 30, lineHeight: 1, marginTop: 8 }}>{lb ? dusd(lb.dusd) : "…"}</div>
              </div>
            </div>
            <hr className="rule" />
            <h2>Send money</h2>
            <p className="t2 small" style={{ marginTop: 0 }}>
              {pqOnly ? (
                "Only your quantum-safe key can sign now. The old key no longer counts for anything."
              ) : (
                <>
                  Each send is signed twice: with your old <Term t="ECDSA" /> key and with your next{" "}
                  <Term t="one-time key" />. Either one alone is refused. Watch a square on the right fill in.
                </>
              )}
            </p>
            <form
              className="field"
              onSubmit={(e) => {
                e.preventDefault();
                void act("send", () => wallet.send(to as Address, parseEther(amount)));
              }}
            >
              <input className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Recipient" title="Recipient address (a demo address is filled in)" spellCheck={false} />
              <input className="input" style={{ flex: "0 0 120px" }} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in ETH" />
              <button className="btn primary" disabled={!keysReady || !!busy}>
                {busy === "send" ? "Sending" : "Send"}
              </button>
            </form>
            {!keysReady && <p className="meta" style={{ marginBottom: 0 }}>Loading your quantum-safe keys in this browser, about 5 seconds</p>}
          </section>

          {!pqOnly && (
            <section className="card">
              <h2>Turn off the old key for good</h2>
              <p className="t2 small">
                Right now the old key still co-signs. Once quantum computers are a real threat, switch it off: from then on
                only your quantum-safe keys count. This can't be undone. Try step 4 first if you'd like to see the attack fail
                both ways.
              </p>
              {!confirmSwitch ? (
                <button className="btn secondary" disabled={!keysReady || !!busy} onClick={() => setConfirmSwitch(true)}>
                  Turn it off
                </button>
              ) : (
                <div className="row">
                  <button className="btn primary" disabled={!!busy} onClick={() => void act("switch", () => wallet.enablePqOnly())}>
                    {busy === "switch" ? "Switching" : "Yes, turn off the old key"}
                  </button>
                  <button className="btn quiet" onClick={() => setConfirmSwitch(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </section>
          )}

          {error && <div className="notice negative small">{error}</div>}
        </div>

        <div className="stack-16">
          <section className="card">
            <h2>Your 1,024 one-time keys</h2>
            <p className="t2 small">
              Each square is one quantum-safe key. A key signs a single transaction, then it's used up and turns orange. Grey
              squares were skipped and can't be used.
            </p>
            <KeyGrid total={1 << KEY_TREE_HEIGHT} nextLeaf={nextLeaf} signed={signed} />
            {nextLeaf >= 900 && (
              <p className="small" style={{ color: "var(--caution)", marginBottom: 0 }}>
                {1024 - nextLeaf} keys left. Rotate to a fresh tree before they run out.
              </p>
            )}
            <hr className="rule" />
            <div className="row between" style={{ flexWrap: "wrap" }}>
              <span className="t2 small">Running low? Swap in 1,024 fresh keys. You can do it any time.</span>
              <button
                className="btn secondary small"
                disabled={!keysReady || !!busy}
                onClick={() =>
                  void act("rotate", async () => {
                    const seed = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
                    await wallet.rotate({ seed, kp: await deriveKeys(seed) });
                  })
                }
              >
                {busy === "rotate" ? "Rotating" : "Rotate keys"}
              </button>
            </div>
          </section>

          <section className="card small">
            <h2>Public list of moves</h2>
            {log.failed && <p className="t2">Arkiv is unreachable right now. The account doesn't depend on it.</p>}
            {!log.failed && log.rows === null && <p className="t2">Reading Arkiv…</p>}
            {log.rows?.length === 0 && (
              <>
                <p className="t2">
                  Your move isn't listed. Listing is optional: it adds your move to a public record on <Term t="Arkiv" />,
                  using only facts already visible in the transaction.
                </p>
                {wallet.state.migration &&
                  (optIn ? (
                    <>
                      <p className="t2" style={{ marginBottom: 8 }}>Hand this to the publisher, or run it if you are one:</p>
                      <div className="row" style={{ gap: 8 }}>
                        <code className="mono small" style={{ overflowWrap: "anywhere" }}>pnpm devnet publish {wallet.state.migration.hash}</code>
                        <button className="btn quiet small" aria-label="Copy command" onClick={() => void navigator.clipboard?.writeText(`pnpm devnet publish ${wallet.state.migration!.hash}`)}>
                          <Copy size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <button className="btn secondary small" onClick={() => setOptIn(true)}>
                      List my migration
                    </button>
                  ))}
              </>
            )}
            {log.rows?.map((r) => (
              <dl className="facts" key={r.key} style={{ marginTop: 8 }}>
                <dt>Listed</dt>
                <dd>{r.assets}</dd>
                <dt>From</dt>
                <dd>{short(r.exposed)}</dd>
                <dt>Block</dt>
                <dd>{r.block.toString()}</dd>
                <dt>Entity</dt>
                <dd>{short(r.key, 10, 6)}</dd>
              </dl>
            ))}
          </section>

          <section className="card small">
            <h2>What happened so far</h2>
            <ul className="list">
              {wallet.state.activity.slice(0, 8).map((a, i) => (
                <li key={i}>
                  <span>
                    {a.kind}
                    {a.note && <span className="meta"> · {a.note}</span>}
                  </span>
                  <span className="meta">
                    {a.hash ? (
                      <a href={deployment.txUrl(a.hash)} target="_blank" rel="noreferrer" title={`${a.hash} on the explorer`}>
                        {short(a.hash, 6, 4)} <ArrowUpRight size={12} strokeWidth={1.5} />
                      </a>
                    ) : null}{" "}
                    {ago(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <Next href="/qday" title={pqOnly ? "Try to break in again" : "Try to break in"}>
        Step 4 of 4. Pretend a quantum computer stole the old key, and try to take the money.
      </Next>
    </>
  );
}
