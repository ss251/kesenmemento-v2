// [play:courses] The あそぶ cards: one per course, progress, the ring coach, the quit action.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import COURSES from '../data/play/courses.json';
import STR from '../data/play-i18n.json';
import {
  artPath, progressOf, isNewCourse, coachRequest, ndcToCss, quitActions,
  courseModeList, registerCourseModes, COURSE_META,
} from '../src/anime/play/courses/hub.js';

const courses = COURSES.courses;

describe('hub cards', () => {
  const rows = {
    anba: { best: 42120, medal: 'gold', runs: 2 },
    minato: null,
    harbour: { best: 160000, medal: null, runs: 1 },
  };
  const started = [];
  const modes = courseModeList(courses, {
    rows: (id) => rows[id],
    strings: STR,
    start: (id) => { started.push(id); },
  });

  test('one card per course, in air, road, sea order', () => {
    expect(modes.map((m) => m.id)).toEqual(['course-anba', 'course-minato', 'course-harbour']);
    expect(modes.map((m) => m.order)).toEqual([50, 51, 52]);
    expect(modes.map((m) => m.players)).toEqual([1, 1, 1]);
    expect(modes.map((m) => m.minutes)).toEqual([1, 3, 3]);
    expect(modes.map((m) => m.stars)).toEqual([2, 1, 2]);
  });

  test('titles and hooks are filled in both languages', () => {
    for (const m of modes) {
      expect(m.title.ja.length).toBeGreaterThan(0);
      expect(m.title.en.length).toBeGreaterThan(0);
      expect(m.hook.ja.length).toBeGreaterThan(0);
      expect(m.hook.en.length).toBeGreaterThan(0);
      expect(m.hook.ja).not.toMatch(/  /);
    }
    expect(modes[0].title.ja).toBe('安波山ひとっとび');
    expect(modes[0].hook.ja).toBe('リングをくぐって安波山へ');
  });

  test('progress is the medal and the best time, and empty until a finish', () => {
    expect(modes[0].progress()).toEqual({ ja: '金 0:42.12', en: 'Gold 0:42.12' });
    expect(modes[1].progress()).toBeNull();
    expect(modes[2].progress()).toEqual({ ja: 'ベスト 2:40.00', en: 'Best 2:40.00' });
    expect(progressOf(null)).toBeNull();
    expect(progressOf({ best: null, runs: 1 })).toBeNull();
  });

  test('NEW until the course has been run once', () => {
    expect(modes[0].isNew()).toBe(false);
    expect(modes[1].isNew()).toBe(true);
    expect(isNewCourse({ runs: 0 })).toBe(true);
    expect(isNewCourse({ runs: 1 })).toBe(false);
  });

  test('はじめる starts that course', async () => {
    await modes[2].start();
    expect(started).toEqual(['harbour']);
  });

  test('the stills are 16:10 webp, each under 40 KB', () => {
    expect(modes.map((m) => m.art)).toEqual([
      '/data/play/art/course-anba.webp',
      '/data/play/art/course-minato.webp',
      '/data/play/art/course-harbour.webp',
    ]);
    const root = join(import.meta.dir, '..');
    for (const id of ['anba', 'minato', 'harbour']) {
      const buf = readFileSync(join(root, 'data/play/art/course-' + id + '.webp'));
      expect(buf.length).toBeLessThanOrEqual(40 * 1024);
      expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
      const mark = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
      expect(mark).toBeGreaterThan(0);
      const w = buf.readUInt16LE(mark + 3) & 0x3fff;
      const h = buf.readUInt16LE(mark + 5) & 0x3fff;
      expect(w).toBe(800);
      expect(h).toBe(500);
    }
    expect(artPath('anba')).toBe('/data/play/art/course-anba.webp');
  });

  test('registerMode is skipped until the kit has it, then each card is registered once', () => {
    expect(registerCourseModes({}, modes)).toBe(false);
    expect(registerCourseModes(null, modes)).toBe(false);
    const got = [];
    const kit = { registerMode(m) { got.push(m.id); } };
    expect(registerCourseModes(kit, modes)).toBe(true);
    expect(got).toEqual(['course-anba', 'course-minato', 'course-harbour']);
  });

  test('a throwing registerMode does not drop the later cards', () => {
    const got = [];
    const kit = {
      registerMode(m) {
        if (m.id === 'course-minato') throw new Error('no');
        got.push(m.id);
      },
    };
    expect(registerCourseModes(kit, modes)).toBe(true);
    expect(got).toEqual(['course-anba', 'course-harbour']);
  });
});

describe('the first-run coach', () => {
  test('the ring course points at the first ring, and the others do not', () => {
    const anba = coachRequest(courses[0]);
    expect(anba).toEqual({
      id: 'course-anba-ring',
      textKey: 'play.course.coach.ring',
      gesture: 'none',
      dim: true,
    });
    expect(STR.ja[anba.textKey]).toBe('リングを くぐろう');
    expect(STR.en[anba.textKey]).toBe('Fly through the ring');
    expect(coachRequest(courses[1])).toBeNull();
    expect(coachRequest(courses[2])).toBeNull();
    expect(coachRequest(null)).toBeNull();
  });

  test('a world point in the middle of the picture stays in the middle', () => {
    const out = { x: 0, y: 0 };
    ndcToCss(0, 0, 393, 852, out);
    expect(out).toEqual({ x: 196.5, y: 426 });
    ndcToCss(0, 1, 393, 852, out);
    expect(out.y).toBe(0);
    ndcToCss(1, -1, 1440, 900, out);
    expect(out).toEqual({ x: 1440, y: 900 });
  });
});

describe('やめる', () => {
  test('the action is a back arrow on Esc', () => {
    let n = 0;
    const a = quitActions(() => { n += 1; });
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe('quit');
    expect(a[0].icon).toBe('back');
    expect(a[0].key).toBe('Escape');
    expect(a[0].label).toBe('やめる');
    expect(quitActions(() => {}, 'Quit')[0].label).toBe('Quit');
    a[0].onPress();
    expect(n).toBe(1);
  });

  test('the fallback button is a 56 px circle with a 2 px arrow', () => {
    const src = readFileSync(join(import.meta.dir, '../src/anime/play/courses/hud.js'), 'utf8');
    expect(src).toContain('width: 56px; height: 56px;');
    expect(src).toContain('stroke-width="2"');
    expect(src).not.toContain('word-break: keep-all');
    expect(COURSE_META.anba.order).toBe(50);
  });
});
