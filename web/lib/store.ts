import { bytesToHex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";

/**
 * Everything the wallet must keep, on this device only. A real product would keep the XMSS
 * seed in a hardware-backed store; this demo keeps it in localStorage and offers a backup
 * download. Losing the journal is dangerous for a stateful signature scheme, which is why it
 * is saved before every broadcast.
 */
export interface WalletState {
  v: 1;
  /** The demo's "exposed" account. In a real migration this is the user's existing wallet. */
  exposedKey: Hex;
  /** 32-byte seed of the quantum-safe key tree. */
  seed: Hex;
  /** One-time key → the sigHash it signed. Never sign a second message with a used key. */
  journal: Record<string, string>;
  lifeboat?: Address;
  migration?: { hash: Hex; block?: string };
  activity: { kind: string; hash?: Hex; at: number; note?: string }[];
}

const KEY = "lifeboat.wallet.v1";

function fresh(): WalletState {
  return {
    v: 1,
    exposedKey: generatePrivateKey(),
    seed: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
    journal: {},
    activity: [],
  };
}

export function loadWallet(): WalletState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as WalletState;
      if (s.v === 1 && s.exposedKey && s.seed) return s;
    }
  } catch {
    /* storage unavailable or corrupt: start fresh below */
  }
  const s = fresh();
  saveWallet(s);
  return s;
}

/** Returns false when the browser refuses storage, so the UI can warn that nothing persists. */
export function saveWallet(s: WalletState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function resetWallet(): WalletState {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return loadWallet();
}

/** The backup file: everything needed to restore this wallet on another device. */
export function backupBlob(s: WalletState): Blob {
  return new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
}
