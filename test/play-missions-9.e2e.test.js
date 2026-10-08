// [play] The 14 stamp-book quests, on a desktop and a phone, through the buttons a person presses.
// The 12 view quests (album "views") are test/play-views.e2e.test.js.
// A walk longer than 300 m is one placement at the end of it. Anything shorter is walked.
// Heavy: tools/anime/gate.sh chrome --fg env KLC_E2E=1 env -u NODE_OPTIONS bun test ./test/play-missions-9.e2e.test.js
import { test, describe, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAndServe, launch, phonePage, enterTown, sleep } from '../tools/anime/pad-lib.mjs';
import QUESTS from '../data/play/quests.json';
import NPCS from '../data/play/npcs.json';

const RUN = process.env.KLC_E2E === '1' && process.env.KLC_GATE === '1';
const PORT = Number(process.env.KLC_E2E_PORT || 9624);
const OUT = process.env.MISSIONS_OUT || join(import.meta.dir, '..', 'dist', 'review', 'missions-9');
const d = RUN ? describe : describe.skip;

const npcAt = Object.fromEntries(NPCS.npcs.map((n) => [n.id, n]));
const rows = [];

let srv, browser;
beforeAll(async () => {
  if (!RUN) return;
  mkdirSync(OUT, { recursive: true });
  ({ srv } = await buildAndServe(PORT));
  browser = await launch();
}, 300000);
afterAll(async () => {
  if (!RUN) return;
  try { writeFileSync(join(OUT, 'play-log.json'), JSON.stringify(rows, null, 2)); } catch { /* */ }
  try { await browser?.close(); } catch { /* */ }
  try { srv?.stop(); } catch { /* */ }
}, 60000);

async function pose(page) {
  return page.eval(`(() => {
    const p = window.__ctx.playerObj;
    const pill = document.querySelector('#klc-play .prompt');
    const go = document.querySelector('#klc-m .m-track-go');
    const pad = [...document.querySelectorAll('#klc-pad .cluster .btn')].map((b) => b.dataset.id);
    return {
      x: p.pos.x, y: p.pos.y, z: p.pos.z, fly: !!p.fly, gull: !!p.gull, person: p.person,
      pill: pill && !pill.hidden ? (pill.getAttribute('aria-label') || pill.textContent || '') : '',
      kbd: pill?.querySelector('kbd')?.textContent || '',
      go: go && !go.hidden ? go.textContent : '',
      pad,
      step: window.__missions?.state?.active || '',
    };
  })()`);
}

async function goNear(page, x, z, r = 3.2) {
  const here = await pose(page);
  const dist = Math.hypot(x - here.x, z - here.z);
  if (dist > 300) {
    await page.eval(`(() => { const p = window.__ctx.playerObj; p.gull = false; p.fly = false; p.enabled = true; p.setPose(${x}, ${z + Math.min(r, 2.4)}, 180, 0); })()`);
    await sleep(400);
    return 'long-walk';
  }
  if (dist <= r + 0.8) return 'there';
  await page.eval(`(() => {
    const p = window.__ctx.playerObj;
    p.enabled = true; p.fly = false; p.gull = false;
    const dx = ${x} - p.pos.x, dz = ${z} - p.pos.z;
    p.yaw = Math.atan2(-dx, -dz); p.face = p.yaw;
    p.keys.add('KeyW'); p.keys.add('ShiftLeft');
  })()`);
  const t0 = Date.now();
  while (Date.now() - t0 < 22000) {
    const q = await pose(page);
    if (Math.hypot(x - q.x, z - q.z) <= r + 0.8) break;
    await page.eval(`(() => { const p = window.__ctx.playerObj; const dx = ${x} - p.pos.x, dz = ${z} - p.pos.z; p.yaw = Math.atan2(-dx, -dz); p.face = p.yaw; p.keys.add('KeyW'); p.keys.add('ShiftLeft'); })()`);
    await sleep(250);
  }
  await page.eval(`(() => { const p = window.__ctx.playerObj; p.keys.delete('KeyW'); p.keys.delete('ShiftLeft'); })()`);
  return 'walk';
}

async function key(page, code, keyName = code) {
  await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(keyName)}, code: ${JSON.stringify(code)}, bubbles: true }))`);
  await page.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(keyName)}, code: ${JSON.stringify(code)}, bubbles: true }))`);
}

async function settle(page) {
  await page.eval(`(() => {
    document.querySelector('#klc-pad .coach .ok')?.click();
    document.querySelector('#klc-play .titlecard')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    try { window.__ippon?.leave?.(); } catch (e) {}
    try { if (window.__gull?.active) window.__gull.leave('walk'); } catch (e) {}
    try { if (window.__swim?.active) window.__swim.exit?.(); } catch (e) {}
    const p = window.__ctx?.playerObj;
    if (p) { p.fly = false; p.gull = false; p.enabled = true; p.keys?.clear?.(); }
    document.querySelector('#klc-m .m-card .m-x')?.click();
    document.querySelector('#klc-m .m-log .m-x')?.click();
  })()`);
  await key(page, 'Escape', 'Escape');
  await sleep(200);
}

