// [livery] A checkout without the nendo livery files (the public repo) builds the plain fallback instead of asking the server
// for three files it does not have; the private checkout keeps nendo; an explicit KLC_NENDO wins (scripts/anime/buildinfo.js).
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NENDO_FILES, nendoDefine, buildDefines } from '../scripts/anime/buildinfo.js';
import { resolveFlags } from '../src/anime/world/ship/flags.js';

const dirs = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }); });
function checkout(withNendo) {
  const root = mkdtempSync(join(tmpdir(), 'nendo-'));
  dirs.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.0.0' }));
  if (withNendo) {
    mkdirSync(join(root, 'data/ship/shofukumaru1'), { recursive: true });
    for (const f of NENDO_FILES) writeFileSync(join(root, 'data/ship/shofukumaru1', f), '{}');
  }
  return root;
}

describe('KLC_NENDO at build time', () => {
  test('without the files: the fallback ("0"), and the flags then say no nendo', () => {
    expect(nendoDefine(checkout(false), {})).toBe('"0"');
    expect(resolveFlags({ search: '', define: false }).nendoLivery).toBe(false);
  });

  test('with all three files: no define, nendo stays the default', () => {
    expect(nendoDefine(checkout(true), {})).toBe(null);
    expect(resolveFlags({ search: '', define: null })).toEqual({ nendoLivery: true, source: 'default' });
  });

  test('one file missing is not enough for nendo', () => {
    const root = checkout(true);
    rmSync(join(root, 'data/ship/shofukumaru1', NENDO_FILES[2]));
    expect(nendoDefine(root, {})).toBe('"0"');
  });

  test('an explicit KLC_NENDO wins either way', () => {
    expect(nendoDefine(checkout(false), { KLC_NENDO: '1' })).toBe('"1"');
    expect(nendoDefine(checkout(true), { KLC_NENDO: '0' })).toBe('"0"');
  });

  test('buildDefines carries it only when needed; ?livery=nendo still wins in the page', () => {
    const git = () => 'abc1234';
    expect(buildDefines(checkout(false), { git, env: {} }).KLC_NENDO).toBe('"0"');
    expect('KLC_NENDO' in buildDefines(checkout(true), { git, env: {} })).toBe(false);
    expect(resolveFlags({ search: '?livery=nendo', define: false }).nendoLivery).toBe(true);
  });
});
