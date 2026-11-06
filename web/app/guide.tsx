import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { WalletState } from "../lib/store.js";

/**
 * Plain-language help shared by every page: a glossary behind dotted-underlined terms, the
 * four-step journey the nav follows, and the "what next" card at the end of each step.
 */

const GLOSSARY = {
  "exposed key":
    "Sending a transaction publishes your account's public key. Today that's harmless. A large quantum computer could work backwards from it to your private key.",
  "quantum-safe":
    "Signed with keys built only from hash functions, which quantum computers are not known to break.",
  "one-time key":
    "A quantum-safe key that may sign exactly one transaction. Your account holds 1,024 of them and uses the next one each time.",
  ECDSA: "The signature every Ethereum account uses today. It's the part a quantum computer could break.",
  "private key": "The secret that lets you spend from an account. Whoever has it controls the funds.",
  sponsor: "A contract that pays the transaction fee for you, only for moves into Lifeboat.",
  mempool: "The waiting room where transactions sit before they're added to the chain. Its rules decide what gets in.",
  "alt mempool":
    "A second waiting room (ERC-8421) with looser rules for staked sponsors. The free move needs it.",
  "test network":
    "A practice copy of Ethereum where the money has no value. Lifeboat's new transaction type (EIP-8141) only runs here so far.",
  "test money": "ETH and dUSD on the test network. They have no value; the demo hands them out for free.",
  backup: "A file holding your key seed and the list of keys already used. Without it you can't sign from another device.",
  Hybrid: "Two locks: a transaction needs both the old ECDSA signature and a quantum-safe one.",
  Arkiv: "A public data network. Lifeboat keeps its opt-in migration list there so it outlives the test network.",
  "Q-day": "The day a quantum computer can turn a public key back into its private key.",
} as const;

export type TermName = keyof typeof GLOSSARY;

/** A term with its plain meaning one hover or tap away. */
export function Term({ t, children }: { t: TermName; children?: ReactNode }) {
  return (
    <span className="term" tabIndex={0} aria-describedby={undefined}>
      {children ?? t}
      <span className="term-tip" role="tooltip">
        {GLOSSARY[t]}
      </span>
    </span>
  );
}

/** Extra depth, closed by default, so the main path stays short. */
export function Details({ summary = "Technical details", children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="details">
      <summary>{summary}</summary>
      <div className="t2 small">{children}</div>
    </details>
  );
}

export const STEPS = [
  { href: "/", label: "Check" },
  { href: "/move", label: "Move" },
  { href: "/account", label: "Use it" },
  { href: "/qday", label: "Try to break in" },
] as const;

const CHECKED = "lifeboat.checked";
export const markChecked = () => {
  try {
    localStorage.setItem(CHECKED, "1");
  } catch {
    /* storage blocked: the step just stays unticked */
  }
};
const wasChecked = () => {
  try {
    return localStorage.getItem(CHECKED) === "1";
  } catch {
    return false;
  }
};

/** Which of the four steps are done, from what the wallet has actually recorded. */
export function progress(s: WalletState): boolean[] {
  const kinds = s.activity.map((a) => a.kind);
  return [
    wasChecked() || !!s.migration,
    !!s.migration,
    kinds.some((k) => k.startsWith("Sent from") || k.startsWith("Switched")),
    kinds.some((k) => /rejected/i.test(k)),
  ];
}

export function StepMark({ n, done }: { n: number; done: boolean }) {
  return <span className={`stepmark ${done ? "done" : ""}`}>{done ? <Check size={12} strokeWidth={2} /> : n}</span>;
}

/** The card at the end of a step: what just happened, and the one thing to do next. */
export function Next({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <a className="next" href={href}>
      <span>
        <span className="meta">Next</span>
        <span className="next-title">{title}</span>
        <span className="t2 small">{children}</span>
      </span>
      <ArrowRight size={20} strokeWidth={1.5} />
    </a>
  );
}

/**
 * A heading that types itself out the first time it scrolls into view, then keeps a blinking
 * cursor. The full text reserves the space and is what screen readers get.
 */
export function Typed({ text, as = "h2", className = "" }: { text: string; as?: "h1" | "h2"; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [n, setN] = useState(still ? text.length : 0);
  useEffect(() => {
    if (still || !ref.current) return;
    let id = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      id = window.setInterval(() => setN((k) => (k >= text.length ? (clearInterval(id), k) : k + 1)), 34);
    });
    io.observe(ref.current);
    return () => (io.disconnect(), clearInterval(id));
  }, [text, still]);
  return createElement(
    as,
    { ref, className: `typed ${className}`, "aria-label": text },
    <span className="ghost" aria-hidden>{text}</span>,
    <span className="ink" aria-hidden>{text.slice(0, n)}</span>,
  );
}
