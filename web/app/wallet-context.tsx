import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hexToBytes, type Hex } from "viem";
import type { KeyPair } from "../../src/pq/xmss.js";
import { KEY_TREE_HEIGHT } from "../lib/deployment.js";
import { loadWallet, resetWallet } from "../lib/store.js";
import { RejectedError, Wallet, reasonText, type Snapshot } from "../lib/wallet.js";

type Keys = { state: "idle" } | { state: "generating"; done: number; total: number } | { state: "ready"; ms: number };

interface Ctx {
  wallet: Wallet;
  keys: Keys;
  snapshot: Snapshot | null;
  refresh: () => Promise<void>;
  generateKeys: () => void;
  /** Derive a key tree for another seed in a worker (used when rotating). */
  deriveKeys: (seed: Hex) => Promise<KeyPair>;
  reset: () => void;
  /** Bumped after every state change, so views re-render. */
  version: number;
  touch: () => void;
}

const WalletCtx = createContext<Ctx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState(() => new Wallet(loadWallet()));
  const [keys, setKeys] = useState<Keys>({ state: "idle" });
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [version, setVersion] = useState(0);
  const worker = useRef<Worker | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await wallet.snapshot());
    } catch {
      /* devnet briefly unreachable: keep the last snapshot */
    }
  }, [wallet]);

  const generateKeys = useCallback(() => {
    if (wallet.keys || worker.current) return;
    const w = new Worker(new URL("../lib/pq.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    const t0 = performance.now();
    setKeys({ state: "generating", done: 0, total: 1 << KEY_TREE_HEIGHT });
    w.onmessage = (e: MessageEvent<{ type: "progress"; done: number; total: number } | { type: "done"; kp: KeyPair }>) => {
      if (e.data.type === "progress") setKeys({ state: "generating", done: e.data.done, total: e.data.total });
      else {
        wallet.setKeys(e.data.kp);
        setKeys({ state: "ready", ms: performance.now() - t0 });
        w.terminate();
        worker.current = null;
      }
    };
    w.postMessage({ seed: hexToBytes(wallet.state.seed), height: KEY_TREE_HEIGHT });
  }, [wallet]);

  // A wallet that already has an account needs its keys to sign: derive them on load.
  useEffect(() => {
    if (wallet.state.lifeboat) generateKeys();
    void refresh();
  }, [wallet, generateKeys, refresh]);

  const deriveKeys = useCallback(
    (seed: Hex) =>
      new Promise<KeyPair>((resolve, reject) => {
        const w = new Worker(new URL("../lib/pq.worker.ts", import.meta.url), { type: "module" });
        w.onerror = (e) => (w.terminate(), reject(new Error(e.message)));
        w.onmessage = (e: MessageEvent<{ type: string; kp?: KeyPair }>) => {
          if (e.data.type === "done") (w.terminate(), resolve(e.data.kp!));
        };
        w.postMessage({ seed: hexToBytes(seed), height: KEY_TREE_HEIGHT });
      }),
    [],
  );

  const reset = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setKeys({ state: "idle" });
    setSnapshot(null);
    setWallet(new Wallet(resetWallet()));
  }, []);

  const value = useMemo(
    () => ({ wallet, keys, snapshot, refresh, generateKeys, deriveKeys, reset, version, touch: () => setVersion((v) => v + 1) }),
    [wallet, keys, snapshot, refresh, generateKeys, deriveKeys, reset, version],
  );
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet(): Ctx {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}

/** Run an async action with a busy flag and a readable error. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      // A mempool rejection from our own contracts reads better as the contract's reason.
      if (e instanceof RejectedError && e.reason) setError(reasonText(e.reason));
      else setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, run, setError };
}