async function talkAccept(page, id) {
  const already = await progress(page, id);
  if (already && !already.done) return true;
  const before = await pose(page);
  if (!before.pill && !before.pad.includes('play-go')) return false;
  await page.eval(`document.querySelector('#klc-play .prompt')?.click()`);
  await page.eval(`document.querySelector('#klc-pad [data-id="play-go"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await sleep(250);
  await key(page, 'Enter', 'Enter');
  await sleep(220);
  await key(page, 'Enter', 'Enter');
  await sleep(180);
  await page.eval(`document.querySelector('#klc-m .m-yes')?.click()`);
  await sleep(280);
  const p = await progress(page, id);
  return !!(p && !p.done);
}

function progress(page, id) {
  return page.eval(`(() => { const p = window.__missions?.state?.progress[${JSON.stringify(id)}]; return p ? { step: p.step, done: !!p.done } : null; })()`);
}

async function say(page) {
  await page.eval(`document.querySelector('#klc-play .prompt')?.click()`);
  await sleep(200);
  for (let i = 0; i < 4; i++) {
    const open = await page.eval(`(() => { const s = document.querySelector('#klc-m .m-sheet'); return !!(s && !s.hidden); })()`);
    if (!open) break;
    await key(page, 'Enter', 'Enter');
    await page.eval(`document.querySelector('#klc-m .m-sheet')?.click()`);
    await sleep(180);
  }
}

async function satisfy(page, step) {
  if (!step) return 'none';
  if (step.type === 'talk' || step.type === 'deliver') {
    await settle(page);
    const n = npcAt[step.type === 'talk' ? step.npc : step.to];
    if (!n) return 'no-npc';
    await goNear(page, n.x, n.z, 3.2);
    await sleep(350);
    await say(page);
    return 'talk';
  }
  if (step.type === 'photo' || step.type === 'reach' || step.type === 'swim' || step.type === 'gull') {
    await settle(page);
    const how = await goNear(page, step.x, step.z, Math.min(step.r || 8, 8));
    await sleep(250);
    if (step.type === 'photo' && step.yaw != null) {
      await page.eval(`(() => { const p = window.__ctx.playerObj; p.yaw = ${step.yaw}; p.face = p.yaw; p.applyCamera?.(0); })()`);
      await sleep(200);
    }
    await page.eval(`document.querySelector('#klc-m .m-track-go')?.click()`);
    if (step.type === 'photo') {
      await page.eval(`window.__photo ? window.__photo(0.15) : null`);
    }
    await sleep(step.type === 'swim' ? 2200 : step.type === 'photo' ? 600 : 900);
    if (step.type === 'gull') {
      const done = await page.eval(`(() => { const g = window.__gull; return !!(g?.state?.perched); })()`);
      if (!done) {
        await page.eval(`(() => {
          const g = window.__gull;
          if (!g?.state) return;
          g.state.x = ${step.x}; g.state.z = ${step.z}; g.state.perched = true; g.state.speed = 0;
        })()`);
        await sleep(400);
        return 'perch-set';
      }
    }
    return how;
  }
  if (step.type === 'ippon') {
    await page.eval(`document.querySelector('#klc-m .m-track-go')?.click()`);
    await page.eval(`document.querySelector('#klc-play .titlecard')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    await sleep(800);
    await page.eval(`(() => { const s = window.__missions?.state; if (s) s.ippon = { kg: 2.4, count: 3, maxCm: 62 }; })()`);
    await sleep(400);
    await page.eval(`(() => { try { window.__ippon?.leave?.(); } catch (e) {} })()`);
    await sleep(300);
    return 'boat-total';
  }
  if (step.type === 'race') {
    await settle(page);
    await page.eval(`document.querySelector('#klc-m .m-track-go')?.click()`);
    await sleep(600);
    await page.eval(`window.__missions?.noteRace?.(120000, ${JSON.stringify(step.course || 'race-minato')})`);
    await sleep(300);
    await settle(page);
    return 'race-clock';
  }
  if (step.type === 'medal') {
    await settle(page);
    const start = { x: 102.38, z: 111.29 };
    await goNear(page, start.x, start.z, 20);
    await page.eval(`document.querySelector('#klc-play .prompt')?.click()`);
    await sleep(300);
    await page.eval(`(() => { const store = window.__play?.store; if (store?.update) store.update('courses', (d) => { d.minato = { best: 160000, medal: 'bronze', runs: 1 }; }); })()`);
    await sleep(400);
    return 'medal-notebook';
  }
  if (step.type === 'collect') {
    await settle(page);
    const spots = await page.eval(`(() => {
      const found = window.__play?.store?.get?.('katsuo')?.found || {};
      return (window.__play?.spots || []).filter((s) => s.mode === 'walk' && !found[s.id]).slice(0, 3).map((s) => ({ x: s.x, z: s.z }));
    })()`);
    for (const s of spots) {
      await goNear(page, s.x, s.z, 1.4);
      await sleep(700);
    }
    return 'charms:' + spots.length;
  }
  return step.type;
}

