// The page's side of a room: interpolation, the countdown, fish names,
// the sheet (one code field, four stamps), and two sessions on one relay.

import { describe, test, expect, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { makeDom } from './lib/mini-dom.js';
import { createBuffer, pushSnap, sample } from '../src/anime/play/multi/interp.js';
import { phase, formatTime, boardHtml, COUNT_LEAD_MS } from '../src/anime/play/multi/race.js';
import { modeSpec, registerMode, coachSeen, markCoach, COACH_KEY } from '../src/anime/play/multi/mode.js';
import { tagOpacity, quantizeOpacity, offScreen, blockedAlong, armAt, togetherStart, STAMP_MS, FADE_NEAR, FADE_FAR } from '../src/anime/play/multi/presence.js';
import { whoLabel } from '../src/anime/play/multi/names.js';
import { resolveWs, roomLink, codeFromHash, MULTI_WS } from '../src/anime/play/multi/endpoint.js';
import { COUNT_LEAD_MS as KIT_GO_MS } from '../src/anime/play/race/together.js';
import { readPose } from '../src/anime/play/multi/pose.js';
import { createSession } from '../src/anime/play/multi/session.js';
import { mountSheet } from '../src/anime/play/multi/sheet.js';
import { mountBodies } from '../src/anime/play/multi/bodies.js';
import { standIn, triangleCount } from '../src/anime/play/multi/geom.js';
import { startServer } from '../server/multi/index.js';
import { encode, packPose, FISH } from '../server/multi/wire.js';
import STR from '../data/play-i18n.json';
import * as THREE from 'three';

const ROOT = resolve(import.meta.dir, '..');
const PROD = 'https://kesennuma-living-city-production.up.railway.app';

function tOf(lang) {
  return (key, vars) => {
    let s = STR[lang][key] ?? STR.ja[key] ?? key;
    if (!vars) return s;
    for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  };
}

describe('interpolation', () => {
  test('a 120 ms buffer holds the ends and takes the short way around yaw', () => {
    const buf = createBuffer();
    const a = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, look: 0, mode: 'avatar', vehicle: 0 };
    const b = { x: 10, y: 0, z: 0, yaw: 0, pitch: 0, look: 0, mode: 'car', vehicle: 1 };
    pushSnap(buf, 0, a);
    pushSnap(buf, 100, b);
    const out = { x: -1 };
    sample(buf, 120, out);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.mode).toBe('avatar');
    sample(buf, 170, out);
    expect(out.x).toBeCloseTo(5, 5);
    sample(buf, 220, out);
    expect(out.x).toBeCloseTo(10, 5);
    sample(buf, 300, out);
    expect(out.x).toBeCloseTo(10, 5);
    const turn = createBuffer();
    const deg = Math.PI / 180;
    pushSnap(turn, 0, { ...a, yaw: 170 * deg });
    pushSnap(turn, 100, { ...a, yaw: -170 * deg });
    sample(turn, 170, out);
    expect(Math.abs(Math.abs(out.yaw) - Math.PI)).toBeLessThan(0.02);
  });
});

describe('the shared countdown', () => {
  test('3, 2, 1 and GO land on the kit beats, and GO is the same instant for everyone', () => {
    const go = 10_000;
    expect(COUNT_LEAD_MS).toBe(2560);
    expect(phase(go - 2561, go)).toBe('wait');
    expect(phase(go - 2560, go)).toBe('3');
    expect(phase(go - 1440, go)).toBe('2');
    expect(phase(go - 720, go)).toBe('1');
    expect(phase(go, go)).toBe('go');
    expect(phase(go + 419, go)).toBe('go');
    expect(phase(go + 420, go)).toBe('done');
    expect(formatTime(75430)).toBe('1:15.43');
    const html = boardHtml([[1, 1000], [2, 2000]], (id) => (id === 1 ? 'あおのサバ' : '<script>'), 'いちばんはやい');
    expect(html).toContain('あおのサバ');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('いちばんはやい');
    expect(html.startsWith('<ul class="times">')).toBe(true);
    expect(html).not.toContain('<ol');
    expect(html).not.toContain('<script>');
    const you = boardHtml([[1, 1000], [2, 2000]], (id) => (id === 2 ? 'あかのサバ' : 'あおのサバ'), 'いちばんはやい', 2);
    expect(you).toContain('class="you"');
    expect(you).toContain('あかのサバ');
    expect(you).toContain('class="medal"');
    expect(you.indexOf('class="medal"')).toBeLessThan(you.indexOf('class="you"'));
  });
});

