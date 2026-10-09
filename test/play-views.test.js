// [play:views] The match, the hint, the catalogue and the LINE view tag.
import { describe, expect, test } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SENSITIVE } from '../scripts/anime/enrich/fold.js';
import QUESTS from '../data/play/quests.json';
import I18N from '../data/play-i18n.json';
import {
  emptyProgress, acceptQuest, questById, offeredQuest, advance, fillWorld, noteViewSent,
  angleDeltaDeg, viewMatch, viewDwell, hintCentre, viewWarmth, viewDistance, stampBook, countStamps,
} from '../src/anime/play/missions/logic.js';
import { catalogueProblems, lineViewUrl, formatTaken, viewById } from '../src/anime/play/missions/views.js';
import { quaternionFromYawPitch, anglesFromQuaternion, yawFromHeading } from '../src/anime/core/pose.js';
import { step, freshSession } from '../server/line/flows.js';
import { viewThumbPath } from '../server/line/admin.js';
import { mountUi } from '../src/anime/play/missions/ui.js';
import { VIEW_CSS } from '../src/anime/play/missions/viewcard.js';
import { makeDom } from './lib/mini-dom.js';

const quests = QUESTS.quests;
const now = Date.parse('2026-10-08T04:00:00Z');
const root = join(import.meta.dir, '..');

