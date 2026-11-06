/**
 * Draws Lifeboat's images in the site's own pixel style and saves them as PNGs:
 *   web/public/og/<page>.png   1200 × 630 share image for every page (Open Graph / X cards)
 *   docs/cover.png             1920 × 1080 hackathon cover
 *   web/public/icon-*.png      app icons, and favicon.svg
 * Run: pnpm og   (needs the Chromium that playwright-core 1.64 uses: `npx playwright-core install chromium`)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { MARK, seeded, wordBitmap, type Bitmap } from "../web/app/pixels.js";
import { PAGES } from "../web/seo.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const font = (pkg: string, file: string) => `file://${join(root, "node_modules/@fontsource-variable", pkg, "files", file)}`;

const C = { bg: "#fafafa", ink: "#1c1917", accent: "#e8590c", accentInk: "#b8430a", light: "#f2b48c", field: "#f3d2bd", field2: "#eeb895", text2: "#3d3d3d", muted: "#6b6b6b" };

/** The wordmark as SVG squares, settled the way the hero ends: mostly ink, orange in clusters. */
function wordmarkSvg(cell: number): { svg: string; w: number; h: number } {
  const base = wordBitmap();
  const r = seeded(8141);
  const tone = new Map<string, string>();
  const gap = Math.max(1, Math.round(cell * 0.12));
  let rects = "";
  for (const [c, y] of base.cells) {
    const k = `${c}.${y}`;
    if (!tone.has(k)) {
      const v = r();
      tone.set(k, v < 0.72 ? C.ink : v < 0.93 ? C.accent : C.light);
    }
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const v = r();
        const fill = v < 0.9 ? tone.get(k)! : v < 0.96 ? C.accent : C.light;
        rects += `<rect x="${(c * 2 + dx) * cell}" y="${(y * 2 + dy) * cell}" width="${cell - gap}" height="${cell - gap}" fill="${fill}"/>`;
      }
  }
  const w = base.cols * 2 * cell, h = base.rows * 2 * cell;
  return { svg: `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`, w, h };
}

/** Faint squares, dense at the left and right edges and along the bottom, empty behind the text. */
type Box = { l: number; t: number; r: number; b: number };
function fieldSvg(w: number, h: number, pitch: number, calm: Box[]): string {
  const r = seeded(1337);
  const size = Math.round(pitch * 0.58);
  let rects = "";
  for (let y = 0; y < h; y += pitch)
    for (let x = 0; x < w; x += pitch) {
      const nx = x / w, ny = y / h;
      const ex = Math.max(0, 1 - Math.min(nx, 1 - nx) / 0.24);
      const ey = Math.max(0, (ny - 0.72) / 0.28);
      let p = 0.02 + 0.55 * ex * ex + 0.42 * ey * ey;
      if (calm.some((c) => x + size > c.l && x < c.r && y + size > c.t && y < c.b)) p = 0;
      const on = r() < p;
      const two = r() < 0.2;
      if (on) rects += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${two ? C.field2 : C.field}"/>`;
    }
  return `<svg width="${w}" height="${h}" style="position:absolute;inset:0" shape-rendering="crispEdges">${rects}</svg>`;
}

function pixelSvg(b: Bitmap, cell: number, fill: string): string {
  const rects = b.cells.map(([x, y]) => `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${fill}"/>`).join("");
  return `<svg width="${b.cols * cell}" height="${b.rows * cell}" shape-rendering="crispEdges">${rects}</svg>`;
}

interface Card { w: number; h: number; eyebrow: string; headline: string; sub: string; footerRight: string }

