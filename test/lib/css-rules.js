// [ui-c2] A small CSS reader for tests that pin rules by selector and at-rule instead of by spelling (the repo has no CSSOM in bun).
// The same parser as test/ui-b-fixes.test.js (kept as its own copy: that file's helpers are local).
//
//   const rules = parseCss(cssText);          // [{ at: ['@media (max-height: 460px)'], sel: '#intro .board', decl: { display: 'flex' } }]
//   decl(rules, '#intro .board', 'display', ['@media (max-height: 460px)'])   // the LAST declaration of that property on that selector in that at-rule path
//   styleBlocks(html)                          // the text of every <style> element of an HTML page, joined
//   keyframes(cssText, 'name')                 // the body of @keyframes name { ... }, or null

/** CSS -> one entry per selector (comments dropped, nested @media / @supports kept as a path; @keyframes and other at-rules are skipped). */
export function parseCss(css) {
  const src = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const walk = (text, at) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const head = text.slice(i, open).trim().replace(/\s+/g, ' ');
      let depth = 1, j = open + 1;
      while (j < text.length && depth) { const c = text[j++]; if (c === '{') depth++; else if (c === '}') depth--; }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith('@media') || head.startsWith('@supports')) walk(body, [...at, head]);
      else if (!head.startsWith('@')) {
        const decl = {};
        for (const d of body.split(';')) { const k = d.indexOf(':'); if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim().replace(/\s+/g, ' '); }
        for (const sel of head.split(',')) rules.push({ at, sel: sel.trim().replace(/\s+/g, ' '), decl });
      }
      i = j;
    }
  };
  walk(src, []);
  return rules;
}

/** The last declaration of `prop` on rules with exactly this selector, inside exactly this at-rule path (undefined when there is none). */
export function decl(rules, sel, prop, at = []) {
  const hit = rules.filter((r) => r.sel === sel && r.at.join('|') === at.join('|') && prop in r.decl);
  return hit.length ? hit.at(-1).decl[prop] : undefined;
}

/** Every rule of a selector (all at-rule paths), in source order. */
export const rulesOf = (rules, sel) => rules.filter((r) => r.sel === sel);

/** The text of every <style> element of an HTML page, joined. */
export function styleBlocks(html) {
  return [...String(html).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
}

/** The body of `@keyframes name { ... }` (the text between its braces), or null. */
export function keyframes(css, name) {
  const src = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const m = new RegExp('@keyframes\\s+' + name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\s*\\{').exec(src);
  if (!m) return null;
  let depth = 1, j = m.index + m[0].length;
  while (j < src.length && depth) { const c = src[j++]; if (c === '{') depth++; else if (c === '}') depth--; }
  return src.slice(m.index + m[0].length, j - 1).trim();
}
