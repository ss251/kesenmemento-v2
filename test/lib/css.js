// Helpers for the stylesheet tests of UI lane B round 2 (test/ui-b2-*.test.js, test/mobile-native-lint.test.js): a small CSS parser that finds a rule by selector and by the
// at-rules around it (so a test is not tied to spelling or to where a rule sits), the CSS text of a template literal in a source file, and the WCAG arithmetic the legibility
// checks run. Not a test file (bun picks up *.test.js only).
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

export const ROOT = resolve(import.meta.dir, "../..");
export const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** Split a selector list at its top-level commas (a comma inside :is( ), :not( ) or [ ] stays). */
function splitSelectors(head) {
  const out = []; let depth = 0, cur = "";
  for (const c of head) {
    if (c === "(" || c === "[") depth++; else if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
}

/** CSS -> [{ at: ['@media (max-width: 720px)', '@supports (...)'], sel: '#klc-ui .dock', decl: { display: 'none' }, order: 12 }]. Comments are dropped, nested group rules
 *  (@media, @supports, @starting-style) are kept as a path, one entry per selector; @keyframes and the like are skipped. `order` is the source order (for cascade questions). */
export function parseCss(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = []; let order = 0;
  const walk = (text, at) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const head = text.slice(i, open).trim().replace(/\s+/g, " ");
      let depth = 1, j = open + 1;
      while (j < text.length && depth) { const c = text[j++]; if (c === "{") depth++; else if (c === "}") depth--; }
      const body = text.slice(open + 1, j - 1);
      if (/^@(media|supports|starting-style)\b/.test(head)) walk(body, [...at, head]);
      else if (!head.startsWith("@")) {
        const decl = {};
        for (const d of body.split(";")) { const k = d.indexOf(":"); if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim().replace(/\s+/g, " "); }
        for (const sel of splitSelectors(head)) rules.push({ at, sel, decl, order: order++ });
      }
      i = j;
    }
  };
  walk(src, []);
  return rules;
}
/** The last declaration of `prop` on rules with exactly this selector, inside exactly this at-rule path (undefined when there is none). */
export const decl = (rules, sel, prop, at = []) => {
  const hit = rules.filter((r) => r.sel === sel && r.at.join("|") === at.join("|") && prop in r.decl);
  return hit.length ? hit.at(-1).decl[prop] : undefined;
};
/** Every rule with exactly this selector (any at-rule path). */
export const rulesOf = (rules, sel) => rules.filter((r) => r.sel === sel);
/** The CSS inside a template literal: the text between the backtick after `name` and the line that closes it (`\n\`;`). */
export function cssIn(src, name) {
  const i = src.indexOf(name), a = src.indexOf("`", i), b = src.indexOf("\n`;", a);
  if (i < 0 || a < 0 || b < 0) throw new Error("no css constant " + name);
  return src.slice(a + 1, b);
}

// ---------------------------------------------------------------------------------------------------------------- colour
/** '#rgb' | '#rrggbb' | 'rgb(r, g, b)' | 'rgba(r, g, b, a)' -> [r, g, b, a]. */
export function parseColor(s) {
  s = String(s).trim();
  let m = s.match(/^#([0-9a-f]{3})$/i); if (m) return [...m[1]].map((h) => parseInt(h + h, 16)).concat(1);
  m = s.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)).concat(1);
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i); if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  throw new Error("colour " + s);
}
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** Relative luminance of [r, g, b] (0-255). */
export const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
/** WCAG contrast ratio of two opaque colours. */
export const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** `fg` at alpha `a` over the opaque colour `bg`. */
export const over = (fg, a, bg) => [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
/** A (possibly translucent) colour string over an opaque backdrop -> opaque [r, g, b]. */
export const flat = (colour, bg) => { const c = parseColor(colour); return over(c, c[3], bg); };
/** The scene behind the HUD, as opaque colours: the CSS-pixel samples the reviews took (mobile.md A14, polish.md 3.3). */
export const BACKDROPS = { sky: [156, 196, 234], cloud: [236, 240, 248], sea: [127, 184, 216], darkWater: [42, 74, 106], night: [20, 28, 60], grass: [150, 190, 120] };
