// [play:missions] Quest rules, the voucher, the dialogue and the card. Fakes stand in for lanes that are not mounted yet.
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SENSITIVE } from '../scripts/anime/enrich/fold.js';
import * as L from '../src/anime/world/layout.js';
import QUESTS from '../data/play/quests.json';
import NPCS from '../data/play/npcs.json';
import PARTNERS from '../data/play/partners.json';
import { PACK, t } from '../src/anime/play/missions/strings.js';
import {
  TALK_R, CPS, medalAtLeast, katsuoCount, emptyProgress, hydrate, serialize, questById, questLog,
  offeredQuest, markerFor, turnInFor, balloonOpacity, balloonMark, bearingDeg, stampGlyph, stampRows,
  nearest, angleDelta, stepMet, acceptQuest, noteIppon, notePhoto, notePerch,
  noteSwim, noteRace, absorbCourses, advance, onTalk, stepTarget, tracker, fillWorld, forceComplete,
  balloonPx, BALLOON_FLOOR_PX, BALLOON_CAP_PX, BALLOON_NEAR, BALLOON_FAR,
  DIALOGUE_PHONE_PX, DIALOGUE_DESK_PX, handoffOf, countStamps, stampLine, modeIsNew, questMode, markIsBang,
} from '../src/anime/play/missions/logic.js';
import { scriptFor, heardAmbient, openLine, stepLine, skipLine, visible, blipFor, voicePitch } from '../src/anime/play/missions/dialogue.js';
import { readable, clearStance, sightBlocked, standingClear } from '../src/anime/play/missions/place.js';
import { idlePose } from '../src/anime/play/npc/figures.js';
import {
  ALPH, contrast, inkOn, glyphOnPaper, makeVoucherCode, parseVoucherCode, voucherHttp, partnerLive,
  presentReward, formatWhen, deviceIdOf,
} from '../src/anime/play/missions/voucher.js';
import { createShim } from '../src/anime/play/missions/shim.js';
import { migrate } from '../src/anime/play/kit/store.js';
import { mountUi } from '../src/anime/play/missions/ui.js';
import { makeDom } from './lib/mini-dom.js';

const quests = QUESTS.quests;
const npcs = NPCS.npcs;
const tr = (key) => t('ja', key);
const now = Date.parse('2026-10-07T04:00:00Z');

function world(state, pos, extra = {}) {
  const w = { pos: { x: pos.x, y: pos.y || 0, z: pos.z } };
  return fillWorld(w, state, w.pos, extra.katsuo || 0, extra.courses || {}, extra.now || now);
}

