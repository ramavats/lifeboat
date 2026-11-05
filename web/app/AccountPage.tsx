import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { parseEther, type Address } from "viem";
import { readMigrations, type LogRow } from "../../src/arkiv/log.js";
import { deployment, KEY_TREE_HEIGHT } from "../lib/deployment.js";
import { REASON_TEXT } from "../lib/wallet.js";
import { KeyGrid } from "./KeyGrid.js";
import { ago, dusd, eth, short } from "./format.js";
import { useAction, useWallet } from "./wallet-context.js";

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
  const { wallet, keys, snapshot, refresh, touch } = useWallet();
  const { busy, error, run } = useAction();
  const [amount, setAmount] = useState("0.0100");
  const [to, setTo] = useState<string>(deployment.recipient);
  const [attack, setAttack] = useState<string | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const lb = snapshot?.lifeboat;
  const log = useLog(wallet.state.lifeboat);

  const signed = useMemo(() => new Set(Object.keys(wallet.state.journal).map(Number)), [wallet.state.journal, snapshot]);

  if (!wallet.state.lifeboat) {
    return (
      <>
        <h1>No Lifeboat account yet</h1>
        <p className="lede">Move an exposed account aboard first. It takes one transaction.</p>
        <a className="btn primary" href="#/move">Move aboard</a>
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
          <p className="meta" style={{ margin: "0 0 8px" }}>Lifeboat account · alt-mempool devnet</p>
          <h1 className="mono" style={{ fontSize: 28, maxWidth: "none", margin: 0, overflowWrap: "anywhere" }}>
            {wallet.state.lifeboat}
          </h1>
        </div>
        <span className="status">
          <span className={`dot ${pqOnly ? "positive" : "accent"}`} />
          {lb ? (pqOnly ? "Quantum-safe only" : "Hybrid") : "Reading"}
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
            <p className="t2 small" style={{ marginTop: 0 }}>
              {pqOnly
                ? "Every transaction needs the quantum-safe signature. The old ECDSA key no longer counts."
                : "Every transaction needs two signatures: the old ECDSA key and a quantum-safe one. Either alone is refused."}
            </p>
            <form
              className="field"
              onSubmit={(e) => {
                e.preventDefault();
                void act("send", () => wallet.send(to as Address, parseEther(amount)));
              }}
            >
              <input className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Recipient" spellCheck={false} />
              <input className="input" style={{ flex: "0 0 120px" }} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in ETH" />
              <button className="btn primary" disabled={!keysReady || !!busy}>
                {busy === "send" ? "Sending" : "Send"}
              </button>
            </form>
            {!keysReady && <p className="meta" style={{ marginBottom: 0 }}>Rebuilding the quantum-safe keys from the seed in this browser</p>}
          </section>

          {!pqOnly && (
            <section className="card">
              <h2>Switch to quantum-safe only</h2>
              <p className="t2 small">
                For the day ECDSA keys can be derived from public keys. After the switch the old key is ignored. It can't
                be undone, and the switch is itself signed with a quantum-safe key.
              </p>
              {!confirmSwitch ? (
                <button className="btn secondary" disabled={!keysReady || !!busy} onClick={() => setConfirmSwitch(true)}>
                  Switch
                </button>
              ) : (
                <div className="row">
                  <button className="btn primary" disabled={!!busy} onClick={() => void act("switch", () => wallet.enablePqOnly())}>
                    {busy === "switch" ? "Switching" : "Yes, ignore ECDSA from now on"}
                  </button>
                  <button className="btn quiet" onClick={() => setConfirmSwitch(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="card">
            <h2>Q-day test</h2>
            <p className="t2 small">
              Act as an attacker who has the old ECDSA private key, as a quantum computer would. They sign the ECDSA part
              perfectly and fill the quantum-safe slot with a forgery of the right size.
            </p>
            <button
              className="btn secondary"
              disabled={!!busy}
              onClick={() =>
                void act("attack", async () => {
                  const e = await wallet.attack();
                  setAttack(e.reason ?? e.message);
                })
              }
            >
              {busy === "attack" ? "Attacking" : "Try to drain the account"}
            </button>
            {attack && (
              <div className="notice positive small" style={{ marginTop: 16 }}>
                <span className="status">
                  <ShieldCheck size={16} strokeWidth={1.5} /> Refused by the mempool
                </span>
                <p style={{ margin: "4px 0 0" }}>{REASON_TEXT[attack] ?? attack}</p>
                <p className="meta" style={{ margin: "4px 0 0" }}>{attack}</p>
              </div>
            )}
          </section>

          {error && <div className="notice negative small">{error}</div>}
        </div>

        <div className="stack-16">
          <section className="card">
            <h2>Keys</h2>
            <p className="t2 small">Each cell is one quantum-safe key. A key signs once, then it's spent.</p>
            <KeyGrid total={1 << KEY_TREE_HEIGHT} nextLeaf={nextLeaf} signed={signed} />
          </section>

          <section className="card small">
            <h2>Public log</h2>
            {log.failed && <p className="t2">Arkiv is unreachable right now. The account doesn't depend on it.</p>}
            {!log.failed && log.rows === null && <p className="t2">Reading Arkiv…</p>}
            {log.rows?.length === 0 && (
              <p className="t2" style={{ marginBottom: 0 }}>
                Not listed. Listing a migration on the public Arkiv log is opt-in: only facts already in the migration
                transaction, published by this deployment's publisher.
              </p>
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
            <h2>Activity</h2>
            <ul className="list">
              {wallet.state.activity.slice(0, 8).map((a, i) => (
                <li key={i}>
                  <span>
                    {a.kind}
                    {a.note && <span className="meta"> · {a.note}</span>}
                  </span>
                  <span className="meta">
                    {a.hash ? (
                      <a href={deployment.explorer} target="_blank" rel="noreferrer" title={a.hash}>
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
    </>
  );
}
