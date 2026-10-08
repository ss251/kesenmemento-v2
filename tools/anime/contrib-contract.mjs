// [contrib] The contract between the report sheet's API client (src/anime/ui/contrib-api.js) and the report backend, as one scenario that runs against
// either the in-memory mock (tools/anime/contrib-mock-api.mjs, the default) or the REAL backend (server/contrib, docs/contrib/API.md). The same steps and
// the same expectations on both: if the mock and the real service ever drift apart, this is where it shows. No browser, no child process: the backend runs
// in this process on a loopback port (the real one through its own throwaway dev server: temp data directory, fixed development admin token).
//
//   env -u NODE_OPTIONS bun tools/anime/contrib-contract.mjs                               the mock
//   env -u NODE_OPTIONS bun tools/anime/contrib-contract.mjs --backend ../klc-contrib-api  a checkout that has tools/contrib/dev-server.mjs (after the merge: --backend .)
//   env -u NODE_OPTIONS bun tools/anime/contrib-contract.mjs --api https://host --admin-token ...   a running service (one throwaway contributor, erased at the end)
//   [--port 8987]   the loopback port for the mock / dev server (this branch: 8985-8988)
//
// test/contrib-mock.test.js runs the scenario against the mock on every `bun test`. Images are synthetic (made-up shop fronts, synthetic GPS EXIF).
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createApi } from '../../src/anime/ui/contrib-api.js';
import { createAccounts } from '../../src/anime/ui/contrib-lib.js';
import { startMock, DEFAULTS } from './contrib-mock-api.mjs';

const PREFIX = '/api/contrib/v1';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const POSE = { enu: [120.5, 1.6, -60.13], latlon: [38.9065, 141.5764], heading: 327, pitch: -12, fov: 55, mode: 'walk', at: new Date().toISOString(), appVersion: '0.1.0+abc1234', layoutVersion: 'v1.deadbeef', timePreset: 'yugata', season: 'autumn', viewport: { w: 1440, h: 900, dpr: 2 } };
const GPS = { IFD0: { Make: 'Synthetic', Model: 'Test camera' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '38/1 54/1 21.6/1', GPSLongitudeRef: 'E', GPSLongitude: '141/1 34/1 30/1', GPSImgDirectionRef: 'T', GPSImgDirection: '270/1' } };
const blank = (w, h, c) => sharp({ create: { width: w, height: h, channels: 3, background: c } });

/**
 * Run the scenario. -> { results: [{ name, ok, detail }], passed, failed }
 * @param {{ base: string, adminToken: string, origin?: string, onResult?: (r) => void }} o
 */
