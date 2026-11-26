// Draws the pictures search engines, phones and link previews ask for, from the tab icon and the default look, so
// they never have to be drawn by hand. Run it again whenever `public/favicon.svg` or the default look (LOOK in
// src/core/look.ts) changes: `node scripts/make-images.mjs`. It needs Playwright, which is installed in cloud
// sessions but is not one of sloverb's own dependencies, since nothing it makes is built with the page.
//
//   public/favicon.ico          the icon at 16, 32 and 48px, for crawlers and anything that asks for /favicon.ico
//   public/apple-touch-icon.png the icon at 180px with square corners, for a phone's home screen, which rounds them itself
//   public/og.jpg               1200x630, the picture in a link preview: the wordmark on paper lit in rose
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

// The link preview: the start screen's wordmark on paper, in the light of rose as it is half way up with the music.
// The colours are `light` with `rose` in src/styles.css (--bg, --c1 to --c3, --a1 to --a3), and the lights fade the
// way `.aura i` does
const light = (rgb, x, y, w, h, strength) =>
  `<i style="left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;opacity:${strength};background:radial-gradient(closest-side,rgb(${rgb}) 0%,rgb(${rgb} / .86) 16%,rgb(${rgb} / .6) 32%,rgb(${rgb} / .34) 48%,rgb(${rgb} / .15) 64%,rgb(${rgb} / .05) 80%,rgb(${rgb} / 0) 100%)"></i>`;
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html>
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f4f3ee; }
  i { position: absolute; border-radius: 50%; }
  h1 {
    position: absolute; inset: 0; display: grid; place-items: center; margin: 0;
    font: 600 230px/1 "SF Pro Display", "Inter Display", "Inter", system-ui, sans-serif;
    letter-spacing: -0.05em;
  }
  h1 span {
    padding: 0 0.11em 0.12em 0.06em;
    background: linear-gradient(90deg, #e8457a, #f06a90, #f09a70);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
</style>
${light("252 58 120", 600, 330, 1500, 940, 0.4)}
${light("255 106 156", 400, 230, 760, 540, 0.36)}
${light("255 146 102", 820, 420, 760, 540, 0.36)}
<h1><span>sloverb</span></h1>`);
await page.evaluate(() => document.fonts.ready);
// a JPEG, since a PNG of soft light is several times the size and WhatsApp shows no picture over about 300KB
writeFileSync("public/og.jpg", await page.screenshot({ type: "jpeg", quality: 90 }));

await browser.close();
