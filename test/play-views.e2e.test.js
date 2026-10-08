// [play:views] Each real view, on a desktop and a phone: a wrong angle stays quiet, the pose opens 「見つけた！」.
// Stills: the quest card, the hint circle, the reveal, the けしき帳, B's card.
//   tools/anime/gate.sh chrome --fg env KLC_E2E=1 env -u NODE_OPTIONS bun test ./test/play-views.e2e.test.js
import { test, describe, beforeAll, afterAll, expect } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAndServe, launch, phonePage, enterTown, sleep } from '../tools/anime/pad-lib.mjs';
import VIEWS from '../data/play/views.json' with { type: 'json' };

const RUN = process.env.KLC_E2E === '1' && process.env.KLC_GATE === '1';
const PORT = Number(process.env.KLC_E2E_PORT || 9636);
const OUT = process.env.VIEWS_REVIEW_DIR || join(import.meta.dir, '..', 'dist', 'review', 'views');
const d = RUN ? describe : describe.skip;
const real = VIEWS.views.filter((v) => v.kind === 'real');

let srv, browser;
const log = [];

beforeAll(async () => {
  if (!RUN) return;
  mkdirSync(OUT, { recursive: true });
  ({ srv } = await buildAndServe(PORT));
  browser = await launch();
}, 300000);

afterAll(async () => {
  if (!RUN) return;
  try { writeFileSync(join(OUT, 'play-log.json'), JSON.stringify(log, null, 2)); } catch { /* */ }
  try { await browser?.close(); } catch { /* */ }
  try { srv?.stop(); } catch { /* */ }
}, 60000);

async function place(page, pose, yawOff) {
  const yaw = pose.yaw + yawOff;
  await page.eval(`(() => {
    const p = window.__ctx.playerObj;
    p.gull = false; p.enabled = true; p.liftTo = null;
    p.keys?.clear?.();
    p.setPose(${pose.x}, ${pose.z}, ${yaw}, ${pose.pitch}, ${pose.y});
    return 1;
  })()`);
}

async function camNow(page) {
  return page.eval(`(() => {
    const c = window.__ctx && window.__ctx.camera;
    const p = window.__ctx && window.__ctx.playerObj;
    if (!c || !p) return null;
    return {
      x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2),
      yaw: +(p.yaw * 180 / Math.PI).toFixed(1), pitch: +(p.pitch * 180 / Math.PI).toFixed(1), fly: !!p.fly,
    };
  })()`);
}

async function cardText(page) {
  return page.eval(`document.querySelector('#klc-m .m-view')?.innerText || ''`);
}

async function viewState(page) {
  return page.eval(`(() => ({
    ready: window.__missions?.state?.viewReady || null,
    active: window.__missions?.state?.active || null,
    text: document.querySelector('#klc-m .m-view')?.innerText || '',
  }))()`);
}

async function waitFound(page, timeout = 5000) {
  const t0 = Date.now();
  let text = '';
  while (Date.now() - t0 < timeout) {
    text = await cardText(page);
    if (text.includes('見つけた')) return text;
    await sleep(200);
  }
  return text;
}

async function freshPage(page) {
  await page.S('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.removeItem('klc.play.v1'); } catch (e) {}`,
  });
}

async function shot(page, name) {
  await page.shot(join(OUT, name));
}

