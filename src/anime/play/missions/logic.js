// [play:missions] Quest rules. Pure: no DOM, no three.js. The frame calls these with a reused world object.
// Step types: talk, reach, collect, medal, ippon, photo, deliver, gull, swim, race.
// Events that do not exist yet are still named here; docs/play/MISSIONS.md lists them for the other lanes.

import COURSES from '../../../../data/play/courses.json';

export const TALK_R = 4.5;
export const CPS = 40;
/** A quest mark stays fully visible out to here, then fades, and is gone at BALLOON_FAR. */
export const BALLOON_NEAR = 60;
export const BALLOON_FAR = 108;
/** Screen floor and cap for a 「！」 / 「？」 balloon. 「…」 does not use these. */
export const BALLOON_FLOOR_PX = 22;
export const BALLOON_CAP_PX = 64;
/** World height of the balloon, in metres. At 60 m the projection falls under the floor, so the floor holds. */
export const MARK_WORLD_M = 1.05;
/** Ground ring diameter, in metres, under a person who still has a quest mark. */
export const RING_WORLD_M = 1.7;
/** Dialogue body. The box grows with the type; it is not squeezed to keep the old height. */
export const DIALOGUE_PHONE_PX = 22;
export const DIALOGUE_DESK_PX = 24;
/** A reach step farther than this offers 飛んで行く. */
export const FLY_AWAY = 300;

/** Course and night-race starts, so a medal or a race still has an arrow. */
export const COURSE_START = {
  'race-minato': { x: 105.2, y: 2.4, z: 105.7 },
};
for (const course of COURSES.courses) {
  if (course?.start) COURSE_START[course.id] = { x: course.start.x, y: course.start.y, z: course.start.z };
}

const MODE_KEY = {
  walk: 'play.quest.mode.walk',
  fly: 'play.quest.mode.fly',
  drive: 'play.quest.mode.drive',
  sail: 'play.quest.mode.sail',
  swim: 'play.quest.mode.swim',
};

const MEDAL = { bronze: 1, silver: 2, gold: 3 };

/** True when `have` is at least `min` (bronze < silver < gold). Missing is not enough. */
export function medalAtLeast(have, min = 'bronze') {
  return (MEDAL[have] || 0) >= (MEDAL[min] || 1);
}

/** How many 金のカツオ the kit has recorded. `found` is a map of id → time, or a list. */
export function katsuoCount(section) {
  const found = section?.found;
  if (!found) return 0;
  if (Array.isArray(found)) return found.length;
  let n = 0;
  for (const k in found) if (found[k]) n++;
  return n;
}

export function emptyProgress() {
  return {
    v: 1,
    active: null,
    progress: {},
    holding: {},
    delivered: {},
    ambient: {},
    ippon: { kg: 0, count: 0, maxCm: 0 },
    perch: null,
    swim: null,
    diving: false,
    photos: [],
    raceMs: null,
    races: {},
    rewards: {},
    pending: [],
    introduced: false,
    coach: {},
  };
}

/** A saved blob back into a progress object. Unknown or broken input becomes an empty log. */
export function hydrate(saved) {
  const s = emptyProgress();
  if (!saved || typeof saved !== 'object') return s;
  if (typeof saved.active === 'string') s.active = saved.active;
  if (saved.progress && typeof saved.progress === 'object') s.progress = saved.progress;
  if (saved.holding && typeof saved.holding === 'object') s.holding = saved.holding;
  if (saved.delivered && typeof saved.delivered === 'object') s.delivered = saved.delivered;
  if (saved.ambient && typeof saved.ambient === 'object') s.ambient = saved.ambient;
  if (saved.ippon && typeof saved.ippon === 'object') {
    s.ippon = { kg: +saved.ippon.kg || 0, count: +saved.ippon.count || 0, maxCm: +saved.ippon.maxCm || 0 };
  }
  if (saved.perch && typeof saved.perch === 'object') s.perch = saved.perch;
  if (saved.swim && typeof saved.swim === 'object') s.swim = saved.swim;
  if (Array.isArray(saved.photos)) s.photos = saved.photos.slice(-24);
  if (Number.isFinite(saved.raceMs)) s.raceMs = saved.raceMs;
  if (saved.races && typeof saved.races === 'object') {
    for (const k in saved.races) if (Number.isFinite(+saved.races[k])) s.races[k] = +saved.races[k];
  }
  if (saved.rewards && typeof saved.rewards === 'object') s.rewards = saved.rewards;
  if (saved.introduced) s.introduced = true;
  if (saved.coach && typeof saved.coach === 'object') s.coach = saved.coach;
  return s;
}