describe('the hub card', () => {
  test('みんなで registers only when the kit offers registerMode', () => {
    const spec = modeSpec();
    expect(spec.id).toBe('multi');
    expect(spec.order).toBe(70);
    expect(spec.players).toBe('many');
    expect(spec.title.ja).toBe('みんなで');
    expect(spec.hook.en).toBe('Race the same harbour with a friend');
    expect(registerMode({}, spec)).toBe(false);
    expect(registerMode({ registerMode: null }, spec)).toBe(false);
    let got = null;
    expect(registerMode({ registerMode(s) { got = s; } }, spec)).toBe(true);
    expect(got).toBe(spec);
    const box = new Map();
    const st = { getItem: (k) => (box.has(k) ? box.get(k) : null), setItem: (k, v) => box.set(k, String(v)) };
    expect(coachSeen(st)).toBe(false);
    markCoach(st);
    expect(st.getItem(COACH_KEY)).toBe('1');
    expect(coachSeen(st)).toBe(true);
  });
});

describe('names', () => {
  test('a colour and a fish, never a name and never ホヤ', () => {
    const ja = tOf('ja');
    const en = tOf('en');
    expect(whoLabel(ja, 'saba', 'ao')).toBe('あおのサバ');
    expect(whoLabel(en, 'saba', 'ao')).toBe('Blue Mackerel');
    expect(whoLabel(ja, 'hoya', 'ao')).toBe('なかま');
    expect(whoLabel(ja, 'saba', 'hoya')).toBe('なかま');
    expect(FISH).not.toContain('hoya');
    for (const key of Object.keys(STR.ja)) {
      if (!key.startsWith('play.multi.')) continue;
      expect(STR.en[key], key).toBeTruthy();
      expect(STR.ja[key]).not.toMatch(/ホヤ/);
    }
  });
});

describe('where the socket goes', () => {
  test('a page only dials localhost, or the deployed host, and a hash is just a code', () => {
    expect(resolveWs({ search: '', hostname: 'example.com' })).toBe(MULTI_WS);
    expect(resolveWs({ search: '?ws=ws://evil.example/ws', hostname: 'example.com' })).toBe(MULTI_WS);
    expect(resolveWs({ search: '?ws=ws://127.0.0.1:9505/ws', hostname: 'example.com' })).toBe('ws://127.0.0.1:9505/ws');
    expect(resolveWs({ search: '', hostname: 'localhost' })).toBe('ws://localhost:9505/ws');
    expect(resolveWs({ search: '', hostname: '127.0.0.1' })).toBe('ws://127.0.0.1:9505/ws');
    expect(codeFromHash('#room=ab3c')).toBe('AB3C');
    expect(codeFromHash('#room=ab')).toBe('');
    expect(codeFromHash('#room=abcd&x=1')).toBe('');
    expect(roomLink({ pathname: '/town', search: '?lang=en', origin: 'http://127.0.0.1:9506' }, 'ABCD'))
      .toBe('http://127.0.0.1:9506/town?lang=en#room=ABCD');
  });
});

