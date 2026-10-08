// [play] ホヤぼーや in 3D stays behind a written record.
// Absent file, or a record that does not allow 3d and animation, locks the slot.
// kind 'written' needs a ref (the city's 承認書). kind 'owner-interim' is the
// owner's 2026-10-07 decision to show him until demo day; it is not a 様式第2号.

let warned = false;

export function hoyaPermitted(record) {
  if (!record || typeof record !== 'object') return { ok: false, why: 'absent' };
  const allows = record.allows;
  const has = Array.isArray(allows) && allows.includes('3d') && allows.includes('animation');
  if (!has) return { ok: false, why: 'scope' };
  if (record.kind === 'written' && record.ref) return { ok: true, why: 'written' };
  if (record.kind === 'owner-interim' && record.decidedAt) return { ok: true, why: 'owner-interim' };
  return { ok: false, why: 'kind' };
}

/** What is actually on screen. `url` is the ?hoya3d= value ('0' | '1' | null). */
export function resolveModel(o = {}) {
  const gate = hoyaPermitted(o.record);
  if (o.url === '0') return { model: 'original', gate, why: 'url' };
  if (!gate.ok) return { model: 'original', gate, why: gate.why };
  if (!o.mesh) return { model: 'original', gate, why: 'no-mesh' };
  if (o.url === '1') return { model: 'hoya', gate, why: 'url' };
  if (o.pref === 'original') return { model: 'original', gate, why: 'pref' };
  return { model: 'hoya', gate, why: 'on' };
}

/** setModel('hoya') refuses, and logs once, unless the record allows it and the mesh exists. */
export function setModel(want, o = {}) {
  if (want !== 'hoya') return { ok: true, model: 'original', why: 'original' };
  const gate = hoyaPermitted(o.record);
  if (!gate.ok) {
    if (!warned) { warned = true; console.warn('[avatar] ホヤぼーやはロックです (' + gate.why + ')'); }
    return { ok: false, model: 'original', why: gate.why };
  }
  if (!o.mesh) {
    if (!warned) { warned = true; console.warn('[avatar] ホヤぼーやの3Dモデルがまだありません'); }
    return { ok: false, model: 'original', why: 'no-mesh' };
  }
  return { ok: true, model: 'hoya', why: gate.why };
}

export function _resetApprovalWarn() { warned = false; }