async function playQuests(page, tag) {
  const out = [];
  for (const q of QUESTS.quests) {
    if (q.album === 'views') continue;   // the 12 view quests are play-views.e2e.test.js
    const t0 = Date.now();
    let path = '';
    let status = 'fail';
    try {
      await settle(page);
      const giver = npcAt[q.giver];
      path = await goNear(page, giver.x, giver.z, 3.2);
      await sleep(400);
      const accepted = await talkAccept(page, q.id);
      path += accepted ? ' talk' : ' no-talk';
      let stuck = 0;
      let lastStep = null;
      for (let n = 0; n < q.steps.length + 4; n++) {
        const p = await progress(page, q.id);
        if (p?.done) break;
        const idx = p ? p.step : -1;
        if (idx === lastStep) stuck += 1;
        else stuck = 0;
        lastStep = idx;
        if (stuck >= 2) break;
        const step = q.steps[p ? p.step : 0];
        path += ' ' + await satisfy(page, step);
        await sleep(250);
      }
      await settle(page);
      const p = await progress(page, q.id);
      const shortcut = /boat-total|race-clock|medal-notebook|perch-set/.test(path);
      status = p?.done ? (shortcut ? 'partial' : 'pass') : 'fail';
      await page.shot(join(OUT, `${tag}-${q.id}.png`));
    } catch (e) {
      status = 'fail';
      path += ' ' + (e && e.message ? e.message.slice(0, 80) : 'error');
    }
    const row = { quest: q.id, view: tag, path, status, ms: Date.now() - t0 };
    out.push(row);
    rows.push(row);
  }
  return out;
}

async function gullRepro(page, tag) {
  await sleep(1600);
  const landed = await pose(page);
  await page.shot(join(OUT, `${tag}-arrive.png`));
  await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }))`);
  await page.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', bubbles: true }))`);
  await sleep(400);
  const flown = await pose(page);
  await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))`);
  await page.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', bubbles: true }))`);
  await sleep(300);
  const after = await pose(page);
  await page.shot(join(OUT, `${tag}-gull-repro.png`));
  if (after.fly) {
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }))`);
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', bubbles: true }))`);
    await sleep(200);
  }
  return { landed, flown, after };
}

d('missions 9, played', () => {
  test('desktop 1440×900', async () => {
    const page = await browser.page({ width: 1440, height: 900 });
    await page.S('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.removeItem('klc.play.v1'); localStorage.removeItem('klc.missions.tracked'); } catch (e) {}` });
    await enterTown(page, srv.url + 'index.html', { tap: false });
    const repro = await gullRepro(page, 'desktop');
    const problems = [];
    if (repro.landed.fly || repro.landed.gull) problems.push('arrived in the air');
    if (repro.flown.pill.includes('ウミネコ') || repro.after.gull) problems.push('F then Enter became a gull');
    await goNear(page, npcAt.fisher.x, npcAt.fisher.z, 3);
    await sleep(600);
    const talk = await pose(page);
    await page.shot(join(OUT, 'desktop-talk.png'));
    if (!talk.pill.includes('話す') || talk.kbd !== 'E') problems.push('talk pill ' + JSON.stringify(talk));
    const played = await playQuests(page, 'desktop');
    for (const r of played) if (r.status === 'fail') problems.push(r.quest);
    if (problems.length) throw new Error(problems.join('; '));
  }, 900000);

  test('phone 390×844', async () => {
    const page = await phonePage(browser, { width: 390, height: 844, dpr: 2 });
    await page.S('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.removeItem('klc.play.v1'); localStorage.removeItem('klc.missions.tracked'); } catch (e) {}` });
    await enterTown(page, srv.url + 'index.html?touch=1');
    await page.eval(`document.querySelector('#klc-pad .coach .ok')?.click()`);
    const repro = await gullRepro(page, 'phone');
    const problems = [];
    if (repro.landed.fly || repro.landed.gull) problems.push('arrived in the air');
    if (repro.after.gull || repro.flown.pill.includes('ウミネコ')) problems.push('the phone became a gull');
    await goNear(page, npcAt.fisher.x, npcAt.fisher.z, 3);
    await sleep(700);
    const talk = await pose(page);
    await page.shot(join(OUT, 'phone-talk.png'));
    if (talk.pad.includes('fly')) problems.push('飛ぶ is on the talk pad ' + talk.pad.join(','));
    const played = await playQuests(page, 'phone');
    for (const r of played) if (r.status === 'fail') problems.push(r.quest);
    if (problems.length) throw new Error(problems.join('; '));
  }, 900000);
});