describe('view match', () => {
  const pose = { x: 10, y: 4, z: 20, yaw: 30, pitch: 5 };

  test('a camera on the pose matches, and the edges do too', () => {
    expect(viewMatch({ ...pose }, pose, { radius_m: 12, angle_deg: 20 })).toBe(true);
    expect(viewMatch({ ...pose, x: 22, z: 20 }, pose, { radius_m: 12, angle_deg: 20 })).toBe(true);
    expect(viewMatch({ ...pose, x: 22.1, z: 20 }, pose, { radius_m: 12, angle_deg: 20 })).toBe(false);
    expect(viewMatch({ ...pose, y: 10 }, pose, {})).toBe(true);
    expect(viewMatch({ ...pose, y: 10.1 }, pose, {})).toBe(false);
    expect(viewMatch({ ...pose, yaw: 50 }, pose, { angle_deg: 20 })).toBe(true);
    expect(viewMatch({ ...pose, yaw: 50.1 }, pose, { angle_deg: 20 })).toBe(false);
    expect(viewMatch({ ...pose, pitch: 20 }, pose, {})).toBe(true);
    expect(viewMatch({ ...pose, pitch: 20.1 }, pose, {})).toBe(false);
  });

  test('yaw wraps, and a wrong angle does not count', () => {
    expect(angleDeltaDeg(350, 10)).toBe(20);
    expect(angleDeltaDeg(10, 350)).toBe(20);
    expect(angleDeltaDeg(179, -179)).toBe(2);
    expect(viewMatch({ ...pose, yaw: 350 }, { ...pose, yaw: 10 }, { angle_deg: 20 })).toBe(true);
    expect(viewMatch({ ...pose, yaw: 349 }, { ...pose, yaw: 10 }, { angle_deg: 20 })).toBe(false);
    const q = quaternionFromYawPitch(150, 8);
    const back = yawFromHeading(anglesFromQuaternion(q).heading);
    expect(Math.abs(back - 150)).toBeLessThan(0.2);
  });

  test('the hold needs 0.6 s and a miss clears it', () => {
    let held = viewDwell(0, true, 0.25);
    expect(held.done).toBe(false);
    held = viewDwell(held.held, true, 0.25);
    expect(held.done).toBe(false);
    held = viewDwell(held.held, false, 0.5);
    expect(held.held).toBe(0);
    expect(held.done).toBe(false);
    held = viewDwell(0, true, 0.6);
    expect(held.done).toBe(true);
  });

  test('the hint centre stays 30 to 60 m away, and it does not move', () => {
    const a = hintCentre('V01', 31.4, 51.43);
    const b = hintCentre('V01', 31.4, 51.43);
    expect(a).toEqual(b);
    const dist = Math.hypot(a.x - 31.4, a.z - 51.43);
    expect(dist).toBeGreaterThanOrEqual(30);
    expect(dist).toBeLessThanOrEqual(60);
    expect(a.r).toBe(120);
    expect(hintCentre('V02', 0, 0)).not.toEqual(hintCentre('V03', 0, 0));
  });

  test('warmth is a word, not a metre count', () => {
    expect(viewWarmth(40)).toBe('near');
    expect(viewWarmth(40.1)).toBe('closer');
    expect(viewWarmth(100)).toBe('closer');
    expect(viewWarmth(100.1)).toBe('far');
    expect(viewDistance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });
});

describe('the catalogue', () => {
  test('twelve views, six of each kind, and the record says no faces', () => {
    expect(catalogueProblems()).toEqual([]);
    const views = QUESTS.quests.filter((q) => q.album === 'views');
    expect(views).toHaveLength(12);
    expect(stampBook(QUESTS.quests)).toHaveLength(14);
    let prev = null;
    for (const q of views) {
      expect(q.giver).toBe('photographer');
      expect(viewById(q.view).faces).toBe(0);
      if (prev) expect(offeredQuest(QUESTS.quests, emptyProgress(), 'photographer')?.id).not.toBe(q.id);
      prev = q.id;
    }
    const s = emptyProgress();
    expect(offeredQuest(QUESTS.quests, s, 'photographer').id).toBe('view-a-01');
    const first = questById(QUESTS.quests, 'view-a-01');
    acceptQuest(s, first, now);
    s.viewReady = 'V01';
    const world = { pos: { x: 0, y: 0, z: 0 } };
    advance(s, QUESTS.quests, fillWorld(world, s, world.pos, 0, {}, now));
    expect(s.progress['view-a-01'].done).toBe(now);
    expect(offeredQuest(QUESTS.quests, s, 'photographer').id).toBe('view-a-02');
    expect(countStamps(QUESTS.quests, s)).toBe(0);
  });

  test('a shipped file on disk stays within 80 KB, and the record says no faces', () => {
    for (let n = 1; n <= 12; n++) {
      const id = 'V' + String(n).padStart(2, '0');
      const file = join(root, 'data/play/views', id + '.webp');
      if (!existsSync(file)) continue;
      expect(statSync(file).size, id).toBeLessThanOrEqual(80 * 1024);
      expect(viewById(id).faces, id).toBe(0);
    }
  });

  test('copy stays off the fold list, and LINE waits until there is an id', () => {
    expect(SENSITIVE.test(JSON.stringify(QUESTS))).toBe(false);
    expect(formatTaken('2026-10-01', 'ja')).toBe('2026年10月1日');
    expect(formatTaken('2026-10-01', 'en')).toBe('2026-10-01');
    expect(lineViewUrl('V07', '')).toBe('');
    expect(lineViewUrl('V07', '@abc')).toBe('https://line.me/R/oaMessage/' + encodeURIComponent('@abc') + '/?' + encodeURIComponent('けしき V07'));
    expect(lineViewUrl('nope', '@abc')).toBe('');
    expect(viewThumbPath('../V01')).toBe(null);
    expect(viewThumbPath('V01/../../x')).toBe(null);
  });
});

describe('the card', () => {
  test('the hunt names the area, and the reveal says 見つけた', () => {
    const dom = makeDom();
    const ui = mountUi({ doc: dom.document, win: dom.window, reduce: true });
    ui.showHunt({
      id: 'V01',
      title: 'このけしき、どこ？',
      image: '/data/play/views/V01.webp',
      area: '南町海岸の広場のあたり',
      close: 'とじる',
      zoom: '大きく見る',
    });
    expect(ui.root.textContent).toContain('南町海岸の広場のあたり');
    expect(ui.root.textContent).not.toContain('あと ');
    expect(ui.viewOpen()).toBe(true);
    ui.showReveal({
      id: 'V01',
      title: '見つけた！',
      ask: 'ちがうところ、あった？',
      pair: [
        { src: '/data/play/views/V01.webp', alt: '写真', caption: '2026年10月1日' },
        { src: '/data/play/views/V07.webp', alt: 'ゲーム', caption: 'ゲーム' },
      ],
      close: 'とじる',
      keepLabel: 'けしき帳にしまう',
      reportLabel: 'ちがうところを報告',
      shareLabel: '共有する',
    });
    expect(ui.root.textContent).toContain('見つけた！');
    expect(ui.root.textContent).toContain('けしき帳にしまう');
    const host = dom.document.createElement('div');
    ui.fillAlbum(host, {
      lead: '見つけたけしきが、ここに残ります。12枚。',
      blank: 'まだ',
      cells: [
        { id: 'V01', found: true, image: '/data/play/views/V01.webp', title: '広場' },
        { id: 'V02', found: false },
      ],
    });
    expect(host.textContent).toContain('まだ');
    expect(host.textContent).toContain('12枚');
    expect(host.querySelectorAll('img').length).toBe(1);
  });

  test('まちで見つけよう: with a basic ID the card opens LINE with the tag; without one it says LINE は準備中', () => {
    const ja = I18N.ja;
    const label = ja['play.view.line'];
    // docs/CRAFT.md section 2: a space around Latin words in Japanese, like 「LINE は準備中」 beside it
    expect(label).toBe('LINE で送る');
    expect(ja['play.view.lineWait']).toBe('LINE は準備中');
    const send = (lineUrl, wait) => {
      const dom = makeDom();
      const ui = mountUi({ doc: dom.document, win: dom.window, reduce: true });
      ui.showHunt({
        id: 'V07', kind: 'send', title: ja['play.view.seriesB'], lead: ja['play.view.sendLead'],
        image: '/data/play/views/V07.webp', area: '内湾のあたり', close: 'とじる', zoom: '大きく見る',
        lineUrl, lineLabel: label, sentLabel: ja['play.view.sent'], wait,
      });
      return ui.root;
    };
    const ready = send(lineViewUrl('V07', '@123abcde'), '');
    const a = ready.querySelector('.m-view-acts a');
    expect(a.href).toBe('https://line.me/R/oaMessage/%40123abcde/?%E3%81%91%E3%81%97%E3%81%8D%20V07');
    expect(a.target).toBe('_blank');
    expect(a.rel).toBe('noopener noreferrer');
    expect(a.textContent).toBe('LINE で送る');
    expect(ready.querySelector('[data-act="wait"]')).toBe(null);
    const waiting = send(lineViewUrl('V07', ''), ja['play.view.lineWait']);
    expect(waiting.querySelector('.m-view-acts a')).toBe(null);
    expect(waiting.querySelector('[data-act="wait"]').textContent).toBe('LINE は準備中');
    expect(waiting.querySelector('[data-act="sent"]').textContent).toBe('送ったよ');
    // an <a> is content-box and inline: without this rule width:100% + padding ran 32 px past the card at 393 px wide
    expect(VIEW_CSS).toMatch(/#klc-m \.m-view-acts a \{ box-sizing: border-box; display: flex; align-items: center; justify-content: center; \}/);
  });
});

describe('LINE', () => {
  test('the tag rides the photo through to the stored draft', () => {
    const T = 1_700_000_000_000;
    const user = { type: 'user', userId: 'U' + 'b'.repeat(32) };
    const ev = (message, dt) => ({ timestamp: T + dt, source: user, type: 'message', message });
    let s = freshSession();
    let out = step(s, ev({ type: 'text', text: 'けしき V07' }, 0));
    s = out.session;
    out = step(s, ev({ type: 'text', text: 'はい、だいじょうぶ' }, 1));
    s = out.session;
    out = step(s, ev({ type: 'image', id: 'm1' }, 2));
    s = out.session;
    out = step(s, ev({ type: 'text', text: '送り終わった' }, 3));
    s = out.session;
    expect(s.step).toBe('confirm');
    out = step(s, ev({ type: 'text', text: '送る' }, 4));
    const commit = out.actions.find((a) => a.type === 'commit');
    expect(commit.draft.viewId).toBe('V07');
    expect(commit.draft.text).not.toContain('けしき');
    expect(noteViewSent(emptyProgress(), 'V07', now)).toBe(true);
    expect(noteViewSent(emptyProgress(), 'nope', now)).toBe(false);
  });
});

describe('the privacy blur on the real photos (tools/play/views-masks.json)', () => {
  const MASKS = JSON.parse(require('node:fs').readFileSync(join(root, 'tools/play/views-masks.json'), 'utf8')).masks;
  const VIEWS = require('../data/play/views.json').views;
  const real = VIEWS.filter((v) => v.kind === 'real');

  test('every masked frame is a shipped real view, and the record counts its boxes', () => {
    const surveys = new Set(real.map((v) => v.survey));
    for (const id of Object.keys(MASKS)) expect([id, surveys.has(id)]).toEqual([id, true]);
    for (const v of real) expect([v.id, v.blurred]).toEqual([v.id, (MASKS[v.survey] || []).length]);
  });

  test('each box is inside the frame, not empty, and says why', () => {
    for (const [id, rows] of Object.entries(MASKS)) {
      for (const r of rows) {
        const [x0, y0, x1, y1] = r.box;
        expect([id, x0 >= 0 && y0 >= 0 && x1 <= 1 && y1 <= 1 && x1 > x0 && y1 > y0]).toEqual([id, true]);
        expect([id, typeof r.why === 'string' && r.why.length > 8]).toEqual([id, true]);
      }
    }
  });

  test('the blur filter keeps the chroma radius under half the box (ffmpeg refuses more)', async () => {
    const { blurFilter } = await import('../tools/play/views-build.mjs');
    expect(blurFilter([], 720, 960)).toBe(null);
    const f = blurFilter([[0.72, 0.52, 0.76, 0.57], [0.1, 0.1, 0.2, 0.2]], 720, 960);
    expect(f.out).toBe('[o1]');
    for (const m of f.graph.matchAll(/crop=(\d+):(\d+):\d+:\d+,boxblur=(\d+):3:(\d+):3/g)) {
      const [w, h, r, cr] = m.slice(1).map(Number);
      expect(r).toBeLessThan(Math.min(w, h) / 2);
      expect(cr).toBeLessThan(Math.min(w, h) / 4);
    }
  });

  test('no real view is a single shop front: V03 is the street, not a business', () => {
    expect(real.find((v) => v.id === 'V03').survey).toBe('IMG_0831');
  });
});