/** What we keep on the device. `pending` is only for the card that is about to open. */
export function serialize(state) {
  return {
    v: 1,
    active: state.active,
    progress: state.progress,
    holding: state.holding,
    delivered: state.delivered,
    ambient: state.ambient,
    ippon: state.ippon,
    perch: state.perch,
    swim: state.swim,
    photos: state.photos.slice(-24),
    raceMs: state.raceMs,
    races: state.races,
    rewards: state.rewards,
    introduced: !!state.introduced,
    coach: state.coach || {},
  };
}

export function questById(quests, id) {
  for (let i = 0; i < quests.length; i++) if (quests[i].id === id) return quests[i];
  return null;
}

/** Active, then ones you can still hear, then finished. One giver, one open quest. */
export function questLog(quests, state) {
  const active = [], available = [], done = [];
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const p = state.progress[q.id];
    if (p?.done) done.push(q);
    else if (p) active.push(q);
    else if (offeredQuest(quests, state, q.giver)?.id === q.id) available.push(q);
  }
  return { active, available, done };
}

/** Finish a quest from the shot tools. The card still has to be shown by the caller. */
export function forceComplete(state, quest, now) {
  if (!quest) return false;
  if (!state.progress[quest.id]) acceptQuest(state, quest, now);
  const p = state.progress[quest.id];
  if (!p || p.done) return false;
  p.step = quest.steps.length;
  p.done = now;
  if (state.active === quest.id) state.active = null;
  state.pending.push(quest.id);
  return true;
}

/** The quest this person can still give, or the one they already gave that is not finished. */
export function offeredQuest(quests, state, npcId) {
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    if (q.giver !== npcId) continue;
    if (state.progress[q.id]?.done) continue;
    if (q.requires && !state.progress[q.requires]?.done) continue;
    return q;
  }
  return null;
}

/** A talk or a delivery this person can take right now, or null. */
export function turnInFor(npc, quests, state) {
  if (!npc) return null;
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const p = state.progress[q.id];
    if (!p || p.done) continue;
    const step = q.steps[p.step];
    if (!step) continue;
    if (step.type === 'talk' && step.npc === npc.id) return q.id;
    if (step.type === 'deliver' && step.to === npc.id && state.holding[step.item]) return q.id;
  }
  return null;
}

/**
 * 「！」 a quest you have not taken, 「？」 a turn-in, 「…」 a line.
 * An open quest that is not ready to hand in is 「…」: the tracker already names the step.
 * A talk step with mark "quest" (the skipper) stays 「！」 so it can be found.
 */
export function markerFor(npc, quests, state) {
  const turn = turnInFor(npc, quests, state);
  if (turn) {
    const q = questById(quests, turn);
    const step = q && state.progress[turn] ? q.steps[state.progress[turn].step] : null;
    if (step && step.mark === 'quest') return 'quest';
    return 'turnin';
  }
  const q = offeredQuest(quests, state, npc.id);
  if (q && !state.progress[q.id]) return 'quest';
  if (npc.lines && npc.lines.length) return 'talk';
  return null;
}

/** 「！」 and 「？」 are the balloon. 「…」 stays a small glyph and fades sooner. */
export function markIsBang(kind) {
  return kind === 'quest' || kind === 'turnin';
}

/**
 * 1 inside the near distance, easing to 0 at the far distance.
 * A chatter mark (`talk`) fades from 28 m and is gone at 48 m, so the street is not full of dots.
 */
export function balloonOpacity(dist, kind) {
  const near = kind === 'talk' ? 28 : BALLOON_NEAR;
  const far = kind === 'talk' ? 48 : BALLOON_FAR;
  if (!Number.isFinite(dist) || dist <= near) return 1;
  if (dist >= far) return 0;
  const t = (dist - near) / (far - near);
  return 1 - t * t;
}