describe('the local pose', () => {
  test('fish, then car, then boat, then a gull, then a person', () => {
    const out = {};
    const ctx = {
      player: { position: { x: 3, y: 4, z: 5 } },
      playerObj: { yaw: 0.4, pitch: 0.2, fly: true },
      services: {
        underwater: { active: true },
        explore: { drive: { active: true, state: { yaw: 1.2, pitch: 0.05 } } },
        sail: { active: true },
        gull: { active: true },
        garage: { style: 7 },
      },
    };
    readPose(ctx, out);
    expect(out.mode).toBe('fish');
    expect(out.x).toBe(3);
    ctx.services.underwater.active = false;
    readPose(ctx, out);
    expect(out.mode).toBe('car');
    expect(out.yaw).toBe(1.2);
    expect(out.vehicle).toBe(7);
    ctx.services.explore.drive.active = false;
    readPose(ctx, out);
    expect(out.mode).toBe('boat');
    expect(out.vehicle).toBe(0);
    ctx.services.sail.boatKind = 'katsuo';
    readPose(ctx, out);
    expect(out.vehicle).toBe(1);
    ctx.services.sail.boatKind = 'shofuku';
    ctx.services.sail.active = false;
    readPose(ctx, out);
    expect(out.mode).toBe('gull');
    ctx.playerObj.fly = false;
    ctx.services.gull.active = false;
    readPose(ctx, out);
    expect(out.mode).toBe('avatar');
    expect(out.yaw).toBe(0.4);
  });
});

describe('presence', () => {
  test('a tag fades, hides behind a wall, and the countdown arm meets GO', () => {
    expect(tagOpacity(4, false)).toBe(1);
    expect(tagOpacity(FADE_NEAR, false)).toBe(1);
    expect(tagOpacity(FADE_FAR, false)).toBe(0);
    expect(tagOpacity(FADE_NEAR + (FADE_FAR - FADE_NEAR) / 2, false)).toBeCloseTo(0.5);
    expect(tagOpacity(3, true)).toBe(0);
    expect(quantizeOpacity(0)).toBe(0);
    expect(quantizeOpacity(1)).toBe(1);
    expect(quantizeOpacity(0.53)).toBe(0.55);
    expect(offScreen(0, 0, false)).toBe(false);
    expect(offScreen(1.2, 0, false)).toBe(true);
    expect(offScreen(0, 0, true)).toBe(true);
    expect(blockedAlong(0, 2, 0, 20, 2, 0, (x) => x > 12 && x < 16, () => 0)).toBe(true);
    expect(blockedAlong(0, 2, 0, 20, 2, 0, (x) => x > 0.5 && x < 6, () => 0)).toBe(false);
    expect(blockedAlong(0, 5, 0, 8, 5, 0, () => false, () => 0)).toBe(false);
    expect(blockedAlong(0, 2, 0, 8, 2, 0, () => false, () => 9)).toBe(true);
    expect(armAt(10_000, 7_000, 100, 2560)).toBe(100 + 3000 - 2560);
    const car = togetherStart('car', 10_000, 7_000, 100, KIT_GO_MS);
    expect(car.id).toBe('minato');
    expect(car.at).toBe(100 + 3000 - KIT_GO_MS);
    expect(togetherStart('race', 10_000, 7_000, 100, KIT_GO_MS)).toEqual({ at: 10_000 });
    expect(togetherStart('sail', 10_000, 7_000, 100, KIT_GO_MS)).toBe(null);
    expect(STAMP_MS).toBe(2500);
  });
});

describe('stand-ins', () => {
  test('each mode is a small untextured shape', () => {
    for (const mode of ['avatar', 'car', 'boat', 'gull', 'fish']) {
      const g = standIn(THREE, mode);
      const n = triangleCount(g);
      expect(n).toBeGreaterThan(10);
      expect(n).toBeLessThan(200);
    }
  });
});

