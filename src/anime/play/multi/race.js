// One countdown for the whole room. `go` is the server's millisecond for GO.
// Beats match the kit's 3 · 2 · 1 · GO spacing (720 ms), with the extra lead spent on 「3」
// so a packet that arrives a little late still starts on the same GO.

import { COUNT_LEAD_MS } from '../../../../server/multi/wire.js';

export { COUNT_LEAD_MS };

/** '3' | '2' | '1' | 'go' | 'done' | 'wait' (go is still further away than the lead). */
export function phase(now, go) {
  if (!Number.isFinite(now) || !Number.isFinite(go)) return 'done';
  const left = go - now;
  if (left > COUNT_LEAD_MS) return 'wait';
  if (left > 1440) return '3';
  if (left > 720) return '2';
  if (left > 0) return '1';
  if (left > -420) return 'go';
  return 'done';
}

/** `m:ss.ss`, half-width digits, no spaces. */
export function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00.00';
  const clamped = Math.min(ms, 30 * 60 * 1000);
  const s = clamped / 1000;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  const whole = Math.floor(rem);
  const frac = Math.floor((rem - whole) * 100 + 1e-6);
  return m + ':' + pad2(whole) + '.' + pad2(frac);
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Rows are [id, ms], already sorted by the server. Names are escaped. No rank numerals. */
export function boardHtml(rows, nameOf, fastestLabel, youId) {
  let html = '<ul class="times">';
  for (let i = 0; i < rows.length; i++) {
    const name = esc(nameOf(rows[i][0]));
    const you = youId != null && rows[i][0] === youId;
    const medal = i === 0 ? '<span class="medal" aria-hidden="true">金</span>' : '';
    const mark = i === 0 ? '<span class="fast">' + esc(fastestLabel) + '</span>' : '';
    html += '<li' + (you ? ' class="you"' : '') + '>' + medal + '<span class="who">' + name + '</span>' + mark + '<b>' + formatTime(rows[i][1]) + '</b></li>';
  }
  html += '</ul>';
  return html;
}