/** CSS pixels a world length covers at `dist` metres, for this view height and vertical field of view. */
export function projectPx(worldM, dist, viewH, fovDeg) {
  const d = dist < 0.75 ? 0.75 : dist;
  const fov = fovDeg > 1 ? fovDeg : 55;
  const vh = viewH > 2 ? viewH : 900;
  const k = vh / (2 * Math.tan((fov * Math.PI / 180) * 0.5));
  return (worldM / d) * k;
}

/** Balloon diameter. Never under the floor, never over the cap. No allocation. */
export function balloonPx(dist, viewH, fovDeg) {
  const n = projectPx(MARK_WORLD_M, dist, viewH, fovDeg);
  if (n < BALLOON_FLOOR_PX) return BALLOON_FLOOR_PX;
  if (n > BALLOON_CAP_PX) return BALLOON_CAP_PX;
  return n;
}

/** Ground-ring width. The caller derives the ellipse height. No allocation. */
export function ringWidth(dist, viewH, fovDeg) {
  const n = projectPx(RING_WORLD_M, dist, viewH, fovDeg);
  if (n < 18) return 18;
  if (n > 140) return 140;
  return n;
}

export function balloonMark(kind) {
  if (kind === 'quest') return '！';
  if (kind === 'turnin') return '？';
  if (kind === 'talk') return '…';
  return '';
}

/** The step that just finished should hand the player to 一本釣り, or nothing. */
export function handoffOf(step) {
  return step && step.start === 'ippon' ? 'ippon' : null;
}

/** How many seals are earned. A reward row counts even if the progress flag was cleared. */
export function countStamps(quests, state) {
  let n = 0;
  if (!quests || !state) return 0;
  for (let i = 0; i < quests.length; i++) {
    const id = quests[i].id;
    if (state.progress[id]?.done || state.rewards?.[id]) n++;
  }
  return n;
}

/** Hub progress line. The total is the quest list, which is 14. */
export function stampLine(n, total, lang) {
  const a = n | 0;
  const b = total | 0;
  if (lang === 'en') return 'Stamps ' + a + '/' + b;
  return 'スタンプ ' + a + '/' + b;
}

/** True until the hub has started this mode, or any quest has been accepted. */
export function modeIsNew(state) {
  if (!state || state.introduced) return false;
  const p = state.progress;
  if (p) for (const k in p) return false;
  return true;
}

/** Nearest person with a 「！」 or 「？」. 「…」 is not a destination. */
export function nearestBang(npcs, quests, state, x, z) {
  let best = null;
  let bestD = Infinity;
  if (!npcs) return null;
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i];
    const kind = markerFor(n, quests, state);
    if (!markIsBang(kind)) continue;
    const dx = n.x - x, dz = n.z - z, d = dx * dx + dz * dz;
    if (d < bestD) { best = n; bestD = d; }
  }
  return best;
}

/**
 * The あそぶ card. `start` is the lane's function. The hub lists whatever is registered.
 * Art is a real two-shot, served with the rest of data/.
 */
export function questMode(opt) {
  const o = opt || {};
  return {
    id: 'quests',
    order: 60,
    title: { ja: 'クエスト', en: 'Quests' },
    hook: { ja: '町の人に、話しかけよう', en: 'Talk to someone in town' },
    minutes: 5,
    stars: 1,
    players: 1,
    art: o.art || '/data/play/art/quests.webp',
    progress: o.progress,
    isNew: o.isNew,
    start: o.start,
  };
}

/** Degrees to turn an up-arrow toward the target. 0 is straight ahead. */
export function bearingDeg(fx, fz, dx, dz) {
  return Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz) * 180 / Math.PI;
}

/** The first character of a title, the same glyph the reward card stamps. */
export function stampGlyph(title) {
  const s = String(title || '');
  const ch = s[Symbol.iterator]().next().value;
  return ch || '印';
}