describe('frame cost', () => {
  test('eight friends, already on screen, stay under 0.6 ms on the CPU', () => {
    const dom = makeDom();
    const prev = globalThis.document;
    globalThis.document = dom.document;
    try {
      const tags = dom.document.createElement('div');
      dom.document.body.appendChild(tags);
      const bodies = mountBodies({ add() {} }, tags);
      const list = [];
      for (let i = 0; i < 8; i++) list.push({ id: i + 1, mode: i % 2 ? 'car' : 'avatar', x: i, y: 0, z: -4, yaw: 0.2, pitch: 0, color: 'ao', label: 'あおのサバ', stamp: '' });
      bodies.draw(list, 8, null, true, 1);
      const N = 200;
      const t0 = performance.now();
      for (let i = 0; i < N; i++) bodies.draw(list, 8, null, true, 1);
      expect((performance.now() - t0) / N).toBeLessThan(0.6);
    } finally {
      globalThis.document = prev;
    }
  });
});

describe('the sheet', () => {
  test('one code field, four stamps, and no chat box', () => {
    const dom = makeDom();
    const prev = globalThis.document;
    globalThis.document = dom.document;
    const calls = [];
    try {
      const sheet = mountSheet(dom.document, {
        t: tOf('ja'),
        lang: 'ja',
        onCreate() { calls.push('create'); },
        onJoin(code) { calls.push('join:' + code); },
        onStamp(s) { calls.push('stamp:' + s); },
      });
      const html = dom.document.body.innerHTML;
      expect(html).not.toContain('<textarea');
      expect(dom.document.querySelectorAll('input').length).toBe(1);
      expect(dom.document.querySelectorAll('textarea').length).toBe(0);
      expect(dom.document.querySelector('#klc-multi-code').getAttribute('maxlength')).toBe('4');
      const stamps = [...dom.document.querySelectorAll('[data-s]')].map((b) => b.textContent);
      expect(stamps).toEqual(['やっほー', 'こっち！', 'すごい！', 'またね']);
      expect(readFileSync(join(ROOT, 'src/anime/play/multi/sheet.js'), 'utf8').replace(/\/\/.*$/gm, '')).not.toMatch(/word-break:\s*keep-all/);
      dom.fire(dom.document.querySelector('[data-act="create"]'), 'click', { detail: 1 });
      expect(calls).toEqual(['create']);
      const input = dom.document.querySelector('#klc-multi-code');
      input.value = 'aoi1';
      dom.fire(input, 'input');
      expect(input.value).toBe('A');
      sheet.showJoin();
      dom.fire(dom.document.querySelector('[data-act="enter"]'), 'click', { detail: 1 });
      expect(calls[1]).toBe('join:A');
      dom.fire(dom.document.querySelector('[data-s="2"]'), 'click', { detail: 1 });
      expect(calls[2]).toBe('stamp:2');
      sheet.setCode('AB3C');
      expect(dom.document.querySelector('[data-f="code"]').textContent).toBe('AB3C');
      expect(dom.document.querySelector('[data-act="copy"]').textContent).toBe('コピー');
      sheet.showCoach('あいことばを 友だちに おしえよう');
      expect(dom.document.querySelector('[data-f="coach"]').textContent).toContain('あいことば');
      sheet.setPhase('3', 'GO!');
      const count = dom.document.querySelector('[data-f="count"]');
      expect(count.textContent).toBe('3');
      expect(count.classList.contains('beat')).toBe(true);
      expect(dom.document.body.classList.contains('klc-multi-counting')).toBe(true);
      sheet.setPhase('go', 'GO!');
      expect(count.textContent).toBe('GO!');
      expect(count.classList.contains('go')).toBe(true);
      const css = readFileSync(join(ROOT, 'src/anime/play/multi/sheet.js'), 'utf8');
      expect(css).toContain('font: 900 120px/1');
      expect(css).toContain('#F8B500');
      expect(css).not.toMatch(/word-break:\s*keep-all/);
      sheet.showResults({
        title: 'みんなのタイム',
        rows: [[1, 1200], [2, 2400]],
        youId: 2,
        nameOf: (id) => (id === 2 ? 'あかのサバ・あなた' : 'あおのサバ'),
        fastest: 'いちばんはやい',
        stamp: '',
        again: 'もう一回',
        quit: 'やめる',
        pending: ['みずいろのサンマ'],
        pendingLabel: 'まだ',
        animate: false,
      });
      expect(dom.document.querySelector('.medal-lg').textContent).toContain('金');
      expect(dom.document.querySelector('.ranks .you').textContent).toContain('あかのサバ・あなた');
      expect(dom.document.querySelector('.ranks .mid .fast').textContent).toBe('いちばんはやい');
      expect(dom.document.querySelector('.hero').textContent).toBe('0:01.20');
      expect(dom.document.querySelector('[data-act="again"]').textContent).toBe('もう一回');
      expect(dom.document.querySelector('[data-act="dismiss"]').textContent).toBe('やめる');
      expect(dom.document.querySelector('.ranks').textContent).toContain('まだ');
    } finally {
      globalThis.document = prev;
    }
  });
});

