// Draws the pictures search engines, phones and link previews ask for, from the tab icon and the default look, so
// they never have to be drawn by hand. Run it again whenever `public/favicon.svg` or the default look (LOOK in
// src/core/look.ts) changes: `node scripts/make-images.mjs`. It needs Playwright, which is installed in cloud
// sessions but is not one of sloverb's own dependencies, since nothing it makes is built with the page.
//
//   public/favicon.ico          the icon at 16, 32 and 48px, for crawlers and anything that asks for /favicon.ico
//   public/apple-touch-icon.png the icon at 180px with square corners, for a phone's home screen, which rounds them itself
//   public/og-2.jpg               1200x630, the picture in a link preview: the wordmark on paper
//
// See docs/seo.md.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// Playwright is installed globally rather than in the project, which only `require` finds
const { chromium } = createRequire(import.meta.url)("playwright");

const icon = readFileSync("public/favicon.svg", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

/** The icon drawn at a size, its corners left clear */
async function draw(svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  return page.screenshot({ omitBackground: true });
}

/** An .ico holding PNGs, which every browser since Internet Explorer 9 reads */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size % 256, at);
    head.writeUInt8(size % 256, at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map(({ data }) => data)]);
}

const sizes = [16, 32, 48];
const pngs = [];
for (const size of sizes) pngs.push({ size, data: await draw(icon, size) });
writeFileSync("public/favicon.ico", ico(pngs));

// a home screen rounds the corners itself, so the tile goes to the edges
writeFileSync("public/apple-touch-icon.png", await draw(icon.replace(/ rx="9"/, ""), 180));

// The link preview: the start screen's wordmark on paper, as it is on a first visit, in the colours of `light` in
// src/styles.css (--bg and --text). It had the wordmark in rose's three colours over rose's light until 2026-11-27,
// when the wordmark became plain (D33)
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html>
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f4f3ee; }
  h1 {
    position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: #131314;
    font: 600 230px/1 "SF Pro Display", "Inter Display", "Inter", system-ui, sans-serif;
    letter-spacing: -0.05em;
  }
  h1 span { padding: 0 0.11em 0.12em 0.06em; }
</style>
<h1><span>sloverb</span></h1>`);
await page.evaluate(() => document.fonts.ready);
// a JPEG, which is what the page's tags say it is, and WhatsApp asks for a preview picture under 600KB
writeFileSync("public/og-2.jpg", await page.screenshot({ type: "jpeg", quality: 90 }));

await browser.close();