async function playViews(page, tag) {
  for (let i = 0; i < real.length; i++) {
    const view = real[i];
    const id = 'view-a-0' + (i + 1);
    const accepted = await page.eval(`window.__missions.accept(${JSON.stringify(id)})`);
    expect(accepted, id).toBe(true);
    await sleep(300);
    const hunt = await cardText(page);
    expect(hunt, id).toContain(view.area.ja);
    if (i === 0) {
      await shot(page, `${tag}-quest-card.png`);
      if (tag === 'desktop') {
        await page.eval(`window.__missions.lang('en'); window.__missions.hunt('V01')`);
        await sleep(300);
        const en = await cardText(page);
        expect(en.toLowerCase()).toContain('around');
        await shot(page, 'desktop-quest-card-en.png');
        await page.eval(`window.__missions.lang('ja'); window.__missions.hunt('V01')`);
        await sleep(200);
      }
    }
    await page.eval(`document.querySelector('#klc-m .m-view [data-act="close"]')?.click()`);
    await sleep(200);

    await place(page, view.pose, 90);
    await sleep(1600);
    const wrong = await viewState(page);
    expect(wrong.ready, id + ' wrong').not.toBe(view.id);
    expect(wrong.text, id + ' wrong').not.toContain('見つけた');

    if (i === 0) {
      await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', bubbles: true }))`);
      await sleep(400);
      for (let z = 0; z < 4; z++) {
        await page.eval(`document.querySelector('#klc-x [data-act="zin"]')?.click()`);
        await sleep(200);
      }
      await sleep(300);
      await shot(page, `${tag}-hint-circle.png`);
      const teal = await page.eval(`(() => {
        const cv = document.querySelector('#klc-x .xmap canvas');
        if (!cv) return -1;
        let n = 0;
        try {
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          for (let i = 0; i < d.length; i += 16) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            if (r < 90 && g > 130 && b > 130 && g > r + 40) n++;
          }
        } catch (e) { return -2; }
        return n;
      })()`);
      expect(teal, 'hint wash').toBeGreaterThan(20);
      await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`);
      await sleep(200);
    }

    await place(page, view.pose, 0);
    const found = await waitFound(page);
    const cam = await camNow(page);
    expect(found, id + ' ' + JSON.stringify(cam)).toContain('見つけた');
    log.push({ tag, id: view.id, found: true });
    if (i === 0) {
      await shot(page, `${tag}-reveal.png`);
      const bright = await page.eval(`(() => {
        const img = document.querySelectorAll('#klc-m .m-view-pair img')[1];
        if (!img || !img.complete || !img.naturalWidth) return 0;
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, 16, 16);
        const d = g.getImageData(0, 0, 16, 16).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
        return s / (d.length / 4);
      })()`);
      expect(bright, 'game frame').toBeGreaterThan(24);
      await page.eval(`document.querySelector('#klc-m .m-view [data-act="keep"]')?.click()`);
      await sleep(250);
      const opened = await page.eval(`window.__missions.album()`);
      expect(opened, 'album').toBe(true);
      await sleep(500);
      const book = await page.eval(`document.querySelector('#klc-play .sheet')?.innerText || ''`);
      expect(book).toContain('けしき帳');
      await shot(page, `${tag}-keshiki-book.png`);
      await page.eval(`document.querySelector('#klc-play .sheet [data-act="close"]')?.click()`);
      await sleep(200);
      await page.eval(`window.__missions.hunt('V07')`);
      await sleep(300);
      const b = await cardText(page);
      expect(b).toContain('本物のこの場所で');
      expect(b).toContain('LINE は準備中');
      await shot(page, `${tag}-b-card.png`);
      await page.eval(`window.__missions.close()`);
      await sleep(200);
    } else {
      await page.eval(`window.__missions.close()`);
      await sleep(150);
    }
  }
}

d('view quests, both ways', () => {
  test('desktop: each real view, then the five stills', async () => {
    const page = await browser.page({ width: 1600, height: 900, dpr: 1 });
    await freshPage(page);
    await enterTown(page, srv.url + 'index.html?hours=11', { tap: false });
    await page.waitFor('window.__missions && window.__missions.accept', { timeout: 20000 });
    await playViews(page, 'desktop');
    const errs = page.errors().filter((e) => !/favicon|net::ERR/.test(e.text || ''));
    writeFileSync(join(OUT, 'desktop-errors.json'), JSON.stringify(errs, null, 2));
  }, 420000);

  test('phone: each real view, then the five stills', async () => {
    const page = await phonePage(browser, { width: 390, height: 844, dpr: 2 });
    await freshPage(page);
    await enterTown(page, srv.url + 'index.html?touch=1&hours=11');
    await page.waitFor('window.__missions && window.__missions.accept', { timeout: 20000 });
    await playViews(page, 'phone');
  }, 420000);

});