describe('quest steps', () => {
  test('medals, charms and a broken save', () => {
    expect(medalAtLeast('gold', 'bronze')).toBe(true);
    expect(medalAtLeast('silver', 'silver')).toBe(true);
    expect(medalAtLeast('bronze', 'silver')).toBe(false);
    expect(medalAtLeast(undefined, 'bronze')).toBe(false);
    expect(katsuoCount({ found: { a: 't', b: 't' } })).toBe(2);
    expect(katsuoCount({ found: ['a', 'b', 'c'] })).toBe(3);
    expect(katsuoCount(null)).toBe(0);
    expect(hydrate(null).active).toBe(null);
    expect(hydrate('nope').progress).toEqual({});
    const s = emptyProgress();
    s.pending.push('x');
    s.photos = Array.from({ length: 30 }, (_, i) => ({ x: i, z: 0, yaw: 0 }));
    const saved = serialize(s);
    expect(saved.pending).toBeUndefined();
    expect(hydrate(saved).photos.length).toBe(24);
    expect(hydrate(saved).pending).toEqual([]);
  });

  test('each step type passes and fails', () => {
    const s = emptyProgress();
    const at = (step, pos, extra) => stepMet(step, world(s, pos, extra));
    expect(at({ type: 'reach', x: 10, z: 10, r: 4 }, { x: 12, z: 11 })).toBe(true);
    expect(at({ type: 'reach', x: 10, z: 10, r: 4 }, { x: 20, z: 10 })).toBe(false);
    expect(at({ type: 'collect', n: 3 }, { x: 0, z: 0 }, { katsuo: 3 })).toBe(true);
    expect(at({ type: 'collect', n: 3 }, { x: 0, z: 0 }, { katsuo: 2 })).toBe(false);
    const courses = { 'minato-loop': { medal: 'bronze' } };
    expect(at({ type: 'medal', course: 'minato-loop', min: 'bronze' }, { x: 0, z: 0 }, { courses })).toBe(true);
    expect(at({ type: 'medal', course: 'minato-loop', min: 'gold' }, { x: 0, z: 0 }, { courses })).toBe(false);
    expect(at({ type: 'medal', course: 'other', min: 'bronze' }, { x: 0, z: 0 }, { courses })).toBe(false);
    noteIppon(s, { kind: 'catch', kg: 2, cm: 40 });
    expect(at({ type: 'ippon', kg: 2 }, { x: 0, z: 0 })).toBe(true);
    expect(at({ type: 'ippon', count: 2 }, { x: 0, z: 0 })).toBe(false);
    expect(at({ type: 'ippon', cm: 50 }, { x: 0, z: 0 })).toBe(false);
    notePhoto(s, { x: 1, z: 1, yaw: 0 });
    expect(at({ type: 'photo', x: 1, z: 1, r: 5, yaw: -0.4, yawTol: 1.1 }, { x: 0, z: 0 })).toBe(true);
    expect(at({ type: 'photo', x: 1, z: 1, r: 5, yaw: 2.6, yawTol: 0.4 }, { x: 0, z: 0 })).toBe(false);
    expect(at({ type: 'photo', x: 80, z: 80, r: 5 }, { x: 0, z: 0 })).toBe(false);
    notePerch(s, { id: 'mast', x: 3, z: 4 });
    expect(at({ type: 'gull', perch: 'mast' }, { x: 0, z: 0 })).toBe(true);
    expect(at({ type: 'gull', x: 3, z: 4, r: 2 }, { x: 0, z: 0 })).toBe(true);
    expect(at({ type: 'gull', x: 30, z: 30, r: 2 }, { x: 0, z: 0 })).toBe(false);
    noteSwim(s, { x: 5, y: -1, z: 5 });
    expect(at({ type: 'swim', x: 5, y: -1, z: 5, r: 3 }, { x: 0, z: 0 })).toBe(true);
    expect(at({ type: 'swim', x: 5, y: -8, z: 5, r: 3 }, { x: 0, z: 0 })).toBe(false);
    noteRace(s, 400000);
    noteRace(s, 500000);
    expect(s.raceMs).toBe(400000);
    absorbCourses(s, { 'race-minato': { best: 300000, medal: 'gold' } });
    expect(s.raceMs).toBe(300000);
    absorbCourses(s, { 'race-minato': { best: 350000 } });
    expect(s.raceMs).toBe(300000);
    const landed = emptyProgress();
    noteIppon(landed, { kind: 'landed', kg: 2.4, count: 3, biggest: 62 });
    expect(landed.ippon.kg).toBe(2.4);
    expect(landed.ippon.maxCm).toBe(62);
    expect(at({ type: 'race', ms: 480000 }, { x: 0, z: 0 })).toBe(true);
    expect(at({ type: 'race', ms: 1000 }, { x: 0, z: 0 })).toBe(false);
    expect(at({ type: 'talk', npc: 'a' }, { x: 0, z: 0 })).toBe(false);
    expect(at({ type: 'nope' }, { x: 0, z: 0 })).toBe(false);
  });

  test('a catch adds, a landing never shrinks the total', () => {
    const s = emptyProgress();
    noteIppon(s, { kg: 1, cm: 30 });
    noteIppon(s, { kg: 1.5, cm: 45 });
    expect(s.ippon).toEqual({ kg: 2.5, count: 2, maxCm: 45 });
    noteIppon(s, { kind: 'landed', kg: 1, count: 1, cm: 20 });
    expect(s.ippon).toEqual({ kg: 2.5, count: 2, maxCm: 45 });
    noteIppon(s, { kind: 'landed', kg: 9, count: 4, cm: 60 });
    expect(s.ippon).toEqual({ kg: 9, count: 4, maxCm: 60 });
  });

  test('angles wrap, and the talk radius is 3 m', () => {
    expect(angleDelta(0, Math.PI * 2)).toBeLessThan(1e-9);
    expect(angleDelta(Math.PI, -Math.PI)).toBeLessThan(1e-9);
    expect(angleDelta(0, Math.PI)).toBeCloseTo(Math.PI, 6);
    const list = [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 10, z: 0 }];
    expect(nearest(list, 3, 0, TALK_R)?.id).toBe('a');
    expect(nearest(list, 3.05, 0, TALK_R)).toBe(null);
    expect(TALK_R).toBe(3);
    expect(CPS).toBe(40);
  });

  test('accept does not fail, and a quest in the background still moves', () => {
    const s = emptyProgress();
    const shrine = questById(quests, 'shrine-visit');
    const ferry = questById(quests, 'ferry-view');
    acceptQuest(s, shrine, now);
    acceptQuest(s, ferry, now);
    expect(s.active).toBe('ferry-view');
    const w = world(s, { x: 345, z: -145.3 });
    advance(s, quests, w);
    expect(s.progress['shrine-visit'].step).toBe(1);
    expect(s.progress['ferry-view'].step).toBe(0);
    expect(s.progress['shrine-visit'].done).toBe(null);
    advance(s, quests, w);
    expect(s.progress['shrine-visit'].step).toBe(1);
  });

  test('a catch then a conversation, and a delivery that needs the paper', () => {
    const s = emptyProgress();
    const q = questById(quests, 'morning-catch');
    expect(q.steps[0].type).toBe('talk');
    expect(q.steps[0].npc).toBe('captain');
    expect(handoffOf(q.steps[0])).toBe('ippon');
    expect(q.steps[1].type).toBe('ippon');
    acceptQuest(s, q, now);
    noteIppon(s, { kg: 2 });
    advance(s, quests, world(s, { x: 0, z: 0 }));
    expect(s.progress[q.id].step).toBe(0);
    expect(onTalk(s, quests, 'captain', now)).toBe('morning-catch');
    expect(s.progress[q.id].step).toBe(1);
    advance(s, quests, world(s, { x: 0, z: 0 }));
    expect(s.progress[q.id].step).toBe(2);
    expect(s.progress[q.id].done).toBe(null);
    expect(onTalk(s, quests, 'someone', now)).toBe(null);
    expect(onTalk(s, quests, 'auctioneer', now)).toBe('morning-catch');
    expect(s.progress[q.id].done).toBe(now);
    expect(s.active).toBe(null);
    expect(acceptQuest(s, q, now)).toBe(false);

    const bus = questById(quests, 'bus-slip');
    const s2 = emptyProgress();
    acceptQuest(s2, bus, now);
    expect(s2.holding.slip).toBe('stop');
    advance(s2, quests, world(s2, { x: 186, z: 99 }));
    expect(s2.progress[bus.id].step).toBe(1);
    expect(onTalk(s2, quests, 'guide', now)).toBe('bus-slip');
    expect(s2.holding.slip).toBeUndefined();
    expect(s2.delivered.slip).toBe('guide');
    expect(s2.progress[bus.id].done).toBe(now);

    const s3 = emptyProgress();
    s3.progress[bus.id] = { step: 1, started: now, done: null };
    expect(onTalk(s3, quests, 'guide', now)).toBe(null);
  });

  test('every quest can be finished with a fake world', () => {
    for (const q of quests) {
      const s = emptyProgress();
      acceptQuest(s, q, now);
      let katsuo = 0;
      const courses = {};
      const pos = { x: 0, y: 0, z: 0 };
      let guard = 0;
      while (!s.progress[q.id].done && guard++ < 8) {
        const step = q.steps[s.progress[q.id].step];
        expect(step).toBeTruthy();
        if (step.type === 'reach' || step.type === 'photo' || step.type === 'swim' || step.type === 'gull') {
          pos.x = step.x; pos.z = step.z; pos.y = step.y || 0;
        }
        if (step.type === 'collect') katsuo = step.n;
        if (step.type === 'medal') courses[step.course] = { medal: 'gold' };
        if (step.type === 'ippon') noteIppon(s, { kind: 'catch', kg: step.kg || 0, cm: step.cm || 0 });
        if (step.type === 'photo') notePhoto(s, { x: step.x, z: step.z, yaw: step.yaw ?? 0 });
        if (step.type === 'gull') notePerch(s, { x: step.x, z: step.z, id: step.perch || null });
        if (step.type === 'swim') noteSwim(s, { x: step.x, y: step.y || 0, z: step.z });
        if (step.type === 'race') noteRace(s, step.ms);
        const w = world(s, pos, { katsuo, courses });
        if (step.type === 'talk') onTalk(s, quests, step.npc, now);
        else if (step.type === 'deliver') onTalk(s, quests, step.to, now);
        else advance(s, quests, w);
      }
      expect(s.progress[q.id].done).toBe(now);
      expect(s.pending.at(-1)).toBe(q.id);
    }
  });

  test('the tracker points at a place, and not at a medal', () => {
    const s = emptyProgress();
    const q = questById(quests, 'anba-top');
    acceptQuest(s, q, now);
    const w = world(s, { x: -354, z: -810 });
    const info = tracker(s, quests, npcs, w);
    expect(info.quest.id).toBe('anba-top');
    expect(info.target.x).toBeCloseTo(-493.6, 1);
    expect(info.dist).toBeGreaterThan(28);
    const medal = questById(quests, 'port-medal');
    acceptQuest(s, medal, now);
    expect(stepTarget(medal.steps[0], npcs)).toBe(null);
    expect(tracker(s, quests, npcs, w).quest.id).toBe('port-medal');
  });
});

