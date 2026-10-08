// [mobile] Place labels: off by default on phones (they cluttered the small screen), on for desktop; ?labels= and a remembered choice override.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { labelsDefault } from '../src/anime/world/explore/labels.js';

const ROOT = resolve(import.meta.dir, '..');
describe('place labels on mobile', () => {
  test('phones start with ambient labels off, desktops on', () => {
    expect(labelsDefault({ mobile: true })).toEqual({ on: false, persist: null });
    expect(labelsDefault({ mobile: false })).toEqual({ on: true, persist: null });
  });
  test('?labels=1|0 overrides and is remembered', () => {
    expect(labelsDefault({ mobile: true, search: '?labels=1' })).toEqual({ on: true, persist: '1' });
    expect(labelsDefault({ mobile: false, search: '?ship=1&labels=0' })).toEqual({ on: false, persist: '0' });
  });
  test('a remembered choice holds; junk values fall back to the device default', () => {
    expect(labelsDefault({ mobile: true, stored: '1' }).on).toBe(true);
    expect(labelsDefault({ mobile: false, stored: '0' }).on).toBe(false);
    expect(labelsDefault({ mobile: true, search: '?labels=yes', stored: 'x' }).on).toBe(false);
  });
  test('the explore module keeps a searched place labelled when ambient labels are off, and the ☰ menu has the toggle (phone only)', () => {
    const ex = readFileSync(resolve(ROOT, 'src/anime/world/explore/index.js'), 'utf8');
    expect(ex).toMatch(/ambient \? \(ctx\.quality\?\.name === 'low' \|\| portrait\(\) \? 10 : 26\) : \(labelsRef\?\.pinned \? 1 : 0\)/);
    const hud = readFileSync(resolve(ROOT, 'src/anime/ui/hud.js'), 'utf8');
    expect(hud).toMatch(/class="round glass cbtn" data-act="labels"/);
    // the toggle's pressed state is re-read when the ☰ menu opens (explore publishes ambientLabels after the HUD's first render)
    expect(hud).toMatch(/if \(on\) \{[^}]*syncLabels\(\); \}/);
    expect(hud).toMatch(/function syncLabels\(\) \{[^\n]*'ambientLabels' in ex[^\n]*setAttribute\('aria-pressed', String\(!!ex\.ambientLabels\)\)/);
    const i18n = JSON.parse(readFileSync(resolve(ROOT, 'data/ui-touch-i18n.json'), 'utf8'));
    expect(JSON.stringify(i18n)).toContain('地名ラベル');
  });
});
