// Keeps sloverb fast. Run by `npm test` and in CI, so a change that makes the site slower fails before it ships.
// The rules are "Keeping it fast" in CLAUDE.md; this checks the ones a machine can see.
//
// A line that genuinely needs an exception says why on the same line with a comment containing `speed-ok:`,
// for example `transition: --lift 0.35s; /* speed-ok: the light behind the page, nothing anyone presses */`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Longest a transition or one-off animation may take, in seconds. Loops that run forever are ambient, not answers. */
const LIMIT = 0.25;
/** Properties that make the browser lay out or repaint when they move, so they must never be animated. */
const HEAVY = ["height", "width", "top", "left", "right", "bottom", "margin", "padding", "box-shadow", "background-position", "font-size"];

const problems = [];
const say = (file, line, text) => problems.push(`${file}:${line}  ${text}`);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const seconds = (text) => [...text.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map(([, n, unit]) => (unit === "ms" ? Number(n) / 1000 : Number(n)));

for (const file of files("src")) {
  const lines = readFileSync(file, "utf8").split("\n");

  if (file.endsWith(".css")) {
    // read declaration by declaration, however the rules are laid out over lines
    let keyframes = null;
    let depth = 0;
    let keyframesDepth = 0;
    lines.forEach((raw, i) => {
      const n = i + 1;
      const allowed = raw.includes("speed-ok:");
      const code = raw.replace(/\/\*.*?\*\//g, "");
      for (const token of code.split(/([{};])/)) {
        if (token === "{") {
          depth++;
          continue;
        }
        if (token === "}") {
          depth--;
          if (keyframes && depth < keyframesDepth) keyframes = null;
          continue;
        }
        const part = token.trim();
        if (!part || part === ";") continue;
        if (part.startsWith("@keyframes")) {
          keyframes = part.split(/\s+/)[1];
          keyframesDepth = depth + 1;
          continue;
        }
        const colon = part.indexOf(":");
        if (colon < 0) continue;
        const property = part.slice(0, colon).trim();
        const value = part.slice(colon + 1).trim();
        if (allowed) continue;
        if (keyframes) {
          if (HEAVY.includes(property)) say(file, n, `@keyframes ${keyframes} animates ${property}, which repaints or relayouts every frame. Use transform or opacity.`);
          continue;
        }
        if (/^(transition|transition-duration|animation|animation-duration)$/.test(property) && !value.includes("infinite")) {
          // the timing tokens (--quick, --press) and easing curves aren't durations to check
          const longest = Math.max(0, ...seconds(value.replace(/var\([^)]*\)|cubic-bezier\([^)]*\)|steps\([^)]*\)/g, "")));
          if (longest > LIMIT) say(file, n, `${property} takes ${longest}s, over ${LIMIT}s. Use --quick or --press.`);
        }
        if (property === "transition" && /\b(box-shadow|height|width|filter)\b/.test(value)) {
          say(file, n, "transitions a property that repaints. Fade a layer's opacity instead, or say why it is fine with speed-ok.");
        }
        if (/^(-webkit-)?backdrop-filter$/.test(property)) {
          say(file, n, "backdrop-filter re-blurs whatever moves behind it every frame. Mark it speed-ok only for something brief, like a toast.");
        }
      }
    });
  }

  if (/\.(tsx?|jsx?)$/.test(file)) {
    lines.forEach((line, i) => {
      if (line.includes("speed-ok:")) return;
      if (/(documentElement|document\.body|root)\.style\.setProperty/.test(line)) {
        say(file, i + 1, "sets a style on the whole page, which restyles every element. Set it on the elements that use it (see `hears`).");
      }
    });
  }
}

if (problems.length) {
  console.error(`\nsloverb has to stay fast (see "Keeping it fast" in CLAUDE.md):\n\n${problems.join("\n")}\n`);
  process.exit(1);
}
console.log("speed check: ok");
