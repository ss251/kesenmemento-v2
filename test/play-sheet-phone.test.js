// [phone-sheet] The play sheets (the 手帳, quest and result panels) fit a phone. Their grid had one implicit `auto` column, which
// sized itself to the panel's widest row (the 手帳's nowrap tabs): on a 390 px phone the panel was 440 px wide at x 174, its
// とじる button off screen (measured 2026-10-08 with .diag/book-phone-check.mjs; after the fix: x 12, 366 px).
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dir, '..', 'src/anime/play/kit/ui.js'), 'utf8');
/** Every rule block whose selector list ends with `sel` (a selector can open more than one rule), joined. */
const rule = (sel) => {
  const out = [];
  for (let i = css.indexOf(sel + ' {'); i >= 0; i = css.indexOf(sel + ' {', i + 1)) out.push(css.slice(i, css.indexOf('}', i) + 1));
  return out.join('\n');
};

describe('play sheets on a phone', () => {
  test('the sheet and the veil have one column as wide as the screen, not as their content', () => {
    expect(rule('#klc-play .sheet')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(rule('#klc-play .veil')).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  test('the panel may shrink below its content and never exceeds the column', () => {
    const panel = rule('#klc-play .sheet .panel');
    expect(panel).toContain('width: min(440px, 100%)');
    expect(panel).toContain('min-width: 0');
  });

  test('the tabs scroll sideways instead of widening the panel', () => {
    expect(rule('#klc-play .tabs')).toContain('overflow-x: auto');
  });
});
