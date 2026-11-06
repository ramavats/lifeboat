import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { RpcClient, checkExposure, type Exposure } from "../../src/exposure/check.js";
import { NETWORKS, startAnon, type AnonSession } from "../anon.js";
import { eth, int } from "./format.js";
import { LifeboatFigure } from "./LifeboatFigure.js";
import { Details, Next, StepMark, Term, markChecked } from "./guide.js";

const MAINNET_RPC = "https://ethereum-rpc.publicnode.com";

type Net = { state: "connecting" } | { state: "ready"; secs: number } | { state: "failed"; reason: string };

/** One Anon-RPC session per page load, warmed up before anyone types an address. */
function useAnon() {
  const session = useRef<AnonSession | null>(null);
  const [net, setNet] = useState<Net>({ state: "connecting" });
  useEffect(() => {
    // React may mount this twice in development: ignore whatever a closed session reports.
    let live = true;
    const t0 = performance.now();
    const s = startAnon("tor-js", MAINNET_RPC, () => {});
    session.current = s;
    setNet({ state: "connecting" });
    s.worker.ready.then(
      () => live && setNet({ state: "ready", secs: (performance.now() - t0) / 1000 }),
      (e) => live && setNet({ state: "failed", reason: (e as Error).message }),
    );
    return () => {
      live = false;
      s.close();
    };
  }, []);
  return { session, net };
}

const STATUS = {
  exposed: { dot: "caution", label: "Exposed: this account would need to move" },
  "not-exposed": { dot: "positive", label: "Not exposed yet: its key has never been published" },
  contract: { dot: "", label: "A contract, not a personal account" },
} as const;

export function CheckPage() {
  const { session, net } = useAnon();
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<(Exposure & { secs: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(e?: React.FormEvent) {
    e?.preventDefault();
    const a = address.trim();
    if (!session.current || !a) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const t0 = performance.now();
    try {
      // The checked address is the isolation key: checks of different addresses can't be linked.
      const rpc = new RpcClient(MAINNET_RPC, session.current.fetchFor(a.toLowerCase()));
      const r = await checkExposure(rpc, a);
      setResult({ ...r, secs: (performance.now() - t0) / 1000 });
      markChecked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="split" style={{ marginBottom: 64 }}>
        <div>
          <h1>Get your Ethereum account out before quantum computers arrive</h1>
          <p className="lede">
            Most Ethereum accounts have already revealed the clue a future quantum computer needs to take them over. Lifeboat
            checks whether yours has, then moves everything into a new account it can't break into.
          </p>
          <form className="field" onSubmit={check}>
            <input
              className="input"
              placeholder="Paste any Ethereum address: 0x…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-label="Ethereum address"
            />
            <button className="btn primary" disabled={busy || net.state !== "ready" || !address.trim()}>
              <Search size={16} strokeWidth={1.5} />
              {busy ? "Checking" : "Check"}
            </button>
          </form>
          <p className="meta" style={{ marginTop: 12 }}>
            {net.state === "connecting" && "Opening a private connection through Tor, about 10 seconds. Nobody learns which address you check"}
            {net.state === "ready" && "Private connection ready. Nobody learns which address you check"}
            {net.state === "failed" && `The private connection could not start: ${net.reason}`}
          </p>
          <p className="small t2" style={{ marginTop: 16 }}>
            No address handy? <a href="#/move">Skip straight to the demo</a>: it gives you a practice account with test money.
          </p>
        </div>
        <LifeboatFigure />
      </section>

      {error && <div className="notice negative small">{error}</div>}

      {result && (
        <section className="card" aria-live="polite" style={{ marginBottom: 48 }}>
          <span className="status">
            <span className={`dot ${STATUS[result.status].dot}`} />
            {STATUS[result.status].label}
          </span>
          <p style={{ margin: "12px 0 20px" }}>{result.why}</p>
          <dl className="facts">
            <dt>Address</dt>
            <dd>{result.address}</dd>
            <dt>Transactions sent</dt>
            <dd>{int(result.nonce)}</dd>
            <dt>Balance</dt>
            <dd>{eth(result.balanceWei)} ETH</dd>
          </dl>
          <Details summary="How this was checked">
            <p>
              {result.reads} reads of Ethereum mainnet at block {int(result.block)}, sent through {NETWORKS["tor-js"].label} with
              Anon-RPC in {result.secs.toFixed(1)}s. The data provider saw a Tor exit, not you, and can't link this check to
              another one.
            </p>
          </Details>
          <hr className="rule" />
          <p className="small" style={{ margin: 0 }}>
            {result.status === "exposed"
              ? "Your real account can't move yet: the new account type Lifeboat uses isn't on Ethereum mainnet. "
              : "Nothing to do for this one today. "}
            You can try the whole move now on a <Term t="test network" /> with a practice account, in about a minute.
          </p>
        </section>
      )}

      <section className="story" aria-label="The problem">
        <div>
          <span className="meta">Today</span>
          <h2>Your account is locked by one key</h2>
          <p className="t2 small">
            The first time you send a transaction, your account reveals its public key. That's normal and, today, harmless.
          </p>
        </div>
        <div>
          <span className="meta">
            On <Term t="Q-day" />
          </span>
          <h2>That public key gives the lock away</h2>
          <p className="t2 small">
            A large enough quantum computer can work back from the public key to the private key, and spend everything in the
            account.
          </p>
        </div>
        <div>
          <span className="meta">With Lifeboat</span>
          <h2>A second lock it can't pick</h2>
          <p className="t2 small">
            Your funds move to an account that also needs a <Term t="quantum-safe">quantum-safe</Term> signature. The stolen key
            alone gets the attacker nothing.
          </p>
        </div>
      </section>

      <section style={{ paddingTop: 32, borderTop: "1px solid var(--line)" }}>
        <h2>What you'll do here, in about a minute</h2>
        <p className="t2 small" style={{ margin: 0 }}>
          Everything after this page runs on a test network with test money. Nothing real is at stake, and your keys never
          leave this browser.
        </p>
        <ol className="plan">
          {[
            ["Check", "See whether an address has revealed its key."],
            ["Move", "Get a practice account and move all of it into a Lifeboat account, in one free transaction."],
            ["Use it", "Send money from the new account and watch one of its 1,024 one-time keys get used."],
            ["Try to break in", "Play the attacker with the stolen old key. The network refuses you."],
          ].map(([t, d], i) => (
            <li key={t}>
              <div className="row">
                <StepMark n={i + 1} done={false} />
                {t}
              </div>
              <p className="t2 small">{d}</p>
            </li>
          ))}
        </ol>
        <Details summary="The numbers, for developers">
          <dl className="facts small" style={{ marginTop: 4 }}>
            <dt>Signature</dt>
            <dd>XMSS with WOTS+C over keccak256, 4,424 bytes</dd>
            <dt>Verification</dt>
            <dd>48,600 gas, fixed</dd>
            <dt>Keys per account</dt>
            <dd>1,024, then rotate</dd>
            <dt>Runs on</dt>
            <dd>EIP-8141 frame transactions, ERC-8421 alt mempool devnet</dd>
          </dl>
        </Details>
      </section>

      <Next href="#/move" title="Move a practice account to safety">
        Step 2 of 4. Takes about a minute, costs nothing.
      </Next>
    </>
  );
}
