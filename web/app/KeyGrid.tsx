import { int } from "./format.js";

/**
 * The account's 1,024 one-time keys, 32 × 32. A key is used once and never again: the account
 * accepts key (nonce − nonceBase) only. Keys below the account's starting nonce were never
 * usable (the account's nonce starts above 0), so they read as skipped, not used.
 */
export function KeyGrid({ total, nextLeaf, signed }: { total: number; nextLeaf: number; signed: Set<number> }) {
  const cells = [];
  for (let i = 0; i < total; i++) {
    const cls = signed.has(i) ? "used" : i < nextLeaf ? "skipped" : i === nextLeaf ? "upnext" : "";
    cells.push(<i key={i} className={cls} />);
  }
  const used = signed.size;
  return (
    <figure style={{ margin: 0 }}>
      <div className="keygrid" role="img" aria-label={`${used} of ${total} one-time keys used`}>
        {cells}
      </div>
      <figcaption className="row between" style={{ marginTop: 12 }}>
        <span className="mono num">
          key {int(nextLeaf)} of {int(total)} is next
        </span>
        <span className="meta">
          {int(used)} signed · {int(total - nextLeaf)} left
        </span>
      </figcaption>
    </figure>
  );
}
