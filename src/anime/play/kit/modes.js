// [play] The mode list the あそぶ hub shows. A lane registers itself; a mode
// that never registers has no card. Additions to KIT-API.md.

const modes = new Map();
const listeners = new Set();

export function registerMode(spec) {
  if (!spec || typeof spec.id !== 'string' || !spec.id) return false;
  if (!spec.title) return false;
  modes.set(spec.id, spec);
  for (const fn of listeners) {
    try { fn(spec); } catch (e) { /* one listener stays off the list */ }
  }
  return true;
}

export function listModes() {
  return [...modes.values()].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.id).localeCompare(String(b.id)));
}

export function onModes(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function _resetModes() {
  modes.clear();
  listeners.clear();
}
