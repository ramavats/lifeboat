/** One number format across the app: ETH to 4 places, dUSD to 2, thin separators. */
export const eth = (wei: bigint) =>
  (Number(wei) / 1e18).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export const dusd = (units: bigint) =>
  (Number(units) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const int = (n: bigint | number) => Number(n).toLocaleString("en-US");

export const short = (a: string, head = 6, tail = 4) => (a.length > head + tail + 1 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a);

export const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};