describe('what people say', () => {
  test('an offer has two choices, a delivery comes before the guide’s own quest', () => {
    const kid = npcs.find((n) => n.id === 'kid');
    const s = emptyProgress();
    const offer = scriptFor(kid, quests, s, tr);
    expect(offer.act).toBe('offer');
    expect(offer.pages[0].choices.map((c) => c.act)).toEqual(['accept', 'close']);
    expect(offer.pages[0].text.startsWith('play.')).toBe(false);

    const guide = npcs.find((n) => n.id === 'guide');
    acceptQuest(s, questById(quests, 'bus-slip'), now);
    s.progress['bus-slip'].step = 1;
    const mid = scriptFor(guide, quests, s, tr);
    expect(mid.act).toBe('deliver');
    expect(mid.quest).toBe('bus-slip');
    onTalk(s, quests, 'guide', now);
    const next = scriptFor(guide, quests, s, tr);
    expect(next.act).toBe('offer');
    expect(next.quest).toBe('quay-run');
  });

  test('a reminder while it is open, then a closing line, then the other ambient line', () => {
    const fisher = npcs.find((n) => n.id === 'fisher');
    const s = emptyProgress();
    acceptQuest(s, questById(quests, 'quay-photo'), now);
    expect(scriptFor(fisher, quests, s, tr).act).toBe('remind');
    forceComplete(s, questById(quests, 'quay-photo'), now);
    expect(scriptFor(fisher, quests, s, tr).act).toBe('done');
    const line = scriptFor(fisher, quests, s, tr).pages[0].text;
    heardAmbient(s, 'fisher');
    const other = npcs.find((n) => n.id === 'diver');
    forceComplete(s, questById(quests, 'first-dive'), now);
    heardAmbient(s, 'diver');
    const a = scriptFor(other, quests, s, tr).pages[0].text;
    heardAmbient(s, 'diver');
    const b = scriptFor(other, quests, s, tr).pages[0].text;
    expect(a).not.toBe(b);
    expect(line.length).toBeGreaterThan(0);
  });

  test('the typewriter is 40 a second, a tap finishes it, and blips skip punctuation', () => {
    const text = 'あ'.repeat(40);
    expect(text.length).toBe(40);
    const line = openLine(text, 0, { cps: 40 });
    stepLine(line, 0.5);
    expect(visible(line).length).toBe(20);
    expect(line.done).toBe(false);
    const blip = blipFor(line, 19);
    expect(blip.pitch).toBeGreaterThanOrEqual(-2);
    stepLine(line, 1);
    expect(line.done).toBe(true);
    const punct = openLine('港、朝。', 0);
    punct.shown = 2;
    expect(blipFor(punct, 1)).toBe(null);
    const jump = openLine(text, 0);
    jump.shown = 12;
    expect(blipFor(jump, 0)).toEqual({ pitch: 0, once: true });
    skipLine(line);
    expect(visible(line)).toBe(text);
    const instant = openLine(text, 0, { instant: true });
    expect(instant.done).toBe(true);
    expect(markerFor(npcs[0], quests, emptyProgress())).toBe('quest');
    const done = emptyProgress();
    for (const q of quests) if (q.giver === npcs[0].id) forceComplete(done, q, now);
    expect(markerFor(npcs[0], quests, done)).toBe('talk');
    expect(balloonMark('quest')).toBe('！');
    expect(balloonMark('turnin')).toBe('？');
    expect(balloonMark('talk')).toBe('…');
    expect(balloonOpacity(10)).toBe(1);
    expect(balloonOpacity(60)).toBe(1);
    expect(balloonOpacity(BALLOON_FAR)).toBe(0);
    expect(balloonOpacity(84)).toBeGreaterThan(0);
    expect(balloonOpacity(84)).toBeLessThan(1);
    expect(balloonOpacity(48, 'talk')).toBe(0);
    expect(balloonOpacity(20, 'talk')).toBe(1);
    expect(markIsBang('quest')).toBe(true);
    expect(markIsBang('talk')).toBe(false);
    expect(offeredQuest(quests, done, npcs[0].id)).toBe(null);
  });

  test('the log is active, then available, then done', () => {
    const s = emptyProgress();
    acceptQuest(s, questById(quests, 'golden-three'), now);
    forceComplete(s, questById(quests, 'quay-run'), now);
    const log = questLog(quests, s);
    expect(log.active.map((q) => q.id)).toEqual(['golden-three']);
    expect(log.done.map((q) => q.id)).toEqual(['quay-run']);
    expect(log.available.some((q) => q.id === 'golden-three')).toBe(false);
    expect(log.available.length + log.active.length + log.done.length).toBe(quests.length);
  });
});

