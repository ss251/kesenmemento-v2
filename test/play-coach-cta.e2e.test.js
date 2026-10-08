// [mobile-play] The phone's first screen, in a real browser: while the touch pad's first-run coach (左で移動・右で視点 /
// はじめる) is up, the kit's prompts (the gull's 「ウミネコになる」) and the ship's boarding chip step back, hidden and
// untappable; はじめる brings them back; a desktop page (no pad, no coach) is unchanged. The CSS is pinned by
// test/play-coach-cta.test.js. Heavy (it builds the app and loads the town), so it runs only through the machine gate:
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=9549 bun test ./test/play-coach-cta.e2e.test.js
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { buildAndServe, launch, phonePage, enterTown, center } from '../tools/anime/pad-lib.mjs';

const RUN = process.env.KLC_E2E === '1' && process.env.KLC_GATE === '1';
const PORT = Number(process.env.KLC_E2E_PORT || 9549);
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 300000);

/** What the visitor sees of the coach, the kit's prompt and the boarding chip. */
const LOOK = `(() => {
  const vis = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { shown: !el.hidden, visibility: cs.visibility, pe: cs.pointerEvents }; };
  return { coach: vis(document.querySelector('#klc-pad .coach')), prompt: vis(document.querySelector('#klc-play .prompt')),
    board: vis(document.querySelector('#klc-board')), boardOn: !!document.querySelector('#klc-board.show') };
})()`;
/** The drone: the gull offers itself only to a flying visitor. */
const FLY = `(() => { const e = window.__explore, p = window.__ctx.playerObj; if (e?.drive?.active) e.drive.exit(); p.fly = true; return true; })()`;
const PROMPT_UP = "(() => { const p = document.querySelector('#klc-play .prompt'); return !!p && !p.hidden; })()";

d('the first screen shows one thing at a time', () => {
  let browser, srv;
  beforeAll(async () => {
    ({ srv } = await buildAndServe(PORT));
    browser = await launch({ quiet: true });
  }, 330000);
  afterAll(async () => { await browser?.close(); srv?.stop(); }, 60000);

  T('phone: while the coach is up the gull offer and the boarding chip step back; はじめる brings them back', async () => {
    const page = await phonePage(browser, { width: 390, height: 844, dpr: 3 });
    const f = await enterTown(page, `${srv.url}index.html`);
    await page.eval(FLY);
    await page.waitFor("(() => { const c = document.querySelector('#klc-pad .coach'); return !!c && !c.hidden; })()", { timeout: 30000 });
    await page.waitFor(PROMPT_UP, { timeout: 30000 });
    const up = await page.eval(LOOK);
    expect(up.coach.shown).toBe(true);
    expect(up.prompt).toMatchObject({ shown: true, visibility: 'hidden', pe: 'none' });
    if (up.boardOn) expect(up.board).toMatchObject({ visibility: 'hidden', pe: 'none' });
    const ok = await center(page, '#klc-pad .coach [data-act="coach"]');
    expect(ok).not.toBeNull();
    await f.tap(ok.x, ok.y);
    await page.waitFor("(() => { const c = document.querySelector('#klc-pad .coach'); return !c || c.hidden; })()", { timeout: 10000 });
    await page.waitFor(PROMPT_UP, { timeout: 30000 });
    const after = await page.eval(LOOK);
    expect(after.prompt).toMatchObject({ shown: true, visibility: 'visible' });
    expect(after.prompt.pe).not.toBe('none');
    if (after.boardOn) expect(after.board.visibility).toBe('visible');
  });

  T('desktop: no pad coach, so the gull offer shows as before', async () => {
    const page = await browser.page({ width: 1280, height: 720, dpr: 1 });
    await page.goto(`${srv.url}index.html`);
    await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    await page.eval("document.getElementById('go').click()");
    await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
    await page.eval(FLY);
    await page.waitFor(PROMPT_UP, { timeout: 30000 });
    const r = await page.eval(LOOK);
    expect(r.prompt).toMatchObject({ shown: true, visibility: 'visible' });
  });
});
