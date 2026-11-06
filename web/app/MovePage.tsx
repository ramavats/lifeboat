import { useEffect, useState, type ReactNode } from "react";
import { Copy, Download } from "lucide-react";
import { backupBlob } from "../lib/store.js";
import { dusd, eth, int, short } from "./format.js";
import { useAction, useWallet } from "./wallet-context.js";
import { Details, Next, Term } from "./guide.js";

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
      <p className="meta" style={{ margin: "0 0 8px" }}>Step 2 of 4</p>
      <h1>Move an account to safety</h1>
      <p className="lede">
        You'll get a practice account that's in the same spot as most real ones: its key is already{" "}
        <Term t="exposed key">exposed</Term>. Then you'll move everything in it to a new Lifeboat account. Five short steps,
        all with <Term t="test money" />.
      </p>

      <div className="grid-2">
        <section className="card">
          <ol className="steps">
            <Step
              n={1}
              state={st(1)}
              title="Get a practice account"
              action={
                !funded ? (
                  <button className="btn secondary small" disabled={!!busy || !ex} onClick={() => act("fund", () => wallet.fund())}>
                    {busy === "fund" ? "Getting it" : "Get test money"}
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
                  {exposed ? (
                    <>
                      Your practice account <span className="mono">{short(ex.address)}</span> has sent {int(ex.nonce)} transaction
                      {ex.nonce === 1n ? "" : "s"}, so its public key is out, like most real accounts.
                    </>
                  ) : funded ? (
                    <>
                      It has test money. Now send one ordinary transaction: that's the moment a real wallet reveals its key.
                    </>
                  ) : faucetEmpty ? (
                    "The shared test-money tap is empty right now. Send about 0.1 test ETH to this address from any funded account and this step continues on its own:"
                  ) : (
                    <>
                      This browser made you a fresh account, <span className="mono">{short(ex.address)}</span>. First it needs
                      some test money.
                    </>
                  )}
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
                "Connecting to the test network…"
              )}
            </Step>

            <Step
              n={2}
              state={st(2)}
              title="Make your quantum-safe keys"
              action={
                keys.state === "idle" ? (
                  <button className="btn secondary small" disabled={!exposed} onClick={generateKeys}>
                    Make keys
                  </button>
                ) : null
              }
            >
              {keys.state === "idle" && (
                <>
                  1,024 <Term t="one-time key">one-time keys</Term>, made on this device. About 5 seconds.
                </>
              )}
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
              {keys.state === "ready" && `1,024 one-time keys, made in this browser in ${(keys.ms / 1000).toFixed(1)}s. They never leave it.`}
            </Step>

            <Step
              n={3}
              state={moved ? "done" : st(3)}
              title="Save a backup"
              action={
                keysReady && !moved ? (
                  <div className="row">
                    <button className="btn secondary small" onClick={download}>
                      <Download size={16} strokeWidth={1.5} /> Download
                    </button>
                    <button className="btn quiet small" onClick={() => setBackedUp(true)} disabled={backedUp}>
                      {backedUp ? "Saved" : "I saved it"}
                    </button>
                  </div>
                ) : null
              }
            >
              A small file with your keys and a note of which ones you've used. Each key may sign only once, so keep the file
              safe, like a password.
            </Step>

            <Step n={4} state={moved ? "done" : step >= 4 ? "done" : "todo"} title="Check what will move">
              {ex && (
                <dl className="facts" style={{ marginTop: 8 }}>
                  <dt>ETH</dt>
                  <dd>{eth(moved ? 0n : ex.eth)} ETH</dd>
                  <dt>Tokens</dt>
                  <dd>{dusd(moved ? 0n : ex.dusd)} dUSD</dd>
                  <dt>Fee</dt>
                  <dd>0, paid by Lifeboat's sponsor</dd>
                </dl>
              )}
            </Step>

            <Step
              n={5}
              state={st(5)}
              title="Move everything"
              action={
                !moved ? (
                  <button className="btn primary" disabled={step !== 5 || !!busy} onClick={() => act("move", () => wallet.migrate())}>
                    {busy === "move" ? "Moving" : "Move everything"}
                  </button>
                ) : null
              }
            >
              {moved ? (
                <>
                  Done in one transaction <span className="mono">{short(wallet.state.migration!.hash, 10, 6)}</span>. The old
                  account is empty and your funds are in the new one.
                </>
              ) : (
                <>
                  One transaction creates your Lifeboat account and moves every coin into it. Either all of it happens or none
                  of it does. A <Term t="sponsor" /> pays the fee.
                </>
              )}
            </Step>
          </ol>
          {busy === "move" && <p className="meta" style={{ marginTop: 16 }}>Creating your account and moving everything, about 20 seconds</p>}

          {(step >= 5 || moved) && (
            <div className="mempools">
              <div className="row between" style={{ flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>Why this free move needs something new</h3>
                {!moved && !publicTry && (
                  <button className="btn quiet small" disabled={!!busy} onClick={() => void run("public", async () => setPublicTry(await wallet.tryPublicMempool()))}>
                    {busy === "public" ? "Sending" : "Try the public mempool first"}
                  </button>
                )}
              </div>
              <p className="t2 small" style={{ margin: "4px 0 8px" }}>
                The same transaction, sent to two <Term t="mempool">waiting rooms</Term>. The usual one refuses it. The new{" "}
                <Term t="alt mempool" /> lets it in.
              </p>
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
                        Let in and done · <span className="mono">{short(wallet.state.migration!.hash, 8, 4)}</span>
                      </>
                    ) : (
                      "Move everything sends it here"
                    )}
                  </span>
                </li>
              </ul>
              {publicTry && !publicTry.accepted && (
                <p className="meta" style={{ margin: "8px 0 0" }}>
                  To pay safely, the sponsor checks that your funds really go into a Lifeboat account. The public mempool forbids
                  that check. The alt mempool allows it for a sponsor that has put down a deposit.
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
              Lifeboat's sponsor pays the fee, but only for this exact kind of move: from an exposed account, into a real
              Lifeboat account, once per account. It can't be tricked into paying for anything else.
            </p>
            <Details>
              <p>
                The sponsor checks those rules while the transaction is being validated, which means reading the Lifeboat
                factory's registry. Reading another contract's storage at that point is only allowed for a staked sponsor in
                the ERC-8421 alt mempool; the public mempool rejects it with StorageReadNonSender.
              </p>
            </Details>
          </div>
          <div className="card small">
            <h2>What stays on this device</h2>
            <p className="t2" style={{ margin: 0 }}>
              Your new keys and the practice account's key live in this browser. Only the signed transactions leave it.
            </p>
          </div>
          <div className="card small">
            <h2>Why a practice account?</h2>
            <p className="t2" style={{ margin: 0 }}>
              Lifeboat accounts use a new transaction type (EIP-8141) that's only live on a test network so far. When it
              reaches Ethereum, the same steps move your real account.
            </p>
          </div>
        </aside>
      </div>

      {moved && (
        <Next href="#/account" title="Open your new account">
          Step 3 of 4. Send some money and see how a quantum-safe signature works.
        </Next>
      )}
    </>
  );
}
