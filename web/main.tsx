import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { AccountPage } from "./app/AccountPage.js";
import { CheckPage } from "./app/CheckPage.js";
import { HowPage } from "./app/HowPage.js";
import { LogPage } from "./app/LogPage.js";
import { MovePage } from "./app/MovePage.js";
import { QdayPage } from "./app/QdayPage.js";
import { CodeXml } from "lucide-react";
import { Mark, SmallWordmark } from "./app/PixelArt.js";
import { STEPS, StepMark, Term, progress } from "./app/guide.js";
import { WalletProvider, useWallet } from "./app/wallet-context.js";
import { saveWallet, type WalletState } from "./lib/store.js";

const ROUTES = {
  "/": "Check",
  "/move": "Move",
  "/account": "Use it",
  "/qday": "Try to break in",
  "/log": "Public log",
  "/how": "How it works",
} as const;
type Route = keyof typeof ROUTES;

const isRoute = (p: string): p is Route => p in ROUTES;

/** Links from before clean paths (/#/move) still work: turn them into /move. */
function fromOldLink() {
  if (location.hash.startsWith("#/") && isRoute(location.hash.slice(1))) {
    history.replaceState(null, "", location.hash.slice(1) + location.search);
  }
}
fromOldLink();

/** The current page, from the path. In-app links change it without reloading the page. */
function useRoute(): Route {
  const read = (): Route => (isRoute(location.pathname) ? location.pathname : "/");
  const [r, setR] = useState(read);
  useEffect(() => {
    const show = () => {
      setR(read());
      window.scrollTo(0, 0);
    };
    // Same-site links to one of our pages: switch page in place instead of a full reload.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !isRoute(url.pathname)) return;
      e.preventDefault();
      if (url.pathname !== location.pathname) history.pushState(null, "", url.pathname);
      show();
    };
    // An old /#/... link followed from the page we're on changes only the hash, not the page.
    const onHash = () => (fromOldLink(), show());
    addEventListener("popstate", show);
    addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      removeEventListener("popstate", show);
      removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, []);
  // Each page gets its own tab title.
  useEffect(() => {
    document.title = r === "/" ? "Lifeboat" : `${ROUTES[r]} · Lifeboat`;
  }, [r]);
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

const GITHUB = "https://github.com/ramavats/lifeboat";

function Footer() {
  const { reset, wallet } = useWallet();
  const [sure, setSure] = useState(false);
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="cols">
          <div>
            <SmallWordmark size={4} />
            <p className="t2 small" style={{ margin: 0, maxWidth: "40ch" }}>
              Move an Ethereum account to quantum-safe keys before anyone can break the ones it uses today.
            </p>
            <p className="meta" style={{ marginTop: 16 }}>
              Hash-based keys · EIP-8141 frame transactions
              <br />
              ERC-8421 alt mempool · reads over Anon-RPC
            </p>
          </div>
          <div>
            <p className="label">Steps</p>
            <ul>
              {STEPS.map((s, i) => (
                <li key={s.href}>
                  <a href={s.href}>
                    {i + 1}. {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label">Learn</p>
            <ul>
              <li><a href="/how">How it works</a></li>
              <li><a href="/log">Public log</a></li>
              <li><a href={GITHUB}>Source code</a></li>
            </ul>
          </div>
          <div>
            <p className="label">Your wallet</p>
            <ul>
              <li>
                <label style={{ cursor: "pointer" }}>
                  Restore a backup
                  <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
                </label>
              </li>
              {wallet.state.activity.length > 0 && (
                <li>
                  {sure ? (
                    <span>
                      Forget it?{" "}
                      <button className="btn quiet small" onClick={() => (reset(), setSure(false))}>Forget</button>
                      <button className="btn quiet small" onClick={() => setSure(false)}>Keep</button>
                    </span>
                  ) : (
                    <button className="btn quiet small" style={{ padding: 0, height: "auto" }} onClick={() => setSure(true)}>
                      Start over with a new demo wallet
                    </button>
                  )}
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="base meta">
          <span>MIT licensed. Experimental, unaudited cryptography.</span>
          <span>Built at ETHGlobal Mumbai 2026</span>
        </div>
      </div>
    </footer>
  );
}

function App() {
  const route = useRoute();
  const { wallet } = useWallet();
  const done = progress(wallet.state);
  return (
    <div className="shell">
      <header className="topbar">
        <div className="wrap bar">
          <a className="wordmark" href="/">
            <Mark size={3} />
            Lifeboat
          </a>
          <nav className="nav journey" aria-label="Steps">
            {STEPS.map((s, i) => (
              <span key={s.href} className="row" style={{ gap: 2 }}>
                {i > 0 && <span className="sep" aria-hidden />}
                <a href={s.href} aria-current={route === s.href ? "page" : undefined}>
                  <StepMark n={i + 1} done={done[i]!} />
                  {s.label}
                </a>
              </span>
            ))}
          </nav>
          <div className="right">
            <nav className="nav nav-extra" aria-label="More">
              <a href="/log" aria-current={route === "/log" ? "page" : undefined}>Log</a>
              <a href="/how" aria-current={route === "/how" ? "page" : undefined}>How it works</a>
            </nav>
            <span className="net meta">
              <span className="dot positive" />
              <Term t="test network">
                <span>test network</span>
              </Term>
            </span>
            <a className="iconlink" href={GITHUB} aria-label="Source code on GitHub" title="Source code">
              <CodeXml size={18} strokeWidth={1.75} />
            </a>
          </div>
        </div>
      </header>
      <main className={`wrap ${route === "/" ? "flush" : ""}`}>
        {route === "/" && <CheckPage />}
        {route === "/move" && <MovePage />}
        {route === "/account" && <AccountPage />}
        {route === "/qday" && <QdayPage />}
        {route === "/log" && <LogPage />}
        {route === "/how" && <HowPage />}
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