/** One row per quest. `fresh` is a set-like object of ids that should stamp in. */
export function stampRows(quests, state, titleOf, fresh) {
  const rows = [];
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const got = !!(state.progress[q.id]?.done || state.rewards[q.id]);
    const title = titleOf ? titleOf(q) : (q.title || '');
    rows.push({
      id: q.id,
      title,
      glyph: stampGlyph(title),
      got,
      fresh: !!(got && fresh && fresh[q.id]),
    });
  }
  return rows;
}

/** Nearest npc within r metres (horizontal), or null. No allocations. */
export function nearest(npcs, x, z, r) {
  const r2 = r * r;
  let best = null, bestD = r2;
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i];
    const dx = n.x - x, dz = n.z - z, d = dx * dx + dz * dz;
    if (d <= bestD) { best = n; bestD = d; }
  }
  return best;
}

/** Absolute difference of two angles, in radians, in 0..π. */
export function angleDelta(a, b) {
  let d = a - b;
  d -= Math.PI * 2 * Math.floor((d + Math.PI) / (Math.PI * 2));
  return d < 0 ? -d : d;
}

function findNpc(npcs, id) {
  if (!npcs) return null;
  for (let i = 0; i < npcs.length; i++) if (npcs[i].id === id) return npcs[i];
  return null;
}

/** Has this step already happened in the world? talk and deliver wait for the player. */
export function stepMet(step, world) {
  if (!step || !world) return false;
  switch (step.type) {
    case 'reach': {
      const dx = world.pos.x - step.x, dz = world.pos.z - step.z;
      return dx * dx + dz * dz <= step.r * step.r;
    }
    case 'collect':
      return (world.katsuo || 0) >= step.n;
    case 'medal':
      return medalAtLeast(world.courses?.[step.course]?.medal, step.min || 'bronze');
    case 'ippon': {
      const ip = world.ippon || {};
      if (step.kg != null && !(ip.kg >= step.kg)) return false;
      if (step.count != null && !(ip.count >= step.count)) return false;
      if (step.cm != null && !(ip.maxCm >= step.cm)) return false;
      return step.kg != null || step.count != null || step.cm != null;
    }
    case 'photo': {
      const list = world.photos;
      if (!list) return false;
      const r2 = step.r * step.r;
      for (let i = 0; i < list.length; i++) {
        const ph = list[i];
        const dx = ph.x - step.x, dz = ph.z - step.z;
        if (dx * dx + dz * dz > r2) continue;
        if (step.yaw == null || angleDelta(ph.yaw, step.yaw) <= (step.yawTol ?? 0.7)) return true;
      }
      return false;
    }
    case 'gull': {
      const p = world.perch;
      if (!p || p.perched === false) return false;
      if (step.perch && p.id === step.perch) return true;
      if (step.x == null) return false;
      const dx = p.x - step.x, dz = p.z - step.z;
      return dx * dx + dz * dz <= step.r * step.r;
    }
    case 'swim': {
      if (!world.diving) return false;
      const s = world.swim;
      if (!s) return false;
      const dx = s.x - step.x, dz = s.z - step.z;
      return dx * dx + dz * dz <= step.r * step.r;
    }
    case 'race': {
      const ms = step.course ? world.races?.[step.course] : world.raceMs;
      return ms != null && ms <= step.ms;
    }
    default:
      return false;
  }
}

function finish(state, quest, now) {
  const p = state.progress[quest.id];
  if (!p || p.done) return;
  p.done = now;
  if (state.active === quest.id) state.active = null;
  state.pending.push(quest.id);
}

/** Start (or re-track) a quest. Nothing already finished can be failed or lost. */
export function acceptQuest(state, quest, now) {
  if (!quest || state.progress[quest.id]?.done) return false;
  if (!state.progress[quest.id]) state.progress[quest.id] = { step: 0, started: now, done: null };
  state.active = quest.id;
  if (quest.grant && !state.holding[quest.grant] && !state.delivered[quest.grant]) state.holding[quest.grant] = quest.giver;
  return true;
}

/**
 * A fish from the 一本釣り lane.
 * `catch` adds one fish { kg, cm }. `landed` is the trip total { kg, count, cm } and never goes backwards.
 */
