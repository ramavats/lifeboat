import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { AccountPage } from "./app/AccountPage.js";
import { CheckPage } from "./app/CheckPage.js";
import { HowPage } from "./app/HowPage.js";
import { LogPage } from "./app/LogPage.js";
import { MovePage } from "./app/MovePage.js";
import { QdayPage } from "./app/QdayPage.js";
import { STEPS, StepMark, Term, progress } from "./app/guide.js";
import { WalletProvider, useWallet } from "./app/wallet-context.js";
import { saveWallet, type WalletState } from "./lib/store.js";

const ROUTES = {
  "#/": "Check",
  "#/move": "Move",
  "#/account": "Use it",
  "#/qday": "Try to break in",
  "#/log": "Public log",
  "#/how": "How it works",
} as const;
type Route = keyof typeof ROUTES;

function useRoute(): Route {
  const read = () => ((location.hash in ROUTES ? location.hash : "#/") as Route);
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => {
      setR(read());
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return r;
}

/** Restore a wallet from the backup file Move aboard offers. */
function restore(file: File) {
  void file.text().then((text) => {
    try {
      const s = JSON.parse(text) as WalletState;
      if (s.v !== 1 || !/^0x[0-9a-f]{64}$/i.test(s.exposedKey) || !/^0x[0-9a-f]{64}$/i.test(s.seed)) throw new Error();
      if (!saveWallet(s)) throw new Error();
      location.reload();
    } catch {
      alert("That file isn't a Lifeboat backup.");
    }
  });
}

function Footer() {
  const { reset, wallet } = useWallet();
  const [sure, setSure] = useState(false);
  return (
    <footer className="row between meta" style={{ marginTop: 96, flexWrap: "wrap" }}>
      <span>
        Hash-based keys · EIP-8141 frame transactions · reads over Anon-RPC ·{" "}
        <a href="https://github.com/ramavats/lifeboat">source</a>
      </span>
      <label className="btn quiet small" style={{ marginLeft: "auto" }}>
        Restore a backup
        <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
      </label>
      {wallet.state.activity.length > 0 &&
        (sure ? (
          <span className="row">
            Forget this browser's demo wallet?
            <button className="btn quiet small" onClick={() => (reset(), setSure(false))}>Forget</button>
            <button className="btn quiet small" onClick={() => setSure(false)}>Keep</button>
          </span>
        ) : (
          <button className="btn quiet small" onClick={() => setSure(true)}>Start over with a new demo wallet</button>
        ))}
    </footer>
  );
}

function App() {
  const route = useRoute();
  const { wallet } = useWallet();
  const done = progress(wallet.state);
  return (
    <div className="shell">
      <header className="bar">
        <a className="wordmark" href="#/">
          <span className="flag" aria-hidden />
          Lifeboat
        </a>
        <nav className="nav journey" aria-label="Steps">
          {STEPS.map((s, i) => (
            <span key={s.href} className="row" style={{ gap: 4 }}>
              {i > 0 && <span className="sep" aria-hidden />}
              <a href={s.href} aria-current={route === s.href ? "page" : undefined}>
                <StepMark n={i + 1} done={done[i]!} />
                {s.label}
              </a>
            </span>
          ))}
        </nav>
        <nav className="nav nav-extra" aria-label="More">
          <a href="#/log" aria-current={route === "#/log" ? "page" : undefined}>Public log</a>
          <a href="#/how" aria-current={route === "#/how" ? "page" : undefined}>How it works</a>
        </nav>
        <span className="net meta">
          <span className="dot positive" />
          <Term t="test network">
            <span>test network</span>
          </Term>
        </span>
      </header>
      <main>
        {route === "#/" && <CheckPage />}
        {route === "#/move" && <MovePage />}
        {route === "#/account" && <AccountPage />}
        {route === "#/qday" && <QdayPage />}
        {route === "#/log" && <LogPage />}
        {route === "#/how" && <HowPage />}
      </main>
      <Footer />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </StrictMode>,
);
