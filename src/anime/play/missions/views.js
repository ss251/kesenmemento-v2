// [play:views] The twelve けしき. Real frames are the team's survey photos. Game frames are the app's own renderer.
// The match itself lives in logic.js so a test can call it without this file.

import VIEWS from '../../../../data/play/views.json';
import LINE from '../../../../data/play/line.json';
import { enuToLatLon } from '../../core/pose.js';

export const VIEWS_LIST = VIEWS.views;

export function viewById(id) {
  for (let i = 0; i < VIEWS_LIST.length; i++) if (VIEWS_LIST[i].id === id) return VIEWS_LIST[i];
  return null;
}

export function lineBasicId() {
  const id = LINE && typeof LINE.basicId === 'string' ? LINE.basicId.trim() : '';
  return id;
}

/** The LINE app link with 「けしき V07」 filled in, or '' when the bot has no id yet. */
export function lineViewUrl(viewId, basicId = lineBasicId()) {
  if (!basicId || !/^V\d{2}$/.test(viewId || '')) return '';
  return 'https://line.me/R/oaMessage/' + encodeURIComponent(basicId) + '/?' + encodeURIComponent('けしき ' + viewId);
}

/** `2026年10月1日` or `2026-10-01`. Half-width digits. Empty when the frame has no date. */
export function formatTaken(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const y = m[1];
  const mo = String(Number(m[2]));
  const d = String(Number(m[3]));
  if (lang === 'en') return `${y}-${m[2]}-${m[3]}`;
  return `${y}年${mo}月${d}日`;
}

const KINDS = new Set(['real', 'game']);

/** Problems with one view record. Empty means it can ship. */
export function viewProblems(v) {
  const bad = [];
  if (!v || typeof v !== 'object') return ['view'];
  if (!/^V\d{2}$/.test(v.id || '')) bad.push('id');
  if (!KINDS.has(v.kind)) bad.push('kind');
  if (typeof v.image !== 'string' || !/^\/data\/play\/views\/V\d{2}\.webp$/.test(v.image)) bad.push('image');
  const p = v.pose;
  if (!p || !['x', 'y', 'z', 'yaw', 'pitch', 'fov'].every((k) => Number.isFinite(+p[k]))) bad.push('pose');
  else if (!(p.fov > 10 && p.fov < 140)) bad.push('fov');
  if (!Array.isArray(v.latlon) || v.latlon.length !== 2 || !v.latlon.every((n) => Number.isFinite(+n))) bad.push('latlon');
  else if (p && Number.isFinite(+p.x)) {
    const ll = enuToLatLon(p.x, p.z);
    if (Math.abs(ll.lat - v.latlon[0]) > 1e-5 || Math.abs(ll.lon - v.latlon[1]) > 1e-5) bad.push('latlon');
  }
  for (const side of ['ja', 'en']) {
    if (!v.area || typeof v.area[side] !== 'string' || !v.area[side]) bad.push('area.' + side);
    if (!v.hint || typeof v.hint[side] !== 'string' || !v.hint[side]) bad.push('hint.' + side);
  }
  if (v.radius_m !== 12) bad.push('radius_m');
  if (v.angle_deg !== 20) bad.push('angle_deg');
  if (v.credit !== 'KesenMemento team') bad.push('credit');
  if (v.faces !== 0) bad.push('faces');
  return bad;
}

/** The whole catalogue: twelve views, six of each kind, every record clean, ids unique. */
export function catalogueProblems(list = VIEWS_LIST) {
  const bad = [];
  if (!Array.isArray(list) || list.length !== 12) bad.push('length');
  const ids = new Set();
  let real = 0;
  let game = 0;
  for (let i = 0; i < (list || []).length; i++) {
    const v = list[i];
    if (ids.has(v?.id)) bad.push('dup:' + v.id);
    ids.add(v?.id);
    if (v?.kind === 'real') real++;
    if (v?.kind === 'game') game++;
    const row = viewProblems(v);
    for (let k = 0; k < row.length; k++) bad.push((v?.id || i) + ':' + row[k]);
  }
  if (real !== 6) bad.push('real');
  if (game !== 6) bad.push('game');
  return bad;
}
