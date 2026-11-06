/**
 * Search and share text for every page, in one place: the app's tab titles, the per-page HTML that
 * link previews read (scripts/pages.ts) and the share images (scripts/og.ts) all come from here.
 */

export const SITE_URL = "https://lifeboat-iota.vercel.app";
export const SITE_NAME = "Lifeboat";

export interface PageSeo {
  /** The browser tab and search result title. */
  title: string;
  /** Search result snippet and link preview text, under about 160 characters. */
  description: string;
  /** Share image text: a small label, the headline and one supporting line. */
  og: { eyebrow: string; headline: string; sub: string };
  /** The share image's file name in /og/. */
  image: string;
}

export const PAGES = {
  "/": {
    title: "Lifeboat: move your Ethereum account to quantum-safe keys",
    description:
      "Check privately whether an Ethereum address has exposed its key, then move everything to a quantum-safe account in one free, all-or-nothing transaction.",
    og: {
      eyebrow: "Live on the EIP-8141 test network",
      headline: "Move your Ethereum account to quantum-safe keys",
      sub: "Check privately. Move everything in one free transaction. Stay safe after Q-day.",
    },
    image: "home.png",
  },
  "/move": {
    title: "Move an account to safety · Lifeboat",
    description:
      "One sponsored transaction creates a quantum-safe account and moves every coin and token into it. All of it moves, or none of it does.",
    og: {
      eyebrow: "Step 2 of 4",
      headline: "Move an account to safety",
      sub: "One free transaction moves everything into a quantum-safe account.",
    },
    image: "move.png",
  },
  "/account": {
    title: "Your Lifeboat account · Lifeboat",
    description:
      "Every payment is signed with one of 1,024 one-time quantum-safe keys, made in your browser. Turn the old key off for good when the time comes.",
    og: {
      eyebrow: "Step 3 of 4",
      headline: "Your quantum-safe account",
      sub: "1,024 one-time keys, made in your browser. Each one signs once.",
    },
    image: "account.png",
  },
  "/qday": {
    title: "Try to break in · Lifeboat",
    description:
      "Play the attacker: take the old private key, the one a quantum computer would recover, and try to drain the account. The network refuses.",
    og: {
      eyebrow: "Step 4 of 4",
      headline: "Try to break in",
      sub: "You have the stolen key. The network still says no.",
    },
    image: "qday.png",
  },
  "/log": {
    title: "Public list of moves · Lifeboat",
    description:
      "Accounts that chose to share their move to Lifeboat, kept on Arkiv so the record outlives the test network. Every row checks out against the chain.",
    og: {
      eyebrow: "Public log on Arkiv",
      headline: "Public list of moves",
      sub: "Opt-in, durable, and every row checks out against the chain.",
    },
    image: "log.png",
  },
  "/how": {
    title: "How Lifeboat works · Lifeboat",
    description:
      "Hash-based signatures checked in an EIP-8141 frame account, a sponsor only the ERC-8421 alt mempool accepts, and a private exposure check over Anon-RPC.",
    og: {
      eyebrow: "How it works",
      headline: "How Lifeboat works",
      sub: "Hash-based signatures, EIP-8141 frame accounts, the ERC-8421 alt mempool.",
    },
    image: "how.png",
  },
} as const satisfies Record<string, PageSeo>;

export type PagePath = keyof typeof PAGES;
