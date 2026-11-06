/**
 * Lifeboat's pixel lettering: one bitmap per letter of the wordmark, drawn on a square grid.
 * The hero etches it in on a canvas; the footer and header use the same bitmaps as SVG.
 */

const GLYPHS: Record<string, string[]> = {
  L: ["XX.....", "XX.....", "XX.....", "XX.....", "XX.....", "XX.....", "XXXXXXX", "XXXXXXX"],
  I: ["XXXXXX", "XXXXXX", "..XX..", "..XX..", "..XX..", "..XX..", "XXXXXX", "XXXXXX"],
  F: ["XXXXXXX", "XXXXXXX", "XX.....", "XXXXXX.", "XXXXXX.", "XX.....", "XX.....", "XX....."],
  E: ["XXXXXXX", "XXXXXXX", "XX.....", "XXXXXX.", "XXXXXX.", "XX.....", "XXXXXXX", "XXXXXXX"],
  B: ["XXXXXX.", "XXXXXXX", "XX...XX", "XXXXXX.", "XXXXXXX", "XX...XX", "XXXXXXX", "XXXXXX."],
  O: [".XXXXX.", "XXXXXXX", "XX...XX", "XX...XX", "XX...XX", "XX...XX", "XXXXXXX", ".XXXXX."],
  A: [".XXXXX.", "XXXXXXX", "XX...XX", "XX...XX", "XXXXXXX", "XXXXXXX", "XX...XX", "XX...XX"],
  T: ["XXXXXXX", "XXXXXXX", "..XXX..", "..XXX..", "..XXX..", "..XXX..", "..XXX..", "..XXX.."],
};

/** Rows 2 and 5 are drawn twice, so the letters stand taller than the 8-row bitmaps. */
const ROW_REPEAT = [1, 1, 2, 1, 1, 2, 1, 1];

export interface Bitmap {
  cols: number;
  rows: number;
  /** Lit cells as [col, row]. */
  cells: [number, number][];
}

export function wordBitmap(word = "LIFEBOAT", tall = true): Bitmap {
  const cells: [number, number][] = [];
  let x = 0;
  const repeat = tall ? ROW_REPEAT : ROW_REPEAT.map(() => 1);
  const rows = repeat.reduce((a, b) => a + b, 0);
  for (const ch of word) {
    const g = GLYPHS[ch]!;
    let y = 0;
    g.forEach((line, r) => {
      for (let k = 0; k < repeat[r]!; k++, y++) {
        for (let c = 0; c < line.length; c++) if (line[c] === "X") cells.push([x + c, y]);
      }
    });
    x += g[0]!.length + 1;
  }
  return { cols: x - 1, rows, cells };
}

/** The mark: a small sailing boat, 7 × 7. */
export const MARK: Bitmap = (() => {
  const rows = ["...X...", "...XX..", "...XXX.", "...X...", "XXXXXXX", ".XXXXX.", "..XXX.."];
  const cells: [number, number][] = [];
  rows.forEach((l, y) => [...l].forEach((ch, x) => ch === "X" && cells.push([x, y])));
  return { cols: 7, rows: 7, cells };
})();

/** A deterministic random stream, so the scattered field looks the same on every visit. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