function cardHtml(k: Card): string {
  const s = k.w / 1200; // everything is designed at 1200 wide and scaled
  const cell = Math.floor((k.w * 0.64) / 124);
  const mark = wordmarkSvg(cell);
  const padX = Math.round(k.w * 0.16);
  const calm: Box[] = [
    { l: padX - 40 * s, t: 0.12 * k.h, r: k.w - padX + 40 * s, b: 0.86 * k.h }, // the text block
    { l: padX - 24 * s, t: k.h - 66 * s, r: k.w - padX + 24 * s, b: k.h - 14 * s }, // the footer line
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "JB"; src: url("${font("jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2")}") format("woff2"); font-weight: 100 800; }
@font-face { font-family: "Geist"; src: url("${font("geist", "geist-latin-wght-normal.woff2")}") format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${k.w}px; height: ${k.h}px; background: ${C.bg}; overflow: hidden; }
body { position: relative; font-family: "JB", monospace; color: ${C.ink}; }
.stage { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 ${padX}px; }
.chip { font-size: ${15 * s}px; color: ${C.accentInk}; border: ${Math.max(1, s)}px solid rgba(232, 89, 12, .45); background: rgba(250,250,250,.85); padding: ${6 * s}px ${14 * s}px; letter-spacing: 0; }
.mark { margin: ${34 * s}px 0 ${32 * s}px; }
h1 { font-family: "JB", monospace; font-weight: 500; font-size: ${40 * s}px; line-height: 1.25; letter-spacing: -0.02em; max-width: 28ch; }
p { margin-top: ${14 * s}px; font-size: ${19 * s}px; line-height: 1.5; color: ${C.text2}; max-width: 52ch; }
.foot { position: absolute; left: ${padX}px; right: ${padX}px; bottom: ${30 * s}px; display: flex; justify-content: space-between; font-size: ${14 * s}px; color: ${C.muted}; }
.foot b { color: ${C.accentInk}; font-weight: 500; }
</style></head><body>
${fieldSvg(k.w, k.h, cell * 3, calm)}
<div class="stage">
  <span class="chip">${k.eyebrow}</span>
  <div class="mark">${mark.svg}</div>
  <h1>${k.headline}</h1>
  <p>${k.sub}</p>
</div>
<div class="foot"><span><b>lifeboat</b>-iota.vercel.app</span><span>${k.footerRight}</span></div>
</body></html>`;
}

function iconHtml(size: number, bg: string | null): string {
  const cell = Math.floor((size * (bg ? 0.62 : 0.86)) / MARK.cols);
  return `<!doctype html><html><head><style>html,body{margin:0;width:${size}px;height:${size}px;background:${bg ?? "transparent"};display:grid;place-items:center;overflow:hidden}</style></head><body>${pixelSvg(MARK, cell, C.accent)}</body></html>`;
}

async function main() {
  const out = (p: string) => join(root, p);
  mkdirSync(out("web/public/og"), { recursive: true });
  const browser = await chromium.launch();
  const tmp = join(tmpdir(), `lifeboat-og-${process.pid}.html`);
  async function shoot(html: string, w: number, h: number, file: string, transparent = false) {
    writeFileSync(tmp, html);
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto(`file://${tmp}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out(file), omitBackground: transparent });
    await page.close();
    console.log(`  ${file}`);
  }

  for (const [path, seo] of Object.entries(PAGES)) {
    await shoot(cardHtml({ w: 1200, h: 630, ...seo.og, footerRight: path === "/" ? "ETHGlobal Mumbai 2026" : "Lifeboat" }), 1200, 630, `web/public/og/${seo.image}`);
  }
  await shoot(
    cardHtml({
      w: 1920,
      h: 1080,
      eyebrow: "ETHGlobal Mumbai 2026 · EIP-8141 + ERC-8421 alt mempool",
      headline: "Move your Ethereum account to quantum-safe keys",
      sub: "Check privately whether a key is exposed. Move everything in one free, all-or-nothing transaction. Stay safe after Q-day.",
      footerRight: "Hash-based signatures · Anon-RPC · Arkiv",
    }),
    1920,
    1080,
    "docs/cover.png",
  );
  await shoot(iconHtml(512, C.bg), 512, 512, "web/public/icon-512.png");
  await shoot(iconHtml(192, C.bg), 192, 192, "web/public/icon-192.png");
  await shoot(iconHtml(180, C.bg), 180, 180, "web/public/apple-touch-icon.png");
  await browser.close();

  // The favicon stays vector: the mark's squares, on a light tile so it reads on dark tabs too.
  const m = MARK, pad = 1.5, size = m.cols + pad * 2;
  const rects = m.cells.map(([x, y]) => `<rect x="${x + pad}" y="${y + pad}" width="1" height="1"/>`).join("");
  writeFileSync(
    out("web/public/favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" rx="1.6" fill="#fafafa"/><g fill="${C.accent}">${rects}</g></svg>\n`,
  );
  console.log("  web/public/favicon.svg");
}

await main();
