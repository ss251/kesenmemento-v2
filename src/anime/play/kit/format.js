// [play] The numbers the HUD speaks. Half-width digits, no full-width figures.
// A faster split uses U+2212 (「−1.2」), the way the design writes it.

/** 「12/50」 */
export function counterText(n, total) {
  const a = Math.max(0, Math.floor(Number(n) || 0));
  const b = Math.max(0, Math.floor(Number(total) || 0));
  return a + '/' + b;
}

/** `0:42.37` from milliseconds. Minutes are not padded; seconds and centiseconds are. */
export function timerText(ms) {
  const t = Math.max(0, Math.round(Number(ms) || 0));
  const m = Math.floor(t / 60000);
  const s = Math.floor(t / 1000) % 60;
  const cs = Math.floor(t / 10) % 100;
  return m + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
}

/**
 * Split against a best, in seconds to one decimal.
 * Faster is 「−1.2」, slower is 「+0.8」, a tie within 0.05 s is 「0.0」.
 * `bestMs` null means there is no best yet.
 */
export function splitText(ms, bestMs) {
  if (bestMs == null || !Number.isFinite(Number(bestMs))) return '';
  const d = (Number(ms) - Number(bestMs)) / 1000;
  if (!Number.isFinite(d)) return '';
  if (Math.abs(d) < 0.05) return '0.0';
  const body = Math.abs(d).toFixed(1);
  return (d < 0 ? '−' : '+') + body;
}

/** True when the split is faster than the best (浅葱). A tie is neither. */
export function splitFaster(ms, bestMs) {
  if (bestMs == null || !Number.isFinite(Number(bestMs))) return false;
  return (Number(ms) - Number(bestMs)) / 1000 < -0.05;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
