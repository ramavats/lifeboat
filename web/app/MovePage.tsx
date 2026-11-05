import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Copy, Download } from "lucide-react";
import { backupBlob } from "../lib/store.js";
import { dusd, eth, int, short } from "./format.js";
import { useAction, useWallet } from "./wallet-context.js";

function Step(p: { n: number; state: "done" | "active" | "todo"; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <li className={`step ${p.state === "todo" ? "" : p.state}`}>
      <span className="n">{p.n}</span>
      <div>
        <h3>{p.title}</h3>
        <div className="t2 small">{p.children}</div>
      </div>
      <div>{p.action}</div>
    </li>
  );
}

export function MovePage() {
  const { wallet, keys, snapshot, refresh, generateKeys, touch } = useWallet();
  const { busy, error, run } = useAction();
  const [backedUp, setBackedUp] = useState(false);
  const [publicTry, setPublicTry] = useState<{ accepted: boolean; message: string } | null>(null);

  const ex = snapshot?.exposed;
  const funded = !!ex && (ex.eth > 0n || ex.nonce > 0n || !!wallet.state.migration);
  const exposed = !!ex && ex.nonce > 0n;
  const keysReady = keys.state === "ready";
  const moved = !!wallet.state.migration;
  const step = !exposed ? 1 : !keysReady ? 2 : !backedUp && !moved ? 3 : !moved ? 5 : 6;
  const st = (n: number) => (n < step ? "done" : n === step ? "active" : "todo");

  const faucetEmpty = !!error && /faucet is (empty|disabled)/i.test(error);
  // When the faucet is dry, someone sends ETH by hand: watch for it to arrive.
  useEffect(() => {
    if (funded || !faucetEmpty) return;
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [funded, faucetEmpty, refresh]);

  const act = (label: string, fn: () => Promise<unknown>) =>
    run(label, async () => {
      await fn();
      await refresh();
      touch();
    });

  function download() {
    const url = URL.createObjectURL(backupBlob(wallet.state));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lifeboat-backup-${wallet.exposedAddress.slice(2, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1>Move aboard</h1>
      <p className="lede">
        Five steps, one transaction. Your quantum-safe keys are made in this browser and never leave it. It runs on the
        EIP-8141 devnet with a demo account, since frame transactions aren't on mainnet yet.
      </p>

      <div className="grid-2">
        <section className="card">
          <ol className="steps">
            <Step
              n={1}
              state={st(1)}
              title="An account with an exposed key"
              action={
                !funded ? (
                  <button className="btn secondary small" disabled={!!busy || !ex} onClick={() => act("fund", () => wallet.fund())}>
                    {busy === "fund" ? "Funding" : "Get devnet ETH"}
                  </button>
                ) : !exposed ? (
                  <button className="btn secondary small" disabled={!!busy} onClick={() => act("expose", () => wallet.expose())}>
                    {busy === "expose" ? "Sending" : "Send one transaction"}
                  </button>
                ) : null
              }
            >
              {ex ? (
                <>
                  Demo account <span className="mono">{short(ex.address)}</span>.{" "}
                  {exposed
                    ? `It has sent ${int(ex.nonce)} transaction${ex.nonce === 1n ? "" : "s"}, so its public key is onchain.`
                    : funded
                      ? "Funded. One ordinary transaction will publish its key, the way every real wallet's key gets published."
                      : faucetEmpty
                        ? "The shared devnet faucet is empty right now. Send it about 0.1 devnet ETH from any funded account and this step continues on its own:"
                        : "It needs devnet ETH from the faucet first."}
                  {!funded && faucetEmpty && (
                    <span className="row" style={{ marginTop: 8, gap: 8 }}>
                      <span className="mono" style={{ overflowWrap: "anywhere" }}>{ex.address}</span>
                      <button className="btn quiet small" aria-label="Copy address" onClick={() => void navigator.clipboard?.writeText(ex.address)}>
                        <Copy size={14} strokeWidth={1.5} />
                      </button>
                    </span>
                  )}
                </>
              ) : (
                "Reading the devnet…"
              )}
            </Step>

            <Step
              n={2}
              state={st(2)}
              title="Make quantum-safe keys"
              action={
                keys.state === "idle" ? (
                  <button className="btn secondary small" disabled={!exposed} onClick={generateKeys}>
                    Make keys
                  </button>
                ) : null
              }
            >
              {keys.state === "idle" && "1,024 one-time keys from a fresh seed, hashed in a background thread."}
              {keys.state === "generating" && (
                <>
                  <span className="mono">
                    {int(keys.done)} of {int(keys.total)}
                  </span>{" "}
                  keys
                  <div className="bar-progress">
                    <i style={{ width: `${(keys.done / keys.total) * 100}%` }} />
                  </div>
                </>
              )}
              {keys.state === "ready" && `1,024 one-time keys, made in this browser in ${(keys.ms / 1000).toFixed(1)}s.`}
            </Step>

            <Step
              n={3}
              state={moved ? "done" : st(3)}
              title="Back up the seed and the journal"
              action={
                keysReady && !moved ? (
                  <div className="row">
                    <button className="btn secondary small" onClick={download}>
                      <Download size={16} strokeWidth={1.5} /> Download
                    </button>
                    <button className="btn quiet small" onClick={() => setBackedUp(true)} disabled={backedUp}>
                      {backedUp ? "Stored" : "I stored it"}
                    </button>
                  </div>
                ) : null
              }
            >
              The journal records which key signed what. A one-time key must never sign twice, so losing it is worse
              than losing a password.
            </Step>

            <Step n={4} state={moved ? "done" : step >= 4 ? "done" : "todo"} title="Review what moves">
              {ex && (
                <dl className="facts" style={{ marginTop: 8 }}>
                  <dt>ETH</dt>
                  <dd>{eth(moved ? 0n : ex.eth)} ETH</dd>
                  <dt>Tokens</dt>
                  <dd>{dusd(moved ? 0n : ex.dusd)} dUSD</dd>
                  <dt>Gas</dt>
                  <dd>paid by the migration sponsor</dd>
                </dl>
              )}
            </Step>

            <Step
              n={5}
              state={st(5)}
              title="Move everything in one transaction"
              action={
                !moved ? (
                  <button className="btn primary" disabled={step !== 5 || !!busy} onClick={() => act("move", () => wallet.migrate())}>
                    {busy === "move" ? "Moving" : "Move everything"}
                  </button>
                ) : (
                  <a className="btn secondary small" href="#/account">
                    Open the account <ArrowRight size={16} strokeWidth={1.5} />
                  </a>
                )
              }
            >
              {moved ? (
                <>
                  Done in one atomic transaction <span className="mono">{short(wallet.state.migration!.hash, 10, 6)}</span>. The
                  old account is empty.
                </>
              ) : (
                "One sponsored frame transaction creates your Lifeboat account and moves every asset into it. All of it lands, or none of it does. You pay nothing, not even for the new account."
              )}
            </Step>
          </ol>
          {busy === "move" && <p className="meta" style={{ marginTop: 16 }}>Creating the account and moving, about 20 seconds on the devnet</p>}

          {(step >= 5 || moved) && (
            <div className="mempools">
              <div className="row between" style={{ flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>The same transaction, two mempools</h3>
                {!moved && !publicTry && (
                  <button className="btn quiet small" disabled={!!busy} onClick={() => void run("public", async () => setPublicTry(await wallet.tryPublicMempool()))}>
                    {busy === "public" ? "Sending" : "Try the public mempool first"}
                  </button>
                )}
              </div>
              <ul className="list small">
                <li>
                  <span>
                    <span className={`dot ${publicTry ? (publicTry.accepted ? "positive" : "negative") : ""}`} style={{ display: "inline-block", marginRight: 8 }} />
                    Ethereum's public mempool
                  </span>
                  <span className="t2">
                    {!publicTry && "not tried"}
                    {publicTry && !publicTry.accepted && (
                      <>
                        Refused · <span className="mono">{publicTry.message.slice(0, 60)}</span>
                      </>
                    )}
                    {publicTry?.accepted && publicTry.message}
                  </span>
                </li>
                <li>
                  <span>
                    <span className={`dot ${moved ? "positive" : ""}`} style={{ display: "inline-block", marginRight: 8 }} />
                    ERC-8421 alt mempool
                  </span>
                  <span className="t2">
                    {moved ? (
                      <>
                        Admitted and mined · <span className="mono">{short(wallet.state.migration!.hash, 8, 4)}</span>
                      </>
                    ) : (
                      "Move everything sends it here"
                    )}
                  </span>
                </li>
              </ul>
              {publicTry && !publicTry.accepted && (
                <p className="meta" style={{ margin: "8px 0 0" }}>
                  The public mempool won't let the sponsor read another contract while it checks the transaction. The
                  alt mempool allows it for a staked sponsor, which is what makes the free move possible.
                </p>
              )}
            </div>
          )}
          {error && !faucetEmpty && (
            <div className="notice negative small" style={{ marginTop: 16 }}>
              {error}
            </div>
          )}
        </section>

        <aside className="stack-16">
          <div className="card small">
            <h2>Why it's free</h2>
            <p className="t2" style={{ margin: 0 }}>
              A sponsor pays the gas, but only for this exact shape: the sender's key is exposed, every asset goes into a
              genuine Lifeboat account, and only once per account. Checking that means reading another contract during
              validation, which only the ERC-8421 alt mempool allows. The public mempool rejects the same transaction.
            </p>
          </div>
          <div className="card small">
            <h2>What stays on this device</h2>
            <p className="t2" style={{ margin: 0 }}>
              The seed, the journal and the demo account's key, in this browser's storage. Nothing is sent anywhere but
              the signed transactions.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

