/**
 * After `vite build`: one HTML file per page, so link previews and crawlers that don't run
 * JavaScript still get that page's title, description, share image and a plain-text summary.
 * Writes dist/index.html, dist/<page>/index.html, dist/sitemap.xml and dist/robots.txt.
 * The app replaces the summary in #root as soon as it loads.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, SITE_NAME, SITE_URL, type PagePath } from "../web/seo.js";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const template = readFileSync(join(dist, "index.html"), "utf8");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const BEGIN = "<!-- seo -->", END = "<!-- /seo -->";
if (!template.includes(BEGIN) || !template.includes(END)) throw new Error("dist/index.html has no <!-- seo --> block");

function head(path: PagePath): string {
  const p = PAGES[path];
  const url = SITE_URL + (path === "/" ? "/" : path);
  const image = `${SITE_URL}/og/${p.image}`;
  const alt = `${p.og.headline}. ${p.og.sub}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description: PAGES["/"].description,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any (runs in the browser)",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    license: "https://opensource.org/licenses/MIT",
    sameAs: ["https://github.com/ramavats/lifeboat"],
    image: `${SITE_URL}/og/home.png`,
  };
  return [
    BEGIN,
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(p.title)}" />`,
    `<meta name="twitter:description" content="${esc(p.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${esc(alt)}" />`,
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    END,
  ].join("\n    ");
}

/** What a crawler without JavaScript reads; the app replaces it on load. */
const summary = (path: PagePath) =>
  `<div id="root"><main style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>${esc(PAGES[path].og.headline)}</h1><p>${esc(PAGES[path].description)}</p><p>Lifeboat needs JavaScript to run: keys are made and kept in your browser.</p></main></div>`;

for (const path of Object.keys(PAGES) as PagePath[]) {
  const html = template
    .replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), head(path))
    .replace('<div id="root"></div>', summary(path));
  const dir = path === "/" ? dist : join(dist, path.slice(1));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${(Object.keys(PAGES) as PagePath[])
    .map((p) => `  <url><loc>${SITE_URL}${p === "/" ? "/" : p}</loc><lastmod>${today}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`,
);
writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
console.log(`pages: ${Object.keys(PAGES).length} HTML files, sitemap.xml, robots.txt`);