export function noteIppon(state, ev) {
  if (!ev) return;
  const ip = state.ippon;
  if (ev.kind === 'landed') {
    if ((+ev.kg || 0) > ip.kg) ip.kg = +ev.kg;
    if ((+ev.count || 0) > ip.count) ip.count = +ev.count;
  } else {
    ip.count += ev.count == null ? 1 : +ev.count;
    ip.kg += +ev.kg || 0;
  }
  const cm = ev.cm ?? ev.biggest;
  if ((+cm || 0) > ip.maxCm) ip.maxCm = +cm;
}

/** The night race stores its best on courses['race-minato']. A drive course's medal stays on its own id. */
export function absorbCourses(state, courses) {
  const race = courses && courses['race-minato'];
  if (race && Number.isFinite(+race.best)) noteRace(state, +race.best, 'race-minato');
}

export function notePhoto(state, photo) {
  if (!photo) return;
  state.photos.push(photo);
  if (state.photos.length > 24) state.photos.splice(0, state.photos.length - 24);
}

export function notePerch(state, perch) {
  if (!perch) return;
  state.perch = {
    x: +perch.x || 0, y: +perch.y || 0, z: +perch.z || 0,
    id: perch.id || null,
    perched: perch.perched !== false,
  };
}

export function noteSwim(state, swim) {
  if (!swim) return;
  state.swim = { x: +swim.x || 0, y: +swim.y || 0, z: +swim.z || 0 };
  if (swim.diving != null) state.diving = !!swim.diving;
}

/** `courseId` binds the time to that race. Without one, only an unnamed race step can read it. */
export function noteRace(state, ms, courseId) {
  if (!Number.isFinite(ms)) return;
  if (courseId) {
    if (!state.races) state.races = {};
    const prev = state.races[courseId];
    if (prev == null || ms < prev) state.races[courseId] = ms;
    return;
  }
  if (state.raceMs == null || ms < state.raceMs) state.raceMs = ms;
}

/** Move every started quest forward through the steps the world already satisfies. */
export function advance(state, quests, world) {
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const p = state.progress[q.id];
    if (!p || p.done) continue;
    while (p.step < q.steps.length) {
      const step = q.steps[p.step];
      if (step.type === 'talk' || step.type === 'deliver') break;
      if (!stepMet(step, world)) break;
      p.step++;
    }
    if (p.step >= q.steps.length) finish(state, q, world.now);
  }
  return state.pending.length ? state.pending[state.pending.length - 1] : null;
}

/**
 * The player talked to `npcId`. Completes a current talk step, or hands over a delivery.
 * Returns the quest id that moved, or null.
 */
export function onTalk(state, quests, npcId, now) {
  let acted = null;
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const p = state.progress[q.id];
    if (!p || p.done) continue;
    const step = q.steps[p.step];
    if (!step) continue;
    if (step.type === 'talk' && step.npc === npcId) {
      p.step++;
      if (p.step >= q.steps.length) finish(state, q, now);
      acted = q.id;
    } else if (step.type === 'deliver' && step.to === npcId && state.holding[step.item]) {
      state.delivered[step.item] = npcId;
      delete state.holding[step.item];
      p.step++;
      if (p.step >= q.steps.length) finish(state, q, now);
      acted = q.id;
    }
  }
  return acted;
}

/** Quests that are started and not finished, in quest-list order. */
export function activeIds(state, quests) {
  const ids = [];
  if (!state || !quests) return ids;
  for (let i = 0; i < quests.length; i++) {
    const p = state.progress[quests[i].id];
    if (p && !p.done) ids.push(quests[i].id);
  }
  return ids;
}

/** Move the tracked quest among the ones still open. `dir` is 1 or -1. */
export function cycleActive(state, quests, dir) {
  const ids = activeIds(state, quests);
  if (!ids.length) return state.active || null;
  let i = ids.indexOf(state.active);
  if (i < 0) i = 0;
  const n = ids.length;
  const step = dir < 0 ? n - 1 : 1;
  state.active = ids[(i + step) % n];
  return state.active;
}

