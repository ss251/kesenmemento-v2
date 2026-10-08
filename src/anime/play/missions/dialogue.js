// [play:missions] What an NPC says, and the typewriter. Pure. 40 characters a second; a tap skips the line.

import { offeredQuest } from './logic.js';

/**
 * The pages to show for this person right now.
 * A delivery or a turn-in comes before their own offer, so a quest can be finished
 * at someone who also has a quest of their own.
 * At most two choices.
 */
export function scriptFor(npc, quests, state, t) {
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const p = state.progress[q.id];
    if (!p || p.done) continue;
    const step = q.steps[p.step];
    if (!step) continue;
    if (step.type === 'deliver' && step.to === npc.id && state.holding[step.item]) {
      return { npc: npc.id, act: 'deliver', quest: q.id, pages: [{ text: t(step.line || q.active) }] };
    }
    if (step.type === 'talk' && step.npc === npc.id) {
      return { npc: npc.id, act: 'advance', quest: q.id, pages: [{ text: t(step.line || q.active) }] };
    }
  }
  const q = offeredQuest(quests, state, npc.id);
  const prog = q && state.progress[q.id];
  if (q && prog && !prog.done && q.giver === npc.id) {
    return { npc: npc.id, act: 'remind', quest: q.id, pages: [{ text: t(q.active) }] };
  }
  if (q && !prog) {
    const choices = [
      { id: 'yes', label: t(q.yes || 'play.quest.yes'), act: 'accept', quest: q.id },
      { id: 'no', label: t(q.no || 'play.quest.no'), act: 'close' },
    ];
    return { npc: npc.id, act: 'offer', quest: q.id, pages: [{ text: t(q.offer), choices }] };
  }
  const done = doneFrom(quests, state, npc.id);
  // The closing line once. Later talks rotate the ordinary lines, which is what 「…」 is for.
  if (done && !(state.ambient[npc.id] > 0)) {
    return { npc: npc.id, act: 'done', quest: done.id, pages: [{ text: t(done.done) }] };
  }
  const lines = npc.lines || [];
  if (!lines.length) return { npc: npc.id, act: 'ambient', pages: [{ text: '' }] };
  const i = (state.ambient[npc.id] || 0) % lines.length;
  return { npc: npc.id, act: 'ambient', pages: [{ text: t(lines[i]), ambient: npc.id }] };
}

function doneFrom(quests, state, npcId) {
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    if (q.giver === npcId && state.progress[q.id]?.done) return q;
  }
  return null;
}

/** Remember that an ambient line was heard, so the next talk moves on. */
export function heardAmbient(state, npcId) {
  if (!npcId) return;
  state.ambient[npcId] = (state.ambient[npcId] || 0) + 1;
}

export function openLine(text, now, { instant = false, cps = 40 } = {}) {
  const s = text || '';
  return {
    text: s,
    t0: now,
    cps,
    shown: instant ? s.length : 0,
    done: instant || s.length === 0,
    instant,
    blipped: instant ? s.length : 0,
  };
}

/** Advance the typewriter to `now`. Mutates the line. */
export function stepLine(line, now) {
  if (!line || line.done) return line;
  const n = line.text.length;
  const shown = line.instant ? n : Math.min(n, Math.max(0, Math.floor((now - line.t0) * line.cps)));
  line.shown = shown;
  line.done = shown >= n;
  return line;
}

export function skipLine(line) {
  if (!line) return line;
  line.shown = line.text.length;
  line.done = true;
  return line;
}

export function visible(line) {
  if (!line) return '';
  return line.text.slice(0, line.shown);
}

/** Semitones for the marimba, one voice per person. The kid is high, the elder low. */
export const VOICE = {
  kid: 8,
  barista: 5,
  auctioneer: 4,
  gull: 3,
  visitor: 2,
  ferry: 1,
  guide: 1,
  farmer: -1,
  stop: -1,
  fisher: -2,
  captain: -3,
  hiker: -2,
  diver: -3,
  driver: -4,
  shrine: -5,
};

export function voicePitch(id) {
  return VOICE[id] ?? 0;
}

/** A voice blip for this newly shown character, or null for silence (space, punctuation, a skipped run). */
export function blipFor(line, prevShown, base = 0) {
  if (!line) return null;
  const from = prevShown == null ? line.blipped : prevShown;
  if (line.shown <= from) return null;
  if (line.shown - from > 2) return { pitch: 0, once: true };
  const ch = line.text[line.shown - 1];
  if (!ch || ' \n\t、。「」！？…・ー,.!?'.includes(ch)) return null;
  const wobble = (ch.charCodeAt(0) % 3) - 1;
  return { pitch: (base || 0) + wobble, once: false };
}