describe('two sessions, one room', () => {
  let srv;
  afterEach(() => { srv?.stop(); srv = null; });

  function factory(origin) {
    return (url) => new WebSocket(url, { headers: { Origin: origin } });
  }
  function until(session, type) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(type)), 2000);
      const off = session.on((ev) => {
        if (ev.type !== type) return;
        clearTimeout(timer);
        off();
        resolve(ev);
      });
    });
  }

  test('they see each other move, start the same race, and leave', async () => {
    srv = startServer({ port: 0, hostname: '127.0.0.1', allow: null });
    const url = `ws://127.0.0.1:${srv.port}/ws`;
    let now = 1_000_000;
    const a = createSession({ url, now: () => now, socketFactory: factory(PROD) });
    const b = createSession({ url, now: () => now, socketFactory: factory('http://127.0.0.1:9506') });
    const aRoom = until(a, 'room');
    a.create();
    const room = await aRoom;
    expect(room.code).toMatch(/^[ACDEFHJKMNPQRTUVWXY3479]{4}$/);
    const bRoom = until(b, 'room');
    const aPeer = until(a, 'peer');
    b.join(room.code.toLowerCase());
    const joined = await bRoom;
    const peer = await aPeer;
    expect(joined.self.id).not.toBe(room.self.id);
    expect(peer.id).toBe(joined.self.id);
    const d1 = packPose({ mode: 'avatar', x: 4, y: 1, z: 2, yaw: 0.3, pitch: 0, look: 0, vehicle: 0 });
    const d2 = packPose({ mode: 'car', x: 12, y: 1, z: -3, yaw: 1, pitch: 0, look: 0, vehicle: 2 });
    a.sendPose({ mode: 'avatar', x: 4, y: 1, z: 2, yaw: 0.3, pitch: 0, look: 0, vehicle: 0 });
    b.sendPose({ mode: 'car', x: 12, y: 1, z: -3, yaw: 1, pitch: 0, look: 0, vehicle: 2 });
    expect(d1 && d2).toBeTruthy();
    await new Promise((r) => setTimeout(r, 40));
    for (const room of srv.hub.rooms.values()) room.relayAt = 0;
    const seen = until(a, 'snap');
    const { applyHub } = { applyHub: () => {} };
    void applyHub;
    const actions = srv.hub.tick(Date.now());
    for (const act of actions) if (act.text) act.conn.send(act.text);
    await seen;
    const friend = a.peers.get(joined.self.id);
    const out = { x: 0, y: 0, z: 0, yaw: 0, mode: '' };
    const snapNow = Date.now();
    sample(friend.buf, snapNow + 120, out);
    expect(out.mode).toBe('car');
    expect(out.x).toBeCloseTo(12, 1);
    const raceA = until(a, 'race');
    const raceB = until(b, 'race');
    expect(a.startRace('car')).toBe(true);
    const ra = await raceA;
    const rb = await raceB;
    expect(ra.go).toBe(rb.go);
    expect(ra.course).toBe('car');
    const gone = until(b, 'gone');
    a.leave();
    const left = await gone;
    expect(left.id).toBe(room.self.id);
    b.leave();
    await new Promise((r) => setTimeout(r, 40));
    expect(srv.hub.stats().rooms).toBe(0);
  });
});