export async function runContract({ base, adminToken, origin = 'http://127.0.0.1:8986', onResult = () => {} }) {
  const results = [];
  const t = (name, ok, detail = '') => { const r = { name, ok: !!ok, detail: ok ? '' : String(detail) }; results.push(r); onResult(r); return !!ok; };
  const device = () => { const accounts = createAccounts({ get: (k) => store.getItem(k), set: (k, v) => { store.setItem(k, v); return true; }, del: (k) => store.removeItem(k) }, base); const store = mem(); return { api: createApi({ base, accounts }), accounts }; };
  const fails = async (p, pred) => { try { await p; return [false, 'did not fail']; } catch (e) { return [!!pred(e), `${e.code}/${e.reason || '-'}/${e.status}`]; } };
  const admin = (path, init = {}) => fetch(base + PREFIX + path, { ...init, headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const review = async (id, body) => { const r = await admin(`/admin/submissions/${id}`, { method: 'POST', body: JSON.stringify(body) }); if (!r.ok) throw new Error(`admin review ${r.status}: ${await r.text()}`); return r.json(); };
  const shot = new Blob([await blank(1600, 900, '#6fa8dc').jpeg().toBuffer()], { type: 'image/jpeg' });
  const photo = async (name, hue = '#cc8844') => new File([await blank(1200, 800, hue).jpeg().withExif(GPS).toBuffer()], name, { type: 'image/jpeg' });
  const fields = (o = {}) => ({ pose: POSE, kind: 'issue', category: 'sign', note: '看板が1メートルほど右にずれています', lang: 'ja', consent: true, screenshot: shot, photos: [], ...o });

  const A = device(), B = device();
  t('health answers', await A.api.health());
  const cfg = await A.api.config();
  t('health announces the limits and the default points as positive whole numbers, or says nothing (a backend from before that was added)', cfg !== null && (cfg.limits === null || Object.values(cfg.limits).every((v) => v === null || v > 0)) && (cfg.points === null || (cfg.points.issue > 0 && cfg.points.fix > 0)), JSON.stringify(cfg));

  // ---- the login
  await A.api.createContributor({ nickname: 'そら', crewNo: '1234-5678-9012-34' });
  t('createContributor keeps an <id>.<secret> token', /^[\w-]+\.[\w-]+$/.test(A.accounts.get()?.token || ''), A.accounts.get()?.token?.length);
  let me = await A.api.me();
  t('me: nickname, crewNo as 14 digits, no points yet, no rank, no reports', me.nickname === 'そら' && me.crewNo === '12345678901234' && me.points === 0 && me.accepted === 0 && me.rank === null && me.submissions.length === 0, JSON.stringify(me));
  t('me: the id is the one in the token', A.accounts.get().token.startsWith(me.id + '.'), me.id);
  t('a link as nickname is refused: invalid_nickname', ...await fails(A.api.request('POST', '/contributors', { json: { nickname: 'http://x.com' } }), (e) => e.reason === 'invalid_nickname' && e.code === 'validation'));
  t('a crew number that is not 14 digits is refused: invalid_crew_no', ...await fails(A.api.request('POST', '/contributors', { json: { crewNo: '123' } }), (e) => e.reason === 'invalid_crew_no'));
  const guest = await A.api.updateProfile({ nickname: '' });
  t('an empty nickname goes back to Guest-XXXX', /^Guest-[A-Z0-9]{4}$/.test(guest.nickname) && guest.crewNo === '12345678901234', guest.nickname);
  const prof = await A.api.updateProfile({ nickname: 'そら', crewNo: '' });
  t('updateProfile changes the nickname and removes the crew number', prof.nickname === 'そら' && prof.crewNo === '', JSON.stringify([prof.nickname, prof.crewNo]));

  // ---- a report
  const key = 'contract-' + Math.random().toString(36).slice(2, 12);
  const first = await A.api.submit(fields(), { idempotencyKey: key });
  t('submit (issue, screenshot only): 201 new', first.id.length >= 8 && first.status === 'new' && first.replayed === false, JSON.stringify(first));
  const again = await A.api.submit(fields(), { idempotencyKey: key });
  t('the same Idempotency-Key returns the first report (replayed), not a second one', again.id === first.id && again.replayed === true, JSON.stringify(again));
  const fix = await A.api.submit(fields({ kind: 'fix', category: 'shop', note: '現地で撮った写真です', photos: [await photo('IMG_0001.JPG'), await photo('IMG_0002.JPG', '#88aa55')] }));
  t('submit (fix with two geotagged photos with their EXIF)', fix.status === 'new');
  t('a fix without a photo is refused: fix_needs_photos', ...await fails(A.api.submit(fields({ kind: 'fix' })), (e) => e.reason === 'fix_needs_photos' && e.code === 'validation'));
  t('a report with nothing in it is refused: empty_submission', ...await fails(A.api.submit(fields({ note: '', screenshot: undefined })), (e) => e.reason === 'empty_submission'));
  t('a text file posing as a photo is refused (415, by its bytes): invalid_image', ...await fails(A.api.submit(fields({ photos: [new File([new TextEncoder().encode('MZ this is not a photo')], 'IMG_1.JPG', { type: 'image/jpeg' })] })), (e) => e.code === 'type' && e.reason === 'invalid_image' && e.status === 415));
  t('an incomplete pose is refused: invalid_pose', ...await fails(A.api.submit(fields({ pose: '{"enu":[1,2]}' })), (e) => e.reason === 'invalid_pose' && e.code === 'validation'));
  t('no consent never leaves the client', ...await fails(A.api.submit(fields({ consent: false })), (e) => e.code === 'validation'));
  me = await A.api.me();
  t('me lists the two reports, newest first, with kind, photo count and no moderator note', me.submissions.length === 2 && me.submissions[0].id === fix.id && me.submissions[0].kind === 'fix' && me.submissions[0].photos === 2 && me.submissions[1].kind === 'issue' && me.submissions.every((s) => s.status === 'new' && s.points === 0 && s.usedVersion === '' && !('reviewerNote' in s)), JSON.stringify(me.submissions));

  // ---- the moderator: accepted (default points), shipped, rejected
  const accepted = await review(fix.id, { status: 'accepted' });
  t('accepting a fix without points gives the default (20)', accepted.points === 20 && accepted.status === 'accepted', accepted.points);
  me = await A.api.me();
  t('me: 20 points, 1 accepted, rank 1', me.points === 20 && me.accepted === 1 && me.rank === 1, JSON.stringify([me.points, me.accepted, me.rank]));
  const used = await review(fix.id, { status: 'used', version: 'v0.5.0' });
  me = await A.api.me();
  const fixRow = me.submissions.find((s) => s.id === fix.id);
  t('shipped: 反映済み with its version and time', used.status === 'used' && fixRow.status === 'used' && fixRow.usedVersion === 'v0.5.0' && !!fixRow.usedAt && fixRow.points === 20, JSON.stringify(fixRow));
  await review(first.id, { status: 'rejected' });
  me = await A.api.me();
  t('rejected: no points, still 20 in total', me.submissions.find((s) => s.id === first.id).status === 'rejected' && me.points === 20, me.points);

  // ---- the leaderboard
  const board = await A.api.leaderboard();
  t('leaderboard with my login: my row is marked me, nickname + accepted + points only', board.length === 1 && board[0].me === true && board[0].nickname === 'そら' && board[0].accepted === 1 && board[0].points === 20, JSON.stringify(board));
  const wire = await (await fetch(base + PREFIX + '/leaderboard?limit=20')).text();
  t('leaderboard without a login: no me flag, no crew number anywhere', !wire.includes('"me"') && !wire.includes('12345678901234') && !/crew/i.test(wire), wire.slice(0, 200));

  // ---- another device
  const tc = await A.api.transferCode();
  t('transferCode: 10 Crockford characters, valid for about 15 minutes', /^[0-9A-HJKMNP-TV-Z]{10}$/.test(tc.code) && tc.expiresAt - Date.now() > 14 * 60e3 && tc.expiresAt - Date.now() <= 15 * 60e3 + 2000, JSON.stringify(tc));
  t('a malformed code is refused before any request (U is not in the alphabet)', ...await fails(B.api.claim('UUUUUUUUUU'), (e) => e.code === 'validation' && e.reason === 'code_malformed'));
  t('a well-formed wrong code: code_not_found', ...await fails(B.api.claim('ABCDE-FGHJK'), (e) => e.code === 'not_found' && e.reason === 'code_not_found'));
  await B.api.claim(` ${tc.code.slice(0, 5).toLowerCase()}-${tc.code.slice(5).toLowerCase()} `);
  const meB = await B.api.me();
  t('claim (typed in lowercase with a dash) gives the same contributor, the same reports and the nickname', meB.id === me.id && meB.nickname === 'そら' && meB.submissions.length === 2 && meB.points === 20, JSON.stringify([meB.id, me.id]));
  t('the first device keeps working', (await A.api.me()).id === me.id);
  t('a used code is not_found', ...await fails(device().api.claim(tc.code), (e) => e.code === 'not_found'));
  t('the leaderboard marks my row on the second device too', (await B.api.leaderboard()).some((r) => r.me === true));

  // ---- the browser's view: CORS
  const foreign = await fetch(base + PREFIX + '/health', { headers: { origin: 'https://evil.example' } });
  const fj = await foreign.json().catch(() => ({}));
  t('a stranger\'s origin is 403 origin_not_allowed (and gets no CORS headers)', foreign.status === 403 && fj.error === 'origin_not_allowed' && !foreign.headers.get('access-control-allow-origin'), `${foreign.status} ${JSON.stringify(fj)}`);
  const pre = await fetch(base + PREFIX + '/submissions', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,idempotency-key' } });
  const allow = (pre.headers.get('access-control-allow-headers') || '').toLowerCase(), methods = pre.headers.get('access-control-allow-methods') || '';
  t(`the preflight from ${origin} allows Authorization, Idempotency-Key and DELETE / PATCH`, pre.status === 204 && pre.headers.get('access-control-allow-origin') === origin && allow.includes('authorization') && allow.includes('idempotency-key') && /DELETE/.test(methods) && /PATCH/.test(methods), `${pre.status} ${allow} ${methods}`);
  const health = await fetch(base + PREFIX + '/health', { headers: { origin } });
  t('Retry-After can be read by the page (exposed), responses are no-store JSON', /retry-after/i.test(health.headers.get('access-control-expose-headers') || '') && health.headers.get('cache-control') === 'no-store' && /json/.test(health.headers.get('content-type') || ''), `${health.headers.get('access-control-expose-headers')} ${health.headers.get('cache-control')}`);

  // ---- delete everything I sent
  t('DELETE /me without confirm=1 is refused', (await fetch(base + PREFIX + '/me', { method: 'DELETE', headers: { authorization: 'Bearer ' + B.accounts.get().token } })).status === 400);
  const del = await B.api.deleteMe();
  t('deleteMe erases the reports and files and this device forgets the login', typeof del.deletedFiles === 'number' && B.accounts.get() === null, JSON.stringify(del));
  t('the old token on the first device is dead (401 -> auth) and is forgotten', ...await fails(A.api.me(), (e) => e.code === 'auth' && e.status === 401));
  t('the first device forgot it too', A.accounts.get() === null);
  t('the leaderboard no longer lists me', !(await A.api.leaderboard()).some((r) => r.nickname === 'そら'));
  t('deleteMe on a login the server no longer knows is a quiet success', (await (async () => { const d = device(); d.accounts.set({ id: 'x', token: 'x.y' }); return d.api.deleteMe(); })()).deletedFiles === 0);

  const failed = results.filter((r) => !r.ok).length;
  return { results, passed: results.length - failed, failed };
}

// ------------------------------------------------------------------ command line
if (import.meta.main) {
  const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
  const port = Number(arg('port', 8987));
  if (!(port >= 8985 && port <= 8988)) console.error(`note: ports 8985-8988 are this branch's; using ${port}`);
  const origin = 'http://127.0.0.1:8986';
  let base, adminToken, stop = async () => {}, label;
  if (arg('api')) { base = String(arg('api')).replace(/\/+$/, ''); adminToken = arg('admin-token') || process.env.ADMIN_TOKEN; label = `the service at ${base}`; if (!adminToken) throw new Error('--admin-token (or ADMIN_TOKEN) is needed for --api'); }
  else if (arg('backend')) {
    const dir = resolve(String(arg('backend')));
    const { startDev } = await import(pathToFileURL(join(dir, 'tools/contrib/dev-server.mjs')).href);
    const dev = await startDev({ port, origins: [origin], seed: false, quiet: true });
    base = dev.url; adminToken = dev.adminToken; stop = () => dev.stop(); label = `the real backend of ${dir} (throwaway dev server on ${dev.url})`;
  } else {
    const mock = startMock({ port }); base = mock.url; adminToken = DEFAULTS.adminToken; stop = async () => mock.stop(); label = `the in-memory mock on ${mock.url}`;
  }
  console.log(`contract: ${label}`);
  let code = 0;
  try {
    const { results, passed, failed } = await runContract({ base, adminToken, origin, onResult: (r) => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  ' + r.detail}`) });
    console.log(`\n${passed} passed, ${failed} failed`); void results;
    code = failed ? 1 : 0;
  } catch (e) { console.error('contract run crashed:', e); code = 2; }
  finally { await stop(); }
  process.exit(code);
}
