// [play:courses] The あそぶ cards. One card per course: はじめる lands on that
// start line and the countdown. A picker would be a second sheet the hub does
// not have. Orders sit at 50 so the car lane can keep 「ドライブ・レース」.
// The kit's registerMode is optional until feat/play-kit round 3 is merged.

import { formatTime } from './logic.js';

/** Gold is about 42 s, 3 min, 3 min. Stars: the lookout and the dock are the skill. */
export const COURSE_META = {
  anba: { minutes: 1, stars: 2, order: 50 },
  minato: { minutes: 3, stars: 1, order: 51 },
  harbour: { minutes: 3, stars: 2, order: 52 },
};

export function artPath(id) {
  return '/data/play/art/course-' + id + '.webp';
}

const MARK_JA = { gold: '金', silver: '銀', bronze: '銅' };
const MARK_EN = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

/** Medal and best time for the hub card. Null until there is a finish. */
export function progressOf(row) {
  if (!row || !Number.isFinite(row.best)) return null;
  const time = formatTime(row.best);
  const ja = (row.medal && MARK_JA[row.medal]) || 'ベスト';
  const en = (row.medal && MARK_EN[row.medal]) || 'Best';
  return { ja: ja + ' ' + time, en: en + ' ' + time };
}

/** NEW until the course has been finished or abandoned once. */
export function isNewCourse(row) {
  return !(row && row.runs > 0);
}

/**
 * The first run of a ring course. The kit marks `id` seen when done() runs.
 * Flags and buoys are not this coach: the line is for the ring.
 */
export function coachRequest(course) {
  const g = course && course.gates && course.gates[0];
  if (!g || g.kind !== 'ring') return null;
  return {
    id: 'course-' + course.id + '-ring',
    textKey: 'play.course.coach.ring',
    gesture: 'none',
    dim: true,
  };
}

/** NDC (y up) to CSS px. Writes `out` so a per-frame coach target allocates nothing. */
export function ndcToCss(x, y, w, h, out) {
  out.x = (x * 0.5 + 0.5) * w;
  out.y = (-y * 0.5 + 0.5) * h;
  return out;
}

/** The icon やめる. The kit's ui.actions paints `label` as text, so it is one string. */
export function quitActions(onPress, label = 'やめる') {
  return [{
    id: 'quit',
    icon: 'back',
    label: typeof label === 'string' && label ? label : 'やめる',
    key: 'Escape',
    onPress,
  }];
}

function line(strings, key) {
  return {
    ja: (strings.ja && strings.ja[key]) || '',
    en: (strings.en && strings.en[key]) || '',
  };
}

/** The registerMode payloads. `start(id)` puts the player on that start line; `prepare(id)` (optional) builds the course's
 *  rings and buoys behind the hub's title card (kit/lazy.js). */
export function courseModeList(courses, { rows, strings, start, prepare }) {
  const list = [];
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    const meta = COURSE_META[c.id] || { minutes: 3, stars: 1, order: 60 + i };
    list.push({
      id: 'course-' + c.id,
      order: meta.order,
      title: line(strings, 'play.course.' + c.id),
      hook: line(strings, 'play.course.hook.' + c.id),
      minutes: meta.minutes,
      stars: meta.stars,
      players: 1,
      art: artPath(c.id),
      progress: () => progressOf(rows(c.id)),
      isNew: () => isNewCourse(rows(c.id)),
      ...(typeof prepare === 'function' ? { prepare: () => prepare(c.id) } : {}),
      start: async () => { start(c.id); },
    });
  }
  return list;
}

/** Calls kit.registerMode when the hub exists. Returns false while it does not. */
export function registerCourseModes(kit, modes) {
  if (typeof kit?.registerMode !== 'function' || !modes) return false;
  for (let i = 0; i < modes.length; i++) {
    try { kit.registerMode(modes[i]); }
    catch (e) { console.error('[courses] registerMode', modes[i] && modes[i].id, e); }
  }
  return true;
}
