import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { AccountPage } from "./app/AccountPage.js";
import { CheckPage } from "./app/CheckPage.js";
import { HowPage } from "./app/HowPage.js";
import { LogPage } from "./app/LogPage.js";
import { MovePage } from "./app/MovePage.js";
import { QdayPage } from "./app/QdayPage.js";
import { WalletProvider, useWallet } from "./app/wallet-context.js";

const ROUTES = {
  "#/": "Check",
  "#/move": "Move aboard",
  "#/account": "Account",
  "#/qday": "Q-day test",
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

function Footer() {
  const { reset, wallet } = useWallet();
  const [sure, setSure] = useState(false);
  return (
    <footer className="row between meta" style={{ marginTop: 96, flexWrap: "wrap" }}>
      <span>
        Hash-based keys · EIP-8141 frame transactions · reads over Anon-RPC ·{" "}
        <a href="https://github.com/ramavats/lifeboat">source</a>
      </span>
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
  return (
    <div className="shell">
      <header className="bar">
        <a className="wordmark" href="#/">
          <span className="flag" aria-hidden />
          Lifeboat
        </a>
        <nav className="nav">
          {(Object.keys(ROUTES) as Route[]).map((r) => (
            <a key={r} href={r} aria-current={route === r ? "page" : undefined}>
              {ROUTES[r]}
            </a>
          ))}
        </nav>
        <span className="net meta">
          <span className="dot positive" />
          <span>devnet 1337</span>
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
