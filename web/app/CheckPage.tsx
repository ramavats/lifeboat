import { useEffect, useRef, useState } from "react";
import { ArrowRight, Play, Search } from "lucide-react";
import { RpcClient, checkExposure, type Exposure } from "../../src/exposure/check.js";
import { NETWORKS, startAnon, type AnonSession } from "../anon.js";
import { eth, int } from "./format.js";
import { Details, Next, StepMark, Term, Typed, markChecked } from "./guide.js";
import { Mark } from "./PixelArt.js";
import { PixelHero } from "./PixelHero.js";

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
  const slot = useRef<HTMLDivElement>(null);
  const calm = useRef<HTMLDivElement>(null);
  const checkRef = useRef<HTMLElement>(null);
  const toCheck = () => {
    checkRef.current?.scrollIntoView({ block: "start" });
    setTimeout(() => checkRef.current?.querySelector("input")?.focus({ preventScroll: true }), 400);
  };

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

  const STEPS_HOME = [
    { href: "#/", title: "Check", text: "See whether an address has revealed its key. Private: the check goes through Tor.", cta: "Check an address", go: toCheck },
    { href: "#/move", title: "Move", text: "Get a practice account and move all of it into a Lifeboat account, in one free transaction.", cta: "Move a practice account" },
    { href: "#/account", title: "Use it", text: "Send money from the new account and watch one of its 1,024 one-time keys get used up.", cta: "Open your account" },
    { href: "#/qday", title: "Try to break in", text: "Play the attacker with the stolen old key. The network refuses you, every time.", cta: "Play the attacker" },
  ];

  return (
    <>
      <section className="hero bleed" aria-label="Lifeboat">
        <PixelHero slot={slot} calm={calm} />
        <div className="hero-body" ref={calm}>
          <a className="hero-chip" href="#/how">
            Live on the EIP-8141 test network: a whole account moved in one transaction <ArrowRight size={14} strokeWidth={1.75} />
          </a>
          <div ref={slot} className="hero-slot" role="img" aria-label="Lifeboat" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <h1>Move your Ethereum account to quantum-safe keys</h1>
            <p className="sub">
              Most accounts have already revealed what a future quantum computer needs to take them over. Lifeboat checks
              yours, then moves everything somewhere it can't follow.
            </p>
            <div className="ctas">
              <button className="btn primary" onClick={toCheck}>
                <Search size={16} strokeWidth={2} /> Check an address
              </button>
              <a className="btn secondary" href="#/move">
                <Play size={14} strokeWidth={2} fill="currentColor" /> Try the demo
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="band" ref={checkRef} style={{ scrollMarginTop: 56 }}>
        <div className="split">
          <div>
            <Typed className="section-h" text="Is your key already out?" />
            <p className="t2">
              The first time an account sends a transaction, it publishes its public key. Today that's harmless. A large
              enough quantum computer could work back from it to the private key and spend everything.
            </p>
            <p className="t2" style={{ marginBottom: 28 }}>
              Paste any Ethereum address to see whether it has. Nothing is signed and nothing is sent.
            </p>
            <form className="field" onSubmit={check}>
              <input
                className="input"
                placeholder="0x… any Ethereum address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                aria-label="Ethereum address"
              />
              <button className="btn primary" disabled={busy || net.state !== "ready" || !address.trim()}>
                {busy ? "Checking" : "Check"}
              </button>
            </form>
            <p className="meta" style={{ marginTop: 12 }}>
              {net.state === "connecting" && "Opening a private connection through Tor, about 10 seconds. Nobody learns which address you check"}
              {net.state === "ready" && "Private connection ready. Nobody learns which address you check"}
              {net.state === "failed" && `The private connection could not start: ${net.reason}`}
            </p>
            <p className="small t2" style={{ marginTop: 20 }}>
              No address handy? <a href="#/move">Skip straight to the demo</a>: it gives you a practice account with test money.
            </p>
          </div>

          <div aria-live="polite">
            {error && <div className="notice negative small" style={{ marginBottom: 16 }}>{error}</div>}
            {result ? (
              <section className="card">
                <span className="status">
                  <span className={`dot ${STATUS[result.status].dot}`} />
                  {STATUS[result.status].label}
                </span>
                <p style={{ margin: "14px 0 20px" }}>{result.why}</p>
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
                    {result.reads} reads of Ethereum mainnet at block {int(result.block)}, sent through {NETWORKS["tor-js"].label}{" "}
                    with Anon-RPC in {result.secs.toFixed(1)}s. The data provider saw a Tor exit, not you, and can't link this
                    check to another one.
                  </p>
                </Details>
                <hr className="rule" />
                <p className="small" style={{ margin: "0 0 16px" }}>
                  {result.status === "exposed"
                    ? "Your real account can't move yet: the new account type Lifeboat uses isn't on Ethereum mainnet. "
                    : "Nothing to do for this one today. "}
                  You can try the whole move now on a <Term t="test network" /> with a practice account, in about a minute.
                </p>
                <a className="btn secondary small" href="#/move">
                  Try the move <ArrowRight size={14} strokeWidth={1.75} />
                </a>
              </section>
            ) : (
              <div className="quote">
                <Mark size={4} />
                <p className="big">
                  An account that has sent even one transaction has shown its public key. That's all a quantum computer would
                  need.
                </p>
                <p className="meta" style={{ margin: 0 }}>
                  Fresh addresses that have only received funds are still hidden. Most active wallets are not.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="band alt">
        <Typed className="section-h" text="The problem, in three steps" />
        <p className="t2" style={{ maxWidth: "60ch", margin: 0 }}>
          Nothing is broken today. Lifeboat is for moving before that changes, not after.
        </p>
        <div className="story">
          <div>
            <span className="meta">01 · Today</span>
            <h2>Your account is locked by one key</h2>
            <p className="t2 small">
              The first time you send a transaction, your account reveals its public key. That's normal and, today, harmless.
            </p>
          </div>
          <div>
            <span className="meta">
              02 · On <Term t="Q-day" />
            </span>
            <h2>That public key gives the lock away</h2>
            <p className="t2 small">
              A large enough quantum computer can work back from the public key to the private key, and spend everything in the
              account.
            </p>
          </div>
          <div>
            <span className="meta">03 · With Lifeboat</span>
            <h2>A second lock it can't pick</h2>
            <p className="t2 small">
              Your funds move to an account that also needs a <Term t="quantum-safe">quantum-safe</Term> signature. The stolen key
              alone gets the attacker nothing.
            </p>
          </div>
        </div>
      </section>

      <section className="band">
        <Typed className="section-h" text="What you'll do here, in about a minute" />
        <p className="t2" style={{ maxWidth: "62ch", margin: 0 }}>
          After this page, everything runs on a test network with test money. Nothing real is at stake, and your keys never leave
          this browser.
        </p>
        <ol className="rows">
          {STEPS_HOME.map((s, i) => (
            <li key={s.title}>
              <div>
                <h3>
                  <StepMark n={i + 1} done={false} />
                  {s.title}
                </h3>
                <p className="t2">{s.text}</p>
              </div>
              <div className="act">
                {s.go ? (
                  <button className={`btn ${i === 0 ? "primary" : "secondary"}`} onClick={s.go}>
                    {s.cta}
                  </button>
                ) : (
                  <a className={`btn ${i === 1 ? "primary" : "secondary"}`} href={s.href}>
                    {s.cta} <ArrowRight size={16} strokeWidth={1.75} />
                  </a>
                )}
                <span className="meta">Step {i + 1} of 4</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="band alt">
        <div className="split">
          <div>
            <Typed className="section-h" text="Under the hood" />
            <p className="t2">
              The account checks a hash-based signature on every transaction, using only keccak256. Moving into it is a single
              EIP-8141 frame transaction, paid for by a sponsor that only the ERC-8421 alt mempool will accept.
            </p>
            <p className="t2" style={{ marginBottom: 0 }}>
              <a href="#/how">Read how it works</a>, or <a href="https://github.com/ramavats/lifeboat">browse the source</a>.
            </p>
          </div>
          <div className="card">
            <dl className="facts small">
              <dt>Signature</dt>
              <dd>XMSS with WOTS+C, 4,424 bytes</dd>
              <dt>Verification</dt>
              <dd>48,600 gas, fixed</dd>
              <dt>Keys per account</dt>
              <dd>1,024, then rotate</dd>
              <dt>The move</dt>
              <dd>one atomic transaction, fee sponsored</dd>
              <dt>Runs on</dt>
              <dd>EIP-8141 + ERC-8421 test network</dd>
            </dl>
          </div>
        </div>
        <Next href="#/move" title="Move a practice account to safety">
          Step 2 of 4. Takes about a minute, costs nothing.
        </Next>
      </section>
    </>
  );
}