function nearestCharm(step, places) {
  const list = places?.charms;
  if (!list || !list.length) return null;
  const found = places.found || {};
  const pos = places.pos;
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c || found[c.id]) continue;
    const d = pos ? Math.hypot(c.x - pos.x, c.z - pos.z) : 0;
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best) return null;
  return { x: best.x, y: best.y == null ? 1.6 : best.y, z: best.z, mode: best.mode || null };
}

/** Where the tracker arrow points. A medal, a race, a boat and a charm still have a place. */
export function stepTarget(step, npcs, places) {
  if (!step) return null;
  if (step.type === 'talk' || step.type === 'deliver') {
    const n = findNpc(npcs, step.type === 'talk' ? step.npc : step.to);
    return n ? { x: n.x, y: (n.y || 0) + 1.7, z: n.z } : null;
  }
  if (step.type === 'collect') return nearestCharm(step, places);
  if (step.type === 'medal' || step.type === 'race') {
    const st = COURSE_START[step.course];
    return st ? { x: st.x, y: st.y == null ? 1.6 : st.y, z: st.z } : null;
  }
  if (step.type === 'ippon') {
    const n = findNpc(npcs, 'captain');
    return n ? { x: n.x, y: (n.y || 0) + 1.7, z: n.z } : null;
  }
  if (step.x == null || step.z == null) return null;
  return { x: step.x, y: step.y == null ? 1.6 : step.y, z: step.z };
}

/**
 * The one travel button for this step, or null.
 * Photo only while you are inside its radius. A long walk offers the flight.
 */
export function trackerAction(step, world) {
  if (!step) return null;
  const pos = world?.pos;
  const dist = (x, z) => (pos ? Math.hypot((x || 0) - pos.x, (z || 0) - pos.z) : Infinity);
  if (step.type === 'photo' && step.x != null && dist(step.x, step.z) <= (step.r || 0)) {
    return { id: 'photo', key: 'play.quest.go.photo' };
  }
  if (step.type === 'swim') return { id: 'dive', key: 'play.quest.go.dive' };
  if (step.type === 'gull') return { id: 'gull', key: 'play.quest.go.gull' };
  if (step.type === 'ippon') return { id: 'boat', key: 'play.quest.go.boat' };
  if (step.type === 'race') return { id: 'race', key: 'play.quest.go.race' };
  if (step.type === 'reach' && step.x != null && dist(step.x, step.z) > FLY_AWAY) {
    return { id: 'fly', key: 'play.quest.go.fly' };
  }
  return null;
}

/** 「漁師！」 or 「案内人？」 on the full map. Other people stay a dot. */
export function mapLabel(npc, quests, state, name) {
  const kind = markerFor(npc, quests, state);
  if (kind !== 'quest' && kind !== 'turnin') return null;
  return (name || '') + (kind === 'turnin' ? '？' : '！');
}

/** The chip for the tracked quest. `places.charms` and `places.found` aim a collect step. */
export function tracker(state, quests, npcs, world, places) {
  const id = state.active;
  if (!id) return null;
  const q = questById(quests, id);
  const p = state.progress[id];
  if (!q || !p || p.done) return null;
  const step = q.steps[p.step] || null;
  const bag = places ? { charms: places.charms, found: places.found, pos: world?.pos } : null;
  const target = stepTarget(step, npcs, bag);
  let dist = null;
  if (target && world?.pos) dist = Math.hypot(target.x - world.pos.x, target.z - world.pos.z);
  const action = trackerAction(step, world);
  const modeKey = step?.type === 'collect' && target?.mode ? (MODE_KEY[target.mode] || null) : null;
  return { quest: q, step, index: p.step, target, dist, action, modeKey };
}

/** Fill a reused world object. The caller owns `world` and `world.pos`. */
export function fillWorld(world, state, pos, katsuo, courses, now) {
  world.pos.x = pos.x; world.pos.y = pos.y; world.pos.z = pos.z;
  world.katsuo = katsuo;
  world.courses = courses || {};
  world.ippon = state.ippon;
  world.photos = state.photos;
  world.perch = state.perch;
  world.swim = state.swim;
  world.diving = !!state.diving;
  world.raceMs = state.raceMs;
  world.races = state.races || {};
  world.now = now;
  return world;
}
