import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import type { Address } from "viem";
import { readMigrations, type LogRow } from "../../src/arkiv/log.js";
import { call } from "../../src/frame/devnet.js";
import { summarizeMigrationTx } from "../../src/frame/migrate.js";
import { deployment } from "../lib/deployment.js";
import { eth, int, short } from "./format.js";
import { Term, Typed } from "./guide.js";

type Filter = "all" | "sponsored" | "self";
type Verdict = { state: "checking" } | { state: "ok" } | { state: "mismatch"; why: string };

/** Re-derive a log entry from the devnet: the log is an index, the chain is the record. */
async function verify(r: LogRow): Promise<Verdict> {
  try {
    const t = await call("eth_getTransactionByHash", [r.txHash]);
    if (!t) return { state: "mismatch", why: "the devnet no longer has this transaction (it may have been reset)" };
    const s = summarizeMigrationTx(t);
    if (s.lifeboat !== r.lifeboat.toLowerCase()) return { state: "mismatch", why: "it moved funds into a different account" };
    if (s.exposed !== r.exposed.toLowerCase()) return { state: "mismatch", why: "it was sent by a different account" };
    if (s.ethWei !== r.ethWei) return { state: "mismatch", why: "it moved a different amount of ETH" };
    return { state: "ok" };
  } catch (e) {
    return { state: "mismatch", why: (e as Error).message };
  }
}

export function LogPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<LogRow[] | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});

  useEffect(() => {
    setRows(null);
    setFailed(null);
    readMigrations(deployment.arkivPublisher, { sponsored: filter === "all" ? undefined : filter === "sponsored", limit: 50 }).then(
      setRows,
      (e) => setFailed((e as Error).message),
    );
  }, [filter]);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    const a = lookup.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return setFound([]);
    setFound(null);
    setFound(await readMigrations(deployment.arkivPublisher, { exposed: a as Address }).catch(() => []));
  }

  const check = async (r: LogRow) => {
    setVerdicts((v) => ({ ...v, [r.key]: { state: "checking" } }));
    const res = await verify(r);
    setVerdicts((v) => ({ ...v, [r.key]: res }));
  };

  const Row = ({ r }: { r: LogRow }) => {
    const v = verdicts[r.key];
    return (
      <li className="logrow">
        <span className="mono num muted">{int(r.block)}</span>
        <span className="mono nowrap">
          {short(r.exposed)} <span className="muted">→</span> {short(r.lifeboat)}
        </span>
        <span>{r.assets}</span>
        <span className="small t2">{r.sponsored ? "sponsored" : "self-paid"}</span>
        <span className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          {!v && (
            <button className="btn quiet small" onClick={() => void check(r)}>
              Check against the chain
            </button>
          )}
          {v?.state === "checking" && <span className="meta">Checking</span>}
          {v?.state === "ok" && (
            <span className="status small">
              <Check size={16} strokeWidth={1.5} /> Matches the chain
            </span>
          )}
          {v?.state === "mismatch" && <span className="small" style={{ color: "var(--negative)" }}>Doesn't match: {v.why}</span>}
        </span>
      </li>
    );
  };

  return (
    <>
      <Typed as="h1" text="Public list of moves" />
      <p className="lede">
        Accounts whose owners chose to share that they moved to Lifeboat. It holds only facts already public in each move,
        kept on <Term t="Arkiv" /> so the record lasts after the test network resets. Don't take the list's word for it:
        check any row against the chain.
      </p>

      <div className="stack-16">
        <section className="card">
          <div className="row between" style={{ flexWrap: "wrap", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Recent moves</h2>
            <div className="nav" role="tablist" aria-label="Filter">
              {(["all", "sponsored", "self"] as Filter[]).map((f) => (
                <a
                  key={f}
                  href="#/log"
                  role="tab"
                  aria-current={filter === f ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    setFilter(f);
                  }}
                >
                  {f === "all" ? "All" : f === "sponsored" ? "Sponsored" : "Self-paid"}
                </a>
              ))}
            </div>
          </div>
          {failed && <p className="t2">Arkiv is unreachable right now ({failed}). Migrations don't depend on it.</p>}
          {!failed && rows === null && <p className="t2">Reading Arkiv…</p>}
          {rows?.length === 0 && <p className="t2">No migrations listed{filter !== "all" ? " for this filter" : ""} yet.</p>}
          {rows && rows.length > 0 && (
            <ul className="list">
              {rows.map((r) => (
                <Row key={r.key} r={r} />
              ))}
            </ul>
          )}
        </section>

        <aside className="grid-halves">
          <section className="card small">
            <h2>Did this address move?</h2>
            <form className="field" onSubmit={find} style={{ marginTop: 12 }}>
              <input className="input" placeholder="0x… old address" value={lookup} onChange={(e) => setLookup(e.target.value)} spellCheck={false} aria-label="Old address" />
              <button className="btn secondary" aria-label="Look up">
                <Search size={16} strokeWidth={1.5} />
              </button>
            </form>
            {found?.length === 0 && <p className="t2" style={{ marginBottom: 0 }}>Not on the log. It may have moved without listing it.</p>}
            {found?.map((r) => (
              <p key={r.key} style={{ marginBottom: 0 }}>
                Moved to <span className="mono">{short(r.lifeboat)}</span> in block {int(r.block)}: {r.assets}.
              </p>
            ))}
            <p className="meta" style={{ marginBottom: 0 }}>
              Searches this list only, and isn't private: Arkiv sees what you look up. The check on the first page is the
              private one.
            </p>
          </section>

          <section className="card small">
            <h2>How entries get here</h2>
            <p className="t2">
              Only when an owner asks. Lifeboat's publisher first reads the move from the test network and confirms that
              everything went into a real Lifeboat account. Address checks from the first page are never recorded.
            </p>
            <dl className="facts">
              <dt>Publisher</dt>
              <dd>{short(deployment.arkivPublisher, 8, 6)}</dd>
              <dt>Schema</dt>
              <dd>lifeboat.migration.v1</dd>
              <dt>Kept for</dt>
              <dd>182 days, the chain's maximum</dd>
            </dl>
          </section>
        </aside>
      </div>
      <p className="meta" style={{ marginTop: 16 }}>
        Rows come from Arkiv's Rabdi testnet, filtered to the publisher's own entries: anyone can write to the schema, so
        nothing else is shown. {rows ? `${rows.length} shown, ${eth(rows.reduce((a, r) => a + r.ethWei, 0n))} ETH moved in total.` : ""}
      </p>
    </>
  );
}
