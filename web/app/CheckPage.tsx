import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { RpcClient, checkExposure, type Exposure } from "../../src/exposure/check.js";
import { NETWORKS, startAnon, type AnonSession } from "../anon.js";
import { eth, int } from "./format.js";
import { LifeboatFigure } from "./LifeboatFigure.js";

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
  exposed: { dot: "caution", label: "Exposed" },
  "not-exposed": { dot: "positive", label: "Not exposed yet" },
  contract: { dot: "", label: "Contract account" },
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
          <h1>Move your Ethereum account to quantum‑safe keys</h1>
          <p className="lede">
            Every account that has sent a transaction has published the public key a quantum computer would need.
            Check an address, then move it into an account that signs with hash-based keys.
          </p>
          <form className="field" onSubmit={check}>
            <input
              className="input"
              placeholder="0x… mainnet address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-label="Mainnet address"
            />
            <button className="btn primary" disabled={busy || net.state !== "ready" || !address.trim()}>
              <Search size={16} strokeWidth={1.5} />
              {busy ? "Checking" : "Check"}
            </button>
          </form>
          <p className="meta" style={{ marginTop: 12 }}>
            {net.state === "connecting" && "Connecting to Tor through Anon-RPC: your address never reaches the RPC from your IP"}
            {net.state === "ready" && `Private reads ready over Tor (${net.secs.toFixed(1)}s, client code verified onchain)`}
            {net.state === "failed" && `Anon-RPC could not start: ${net.reason}`}
          </p>
        </div>
        <LifeboatFigure />
      </section>

      {error && <div className="notice negative small">{error}</div>}

      {!result && (
        <section className="how" aria-label="How Lifeboat works">
          <div>
            <span className="meta">01 · Check</span>
            <h2>See whether the key is out</h2>
            <p className="t2 small">Five reads over Tor, pinned to one block. The RPC learns nothing about who asked.</p>
          </div>
          <div>
            <span className="meta">02 · Move aboard</span>
            <h2>One sponsored transaction</h2>
            <p className="t2 small">Every asset moves into a Lifeboat account at once. A staked sponsor pays the gas.</p>
          </div>
          <div>
            <span className="meta">03 · Stay aboard</span>
            <h2>Two signatures, then one</h2>
            <p className="t2 small">ECDSA plus a hash-based signature, until you switch ECDSA off for good.</p>
          </div>
          <dl className="facts small">
            <dt>Verification</dt>
            <dd>48,600 gas, fixed</dd>
            <dt>Signature</dt>
            <dd>4,424 bytes</dd>
            <dt>Keys per account</dt>
            <dd>1,024, then rotate</dd>
          </dl>
        </section>
      )}

      {result && (
        <section className="card" aria-live="polite">
          <div className="row between" style={{ flexWrap: "wrap" }}>
            <span className="status">
              <span className={`dot ${STATUS[result.status].dot}`} />
              {STATUS[result.status].label}
            </span>
            <span className="meta">
              {result.reads} of {result.reads} reads via {NETWORKS["tor-js"].label} · {result.secs.toFixed(1)}s · block {int(result.block)}
            </span>
          </div>
          <p style={{ margin: "12px 0 20px" }}>{result.why}</p>
          <dl className="facts">
            <dt>Address</dt>
            <dd>{result.address}</dd>
            <dt>Transactions sent</dt>
            <dd>{int(result.nonce)}</dd>
            <dt>Balance</dt>
            <dd>{eth(result.balanceWei)} ETH</dd>
          </dl>
          {result.status === "exposed" && (
            <>
              <hr className="rule" />
              <div className="row between" style={{ flexWrap: "wrap" }}>
                <span className="t2 small">
                  Moving happens on the EIP-8141 devnet today: frame transactions aren't on mainnet yet.
                </span>
                <a className="btn secondary small" href="#/move">
                  Try the move on the devnet <ArrowRight size={16} strokeWidth={1.5} />
                </a>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
