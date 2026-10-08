// [mobile-play] The phone's first screen shows one thing at a time: while the touch pad's first-run coach is up, the kit's
// prompts (the gull's 「ウミネコになる」) and the ship's boarding chip step back. A pin on kit/ui.js's stylesheet; the real
// browser check (the coach up, はじめる, a desktop page) is test/play-coach-cta.e2e.test.js.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dir, '../src/anime/play/kit/ui.js'), 'utf8');

/** The declaration block of the rule whose selector list contains every one of `selectors`. */
function ruleFor(selectors) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = re.exec(css));) {
    const list = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim());
    if (selectors.every((s) => list.includes(s))) return m[2];
  }
  return null;
}

test("the pad's coach hides the kit's prompts and the boarding chip, and only while it is up", () => {
  const block = ruleFor([
    'body:has(#klc-pad .coach:not([hidden])) #klc-play .prompt',
    'body:has(#klc-pad .coach:not([hidden])) #klc-board',
  ]);
  expect(block).not.toBe(null);
  expect(block).toContain('visibility: hidden');
  expect(block).toContain('pointer-events: none');   // (hidden and untappable: nothing under the coach takes the tap)
});

test('the ☰ menu rule beside it is still there', () => {
  const block = ruleFor(['body:has(#klc-ui[data-menu="1"]) #klc-play .prompt']);
  expect(block).not.toBe(null);
  expect(block).toContain('visibility: hidden');
});