describe('vouchers', () => {
  test('no live partner means 協力店募集中, and a written yes mints one code', () => {
    const q = questById(quests, 'cape-trees');
    const s = emptyProgress();
    const recruiting = presentReward(q, [], s, now, 'DEVICE12');
    expect(recruiting.kind).toBe('recruiting');
    expect(recruiting.code).toBe(null);
    expect(presentReward(q, [{ id: 'x', active: true }], s, now, 'DEVICE12')).toBe(recruiting);

    const live = {
      id: 'shop', shop: '例', active: true,
      offer: { ja: 'お茶', en: 'tea' }, terms: { ja: 'お一人さま', en: 'one each' },
      validFrom: '2026-01-01', validTo: '2026-12-31', perDevice: 1,
      consent: { kind: 'written', date: '2026-10-01', ref: 'note' },
    };
    const fresh = emptyProgress();
    const card = presentReward({ ...q, voucher: 'shop' }, [live], fresh, now, 'DEVICE12');
    expect(card.kind).toBe('voucher');
    expect(parseVoucherCode(card.code).ok).toBe(true);
    expect(presentReward({ ...q, voucher: 'shop' }, [live], fresh, now + 60000, 'DEVICE12').code).toBe(card.code);

    const quiet = emptyProgress();
    expect(presentReward(q, [live], quiet, now, 'DEVICE12', { preview: true }).kind).toBe('recruiting');
    expect(quiet.rewards[q.id]).toBeUndefined();

    expect(partnerLive({ ...live, active: true, consent: { kind: 'spoken' } }, now)).toBe(false);
    expect(partnerLive({ ...live, validTo: '2020-01-01' }, now)).toBe(false);
    expect(partnerLive({ ...live, active: false }, now)).toBe(false);
    expect(PARTNERS.partners.filter((p) => p.active).length).toBe(0);
  });

  test('the code round-trips, and a bad check character does not', async () => {
    expect(ALPH.length).toBe(32);
    expect(ALPH.includes('I') || ALPH.includes('0')).toBe(false);
    const code = makeVoucherCode({ questId: 'katsu', deviceId: 'DEVICE12', minute: 29800000 });
    const parsed = parseVoucherCode(code);
    expect(parsed.ok).toBe(true);
    expect(parsed.quest).toBe('KATSU');
    const bad = code.slice(0, -1) + (code.at(-1) === 'A' ? 'B' : 'A');
    expect(parseVoucherCode(bad).ok).toBe(false);
    const ok = voucherHttp(new URL('https://local/api/play/voucher/check?c=' + code));
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);
    const no = voucherHttp(new URL('https://local/api/play/voucher/check?c=' + bad));
    expect(no.status).toBe(400);
    const jaWhen = formatWhen(now, 'ja');
    const enWhen = formatWhen(now, 'en');
    expect(jaWhen).toMatch(/^\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}$/);
    expect(enWhen).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(enWhen.slice(-5)).toBe(jaWhen.slice(-5));
    expect(deviceIdOf({ deviceId: 'ABCDEFGH' }, () => 0)).toBe('ABCDEFGH');
    expect(deviceIdOf({}, () => 0).length).toBe(8);
  });

  test('every name plate clears 4.5:1', () => {
    for (const n of npcs) {
      expect(contrast(inkOn(n.color), n.color)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(glyphOnPaper(n.color), '#FBFAF5')).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the book of quests', () => {
  test('twelve to sixteen quests, one source each, every step kind, people on land', () => {
    expect(quests.length).toBeGreaterThanOrEqual(12);
    expect(quests.length).toBeLessThanOrEqual(16);
    expect(npcs.length).toBe(quests.length + 1);
    expect(npcs.some((n) => n.id === 'captain')).toBe(true);
    const types = new Set();
    const ids = new Set();
    for (const q of quests) {
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
      expect(/^https?:\/\//.test(q.source)).toBe(true);
      expect(q.minutes[0]).toBeGreaterThanOrEqual(3);
      expect(q.minutes[1]).toBeLessThanOrEqual(6);
      expect(npcs.some((n) => n.id === q.giver)).toBe(true);
      for (const step of q.steps) {
        types.add(step.type);
        if (step.npc) expect(npcs.some((n) => n.id === step.npc)).toBe(true);
        if (step.to) expect(npcs.some((n) => n.id === step.to)).toBe(true);
        if (step.type === 'swim') expect(L.isWater(step.x, step.z)).toBe(true);
        if (step.type === 'reach' || step.type === 'photo') expect(L.isWater(step.x, step.z)).toBe(false);
      }
      for (const key of [q.title, q.offer, q.active, q.done, q.fact, q.factFrom, q.reward.title]) {
        expect(PACK.ja[key], key).toBeTruthy();
        expect(PACK.en[key], key).toBeTruthy();
      }
      for (const step of q.steps) {
        expect(PACK.ja[step.hint], step.hint).toBeTruthy();
        if (step.line) expect(PACK.ja[step.line], step.line).toBeTruthy();
      }
    }
    for (const kind of ['talk', 'reach', 'collect', 'medal', 'ippon', 'photo', 'deliver', 'gull', 'swim', 'race']) {
      expect(types.has(kind)).toBe(true);
    }
    for (const n of npcs) {
      expect(L.isWater(n.x, n.z)).toBe(false);
      expect(PACK.ja[n.role]).toBeTruthy();
      for (const line of n.lines) expect(PACK.ja[line]).toBeTruthy();
    }
    const hiker = npcs.find((n) => n.id === 'hiker');
    const top = questById(quests, 'anba-top').steps[0];
    expect(Math.hypot(hiker.x - top.x, hiker.z - top.z)).toBeGreaterThan(top.r);
    expect(Object.keys(PACK.ja).sort()).toEqual(Object.keys(PACK.en).sort());
  });

  test('copy, comments and docs stay clear of the fold list', () => {
    const root = join(import.meta.dir, '..');
    const files = [
      'data/play/quests.json', 'data/play/npcs.json', 'data/play/partners.json', 'data/play-i18n.json',
      'docs/play/MISSIONS.md', 'docs/play/PARTNERS.md',
    ];
    for (const rel of files) {
      const text = readFileSync(join(root, rel), 'utf8');
      expect(SENSITIVE.test(text), rel).toBe(false);
    }
    for (const dir of ['src/anime/play/missions', 'src/anime/play/npc']) {
      for (const name of readdirSync(join(root, dir))) {
        if (!name.endsWith('.js')) continue;
        const text = readFileSync(join(root, dir, name), 'utf8');
        expect(SENSITIVE.test(text), name).toBe(false);
        expect(text.includes('keep-all'), name).toBe(false);
      }
    }
  });
});

describe('the dialogue and the card', () => {
  test('a name plate, two choices, a recruiting card and the log', () => {
    const dom = makeDom();
    const ui = mountUi({
      doc: dom.document, win: dom.window, reduce: true,
      onChoice(c) { chosen = c.act; },
      onAdvance() { advanced += 1; },
      onOpenLog() { opened = true; },
      onPick(id) { picked = id; },
      onCardClose() { closed = true; },
    });
    let chosen = '', advanced = 0, opened = false, picked = '', closed = false;
    ui.setBook(true, '手帳');
    ui.setPrompt(true, '話す');
    ui.setTracker({ title: '朝のカツオ', step: 'せり人に、報告する', dist: 'あと 12 m' });
    ui.showPage({
      act: 'offer', role: 'せり人', color: '#B7282E', ink: '#FBFAF5',
      full: '今朝のカツオは、目が澄んでいました。',
      shown: '今朝のカツオは、目が澄んでいました。', done: true,
      choices: [
        { id: 'yes', label: '引き受ける', act: 'accept' },
        { id: 'no', label: 'また今度', act: 'close' },
      ],
    });
    const root = dom.document.getElementById('klc-m');
    expect(root.querySelector('.m-name').textContent).toBe('せり人');
    expect(root.querySelector('.m-words').textContent).toBe('今朝のカツオは、目が澄んでいました。');
    expect(root.querySelector('.m-live').textContent).toContain('今朝のカツオ');
    expect(root.querySelectorAll('.m-choices button').length).toBe(2);
    expect(root.querySelector('.m-on .m-cur').textContent).toBe('▶');
    expect(root.querySelector('.m-line').textContent).toContain('今朝のカツオ');
    expect(root.querySelector('.m-prompt').textContent).toBe('話す');
    expect(root.querySelector('.m-track-dist').textContent).toBe('あと 12 m');
    root.querySelector('.m-yes').click();
    expect(chosen).toBe('accept');
    ui.showPage({ act: 'ambient', role: '漁師', color: '#165E83', ink: '#FBFAF5', full: '網。', shown: '網', done: false, choices: null });
    dom.fire(root.querySelector('.m-sheet'), 'click');
    expect(advanced).toBe(1);

    ui.showCard({
      kind: 'recruiting', title: '百樹園', fact: '神明崎は百樹園とも呼ばれます。', from: '気仙沼さ来てけらいん',
      seal: '百', color: '#F19072', sealInk: '#17184B', recruiting: '協力店募集中',
      rewardLabel: 'ごほうび', close: 'とじる',
    });
    expect(root.querySelector('.m-card').dataset.kind).toBe('recruiting');
    expect(root.querySelector('.m-recruit-title').textContent).toBe('協力店募集中');
    expect(root.querySelector('.m-code')).toBe(null);
    root.querySelector('.m-card .m-x').click();
    expect(closed).toBe(true);

    ui.showCard({
      kind: 'voucher', title: 'せりの朝', fact: '事実', from: '組合', seal: 'せ',
      shop: '例の店', offer: 'お茶を一杯', terms: 'お一人さま', code: 'KATSU-AAAA-BBBBBB-C',
      codeLabel: 'コード', whenLabel: '達成 2026年10月7日 09:30', showLine: 'お店でこの画面を見せてください',
      rewardLabel: 'ごほうび', close: 'とじる', color: '#B7282E', sealInk: '#B7282E',
    });
    expect(root.querySelector('.m-code').textContent).toBe('KATSU-AAAA-BBBBBB-C');
    expect(root.querySelector('.m-show').textContent).toContain('お店でこの画面を見せてください');

    ui.showLog({
      title: 'クエスト', close: 'とじる', empty: 'まだクエストはありません。',
      heads: { active: '進行中', available: 'はなしを聞く', done: '達成' },
      active: [{ id: 'golden-three', title: '金のカツオを3匹', step: '金のカツオを3匹見つける', kind: 'active' }],
      available: [], done: [],
    });
    expect(root.querySelector('.m-q-title').textContent).toBe('金のカツオを3匹');
    root.querySelector('.m-q').click();
    expect(picked).toBe('golden-three');
    root.querySelector('.m-track').click();
    expect(opened).toBe(true);
    expect(root.querySelector('style').textContent.includes('keep-all')).toBe(false);
    const css = root.querySelector('style').textContent;
    expect(css).toContain(DIALOGUE_PHONE_PX + 'px');
    expect(css).toContain(DIALOGUE_DESK_PX + 'px');
    expect(DIALOGUE_PHONE_PX).toBeGreaterThanOrEqual(15);
    expect(DIALOGUE_DESK_PX).toBeGreaterThanOrEqual(16);

    ui.showCoach('話しかけて みよう');
    expect(root.querySelector('.m-coach').textContent).toBe('話しかけて みよう');
    ui.showHub({
      title: 'クエスト', hook: '町の人に、話しかけよう', progress: 'スタンプ 0/14',
      start: 'はじめる', isNew: true, art: '/data/play/art/quests.webp',
      chips: ['5分', '★☆☆', '1人'],
    });
    expect(root.querySelector('.m-hub-title').textContent).toBe('クエスト');
    expect(root.querySelector('.m-hub-go').textContent).toBe('はじめる');
    expect(root.querySelector('.m-hub-progress').textContent).toBe('スタンプ 0/14');
    expect(root.querySelectorAll('.m-chip').length).toBe(3);
  });
});

describe('the kit shim', () => {
  test('progress stays on the device object we pass in', () => {
    const mem = new Map();
    const storage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
    };
    const kit = createShim({ services: {}, player: { position: { x: 1, y: 2, z: 3 } } }, { storage });
    let seen = 0;
    kit.store.on('katsuo', () => { seen++; });
    kit.store.update('katsuo', (draft) => { draft.found = { a: 't' }; return draft; });
    expect(katsuoCount(kit.store.get('katsuo'))).toBe(1);
    expect(seen).toBe(1);
    const out = { x: 0, y: 0, z: 0 };
    kit.playerPos(out);
    expect(out).toEqual({ x: 1, y: 2, z: 3 });
    expect(kit.playMode()).toBe('walk');
    expect(kit.__shim).toBe(true);
    kit.sfx.play('tap', { pitch: 1, gain: 1 });
    kit.store.reset();
    expect(kit.store.get('katsuo').found).toEqual({});
  });
});

describe('the notebook keeps the quest log', () => {
  test('a reload still has the quests and the device id', () => {
    const state = migrate({
      meta: {
        firstRun: '2026-10-07T00:00:00.000Z',
        missions: { v: 1, active: 'shrine-visit', progress: { 'shrine-visit': { step: 1 } } },
        deviceId: 'ABCDEFGH',
      },
    });
    expect(state.meta.firstRun).toBe('2026-10-07T00:00:00.000Z');
    expect(state.meta.missions.active).toBe('shrine-visit');
    expect(state.meta.deviceId).toBe('ABCDEFGH');
    expect(state.katsuo.found).toEqual({});
  });
});

describe('round 2: marks, voices, stamps, a clear stance', () => {
  test('a turn-in is ？ and a new quest is ！', () => {
    const auctioneer = npcs.find((n) => n.id === 'auctioneer');
    const guide = npcs.find((n) => n.id === 'guide');
    const s = emptyProgress();
    expect(markerFor(auctioneer, quests, s)).toBe('quest');
    acceptQuest(s, questById(quests, 'morning-catch'), now);
    const captain = npcs.find((n) => n.id === 'captain');
    expect(markerFor(captain, quests, s)).toBe('quest');
    s.progress['morning-catch'].step = 2;
    expect(turnInFor(auctioneer, quests, s)).toBe('morning-catch');
    expect(markerFor(auctioneer, quests, s)).toBe('turnin');
    acceptQuest(s, questById(quests, 'bus-slip'), now);
    s.progress['bus-slip'].step = 1;
    expect(markerFor(guide, quests, s)).toBe('turnin');
    expect(voicePitch('kid')).toBeGreaterThan(voicePitch('shrine'));
    expect(voicePitch('barista')).toBe(5);
  });

  test('the arrow points right when the place is to the right', () => {
    const ahead = bearingDeg(0, -1, 0, -10);
    expect(Math.abs(ahead)).toBeLessThan(1);
    const east = bearingDeg(0, -1, 10, 0);
    expect(east).toBeGreaterThan(80);
    expect(east).toBeLessThan(100);
  });

  test('the stamp book draws every quest, and an empty one is only an outline', () => {
    const s = emptyProgress();
    forceComplete(s, questById(quests, 'shrine-visit'), now);
    const rows = stampRows(quests, s, (q) => t('ja', q.reward?.title || q.title), { 'shrine-visit': 1 });
    expect(rows.length).toBe(quests.length);
    const shrine = rows.find((r) => r.id === 'shrine-visit');
    expect(shrine.got).toBe(true);
    expect(shrine.fresh).toBe(true);
    expect(shrine.glyph).toBe(stampGlyph(shrine.title));
    expect(rows.filter((r) => !r.got).length).toBe(quests.length - 1);
  });

  test('a tree on the approach moves the person sideways, still facing you', () => {
    const tree = (tx, tz, r) => (x, z, y) => y > 0.3 && y < 6 && Math.hypot(x - tx, z - tz) < r;
    const npc = { x: 0, z: 0, y: 0, yaw: 0 };
    expect(readable(0, 0, 0, 0, () => false)).toBe(true);
    expect(readable(0, 0, 0, 0, tree(0, 4, 1.3))).toBe(false);
    const next = clearStance(npc, tree(0, 4, 1.3), () => 0);
    expect(next.moved).toBe(true);
    expect(next.yaw).toBe(0);
    expect(readable(next.x, next.z, next.y, next.yaw, tree(0, 4, 1.3))).toBe(true);
    const trunk = (x, z, y) => y > 0.2 && y < 4 && Math.hypot(x, z - 2) < 0.4;
    expect(sightBlocked(0, 10, 0, 0, 1.5, trunk)).toBe(true);
    expect(readable(0, 0, 0, 0, trunk)).toBe(false);
    const inside = (x, z, y) => (Math.hypot(x, z) < 0.4 && y > 0.2) || z > 6;
    const out = clearStance({ x: 0, z: 0, y: 0, yaw: 0 }, inside, () => 0);
    expect(out.moved).toBe(true);
    expect(Math.hypot(out.x, out.z)).toBeGreaterThan(0.6);
    const beside = (x, z, y) => y > 0.2 && y < 4 && Math.hypot(x - 0.4, z) < 0.25;
    expect(standingClear(0, 0, 0, beside)).toBe(false);
    const aside = clearStance({ x: 0, z: 0, y: 0, yaw: 0 }, beside, () => 0);
    expect(aside.moved).toBe(true);
    expect(standingClear(aside.x, aside.z, aside.y, beside)).toBe(true);
  });

  test('a quest balloon stays at least 22 px at 60 m, and the reward line stays the recruiting line', () => {
    expect(BALLOON_NEAR).toBeGreaterThanOrEqual(60);
    const desk = balloonPx(60, 900, 55);
    const phone = balloonPx(60, 852, 88);
    expect(desk).toBeGreaterThanOrEqual(BALLOON_FLOOR_PX);
    expect(phone).toBeGreaterThanOrEqual(BALLOON_FLOOR_PX);
    expect(balloonPx(6, 900, 55)).toBeLessThanOrEqual(BALLOON_CAP_PX);
    expect(balloonPx(6, 900, 55)).toBeGreaterThan(desk);
    const s = emptyProgress();
    expect(stampLine(countStamps(quests, s), quests.length, 'ja')).toBe('スタンプ 0/' + quests.length);
    expect(stampLine(3, 14, 'en')).toBe('Stamps 3/14');
    expect(modeIsNew(s)).toBe(true);
    acceptQuest(s, questById(quests, 'shrine-visit'), now);
    expect(modeIsNew(s)).toBe(false);
    const mode = questMode({ start() {}, progress() { return null; }, isNew() { return true; } });
    expect(mode.id).toBe('quests');
    expect(mode.title.ja).toBe('クエスト');
    expect(mode.order).toBe(60);
    expect(t('ja', 'play.quest.recruiting')).toBe('協力店募集中');
    expect(t('en', 'play.quest.recruiting')).toBe('Partner shops coming soon');
    expect(t('ja', 'play.quest.coach')).toBe('話しかけて みよう');
    const view = presentReward(questById(quests, 'morning-catch'), PARTNERS.partners, emptyProgress(), now, 'ABCDEFGH');
    expect(view.kind).toBe('recruiting');
  });

  test('a wave, a sweep and a mend travel far enough to read at 20 m', () => {
    const span = (idle, part) => {
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i <= 16; i++) {
        const p = idlePose(idle, i / 16 * Math.PI * 2, 0);
        const v = p[part][1];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return hi - lo;
    };
    expect(span('wave', 'R')).toBeGreaterThan(0.8);
    expect(span('sweep', 'R')).toBeGreaterThan(1.2);
    expect(idlePose('mend', 0, 0).stand.hrx).toBeGreaterThan(0.3);
    expect(idlePose('wave', 0, 0).R[0]).toBeGreaterThan(2);
  });
});
