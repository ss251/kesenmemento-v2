// Shared look speed and invert Y: one setting for walk, fly, drive, sail, gull and dive, and for the touch drag.
import { test, expect, describe, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Player } from '../src/anime/core/player.js';
import { LOOK, lookDelta } from '../src/anime/ui/touchpad.js';
import { makeDom } from './lib/mini-dom.js';
import {
  LOOK_KEY, MOUSE_RAD, DRAG_GAIN, TOUCH_RAD, SPEED,
  clampSpeed, formatSpeed, parsePad, loadLook, saveLook,
  getLook, setLook, resetLook, lookBlocked, setSheetBlocked,
  mouseLook, touchLook, openDesktopLook, closeDesktopLook, desktopLookOpen,
} from '../src/anime/ui/look-settings.js';

globalThis.addEventListener ??= () => {};

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const world = () => ({
  heightAt: () => 0, groundHeight: () => 0, isWater: () => false, standable: () => true, solidAt: () => false, resolve() {},
});
function player(dom = { addEventListener() {}, requestPointerLock() {} }) {
  const p = new Player(new THREE.PerspectiveCamera(), dom, world(), { x0: -1, x1: 1, z0: -1, z1: 1 });
  p.enabled = true;
  return p;
}

beforeEach(() => resetLook());

describe('look setting: math', () => {
  test('speed 1 is the walk rate, a drag keeps the 1.4 gain, invert flips pitch only', () => {
    const lock = mouseLook(100, 40, { speed: 1, invertY: false });
    expect(lock.yaw).toBeCloseTo(-100 * MOUSE_RAD, 12);
    expect(lock.pitch).toBeCloseTo(-40 * MOUSE_RAD, 12);
    const drag = mouseLook(100, 40, { drag: true, speed: 1, invertY: false });
    expect(drag.yaw).toBeCloseTo(lock.yaw * DRAG_GAIN, 12);
    expect(drag.pitch).toBeCloseTo(lock.pitch * DRAG_GAIN, 12);
    const fast = mouseLook(100, 40, { speed: 2, invertY: true });
    expect(fast.yaw).toBeCloseTo(lock.yaw * 2, 12);
    expect(fast.pitch).toBeCloseTo(-lock.pitch * 2, 12);
    expect(fast.yaw).toBeLessThan(0);
    expect(fast.pitch).toBeGreaterThan(0);
  });

  test('touch drag is 0.008 rad/px at speed 1, and the same invert', () => {
    const a = touchLook(80, 40, { speed: 1, invertY: false });
    expect(a.dx).toBeCloseTo(80 * TOUCH_RAD, 12);
    expect(a.dy).toBeCloseTo(40 * TOUCH_RAD, 12);
    const b = touchLook(80, 40, { speed: 0.5, invertY: true });
    expect(b.dx).toBeCloseTo(a.dx * 0.5, 12);
    expect(b.dy).toBeCloseTo(-a.dy * 0.5, 12);
    const pad = lookDelta(80, 40, { sens: LOOK.sens, mult: 0.5, invertY: true });
    expect(b.dx).toBeCloseTo(pad.dx, 12);
    expect(b.dy).toBeCloseTo(pad.dy, 12);
  });

  test('the next look reads a change with no reload', () => {
    setLook({ speed: 1, invertY: false }, { persist: false });
    const a = mouseLook(10, 10);
    setLook({ speed: 0.8, invertY: true }, { persist: false });
    const b = mouseLook(10, 10);
    expect(getLook()).toEqual({ speed: 0.8, invertY: true });
    expect(b.yaw).toBeCloseTo(a.yaw * 0.8, 12);
    expect(b.pitch).toBeCloseTo(-a.pitch * 0.8, 12);
    const t = touchLook(10, 10);
    expect(t.dx).toBeCloseTo(10 * TOUCH_RAD * 0.8, 12);
    expect(t.dy).toBeCloseTo(-10 * TOUCH_RAD * 0.8, 12);
  });

  test('clamp and the readout', () => {
    expect(SPEED).toEqual({ min: 0.3, max: 2.5, step: 0.1, def: 1 });
    expect(clampSpeed(0.24)).toBe(0.3);
    expect(clampSpeed(2.54)).toBe(2.5);
    expect(clampSpeed(0.84)).toBe(0.8);
    expect(clampSpeed('')).toBe(1);
    expect(clampSpeed('nope')).toBe(1);
    expect(formatSpeed(0.8)).toBe('0.8×');
    expect(formatSpeed(1)).toBe('1.0×');
  });

  test('an open sheet zeroes mouse look and refuses pointer lock', () => {
    setLook({ speed: 2 }, { persist: false });
    let locks = 0, exits = 0;
    const dom = { addEventListener() {}, requestPointerLock() { locks += 1; } };
    const doc = {
      pointerLockElement: {}, exitPointerLock() { exits += 1; this.pointerLockElement = null; },
      body: { classList: { toggle() {} } }, addEventListener() {},
    };
    const p = player(dom);
    p.yaw = 0; p.pitch = 0; p.look.dx = 50; p.look.dy = 20;
    setSheetBlocked(true, doc);
    expect(exits).toBe(1);
    expect(lookBlocked()).toBe(true);
    expect(mouseLook(50, 20, { speed: 2 })).toEqual({ yaw: 0, pitch: 0 });
    p.lookStep(1 / 60);
    expect(p.yaw).toBe(0);
    expect(p.pitch).toBe(0);
    expect(p.look.dx).toBe(0);
    p.requestLock();
    expect(locks).toBe(0);
    setSheetBlocked(false, doc);
    p.look.dx = 50; p.look.dy = 20;
    p.lookStep(1 / 60);
    expect(p.yaw).toBeCloseTo(-50 * MOUSE_RAD * 2, 12);
    expect(p.pitch).toBeCloseTo(-20 * MOUSE_RAD * 2, 12);
  });
});

describe('look setting: persistence', () => {
  test('round trip on the pad key, and an older sens value still loads', () => {
    const mem = new Map();
    const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
    expect(saveLook(store, { speed: 0.8, invertY: true, leftHanded: true, coach: true })).toBe(true);
    expect(mem.has(LOOK_KEY)).toBe(true);
    const got = loadLook(store);
    expect(got.speed).toBe(0.8);
    expect(got.sens).toBe(0.8);
    expect(got.invertY).toBe(true);
    expect(got.leftHanded).toBe(true);
    expect(got.coach).toBe(true);
    mem.set(LOOK_KEY, JSON.stringify({ sens: 1.6, invertY: true }));
    expect(loadLook(store).speed).toBe(1.6);
    expect(parsePad({ speed: 0.8, sens: 1.6 }).speed).toBe(0.8);
  });

  test('a store that throws is ignored', () => {
    const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(loadLook(boom)).toEqual({ leftHanded: false, invertY: false, sens: 1, speed: 1, coach: false });
    expect(saveLook(boom, { speed: 2, invertY: true })).toBe(false);
    setLook({ speed: 1.5, invertY: true }, { persist: false });
    expect(getLook()).toEqual({ speed: 1.5, invertY: true });
  });
});

describe('look setting: every mode reads it', () => {
  test('walk and fly (the player) apply the live speed and invert', () => {
    setLook({ speed: 1.5, invertY: true }, { persist: false });
    const p = player();
    p.look.dx = 80; p.look.dy = 25;
    p.lookStep(1 / 60);
    expect(p.yaw).toBeCloseTo(-80 * MOUSE_RAD * 1.5, 12);
    expect(p.pitch).toBeCloseTo(25 * MOUSE_RAD * 1.5, 12);
    const yaw = p.yaw;
    const seen = [];
    p.lookCapture = (dx, dy) => seen.push([dx, dy]);
    p.look.dx = 3; p.look.dy = 4;
    p.lookStep(1 / 60);
    expect(seen).toEqual([[3, 4]]);
    expect(p.yaw).toBe(yaw);
  });

  test('drive, sail, gull and dive call mouseLook; the touch drag calls touchLook; ippon has no mouse look', () => {
    const files = {
      player: src('src/anime/core/player.js'),
      drive: src('src/anime/world/explore/drive.js'),
      sail: src('src/anime/world/explore/sail.js'),
      gull: src('src/anime/play/gull/index.js'),
      dive: src('src/anime/play/underwater/index.js'),
      touch: src('src/anime/ui/touchpad.js'),
      ippon: src('src/anime/play/ippon/index.js'),
    };
    for (const name of ['player', 'drive', 'sail', 'gull', 'dive']) expect(files[name]).toContain('mouseLook(');
    expect(files.player).toContain('lookBlocked()');
    expect(files.player).toContain('lookWhileDisabled');
    expect(files.dive).toContain('lookWhileDisabled = true');
    expect(files.touch).toContain('touchLook(');
    expect(files.ippon).not.toContain('mouseLook(');
    expect(files.ippon).not.toContain('movementX');
    expect(files.drive).not.toContain('movementX * 0.004');
    expect(files.sail).not.toContain('movementY * 0.003');
    expect(files.gull).not.toContain('const sens = 0.0022');
    expect(files.dive).not.toContain('0.0016');
  });
});

describe('look setting: the sheet', () => {
  function sheet(lang = 'ja') {
    const dom = makeDom();
    const ui = dom.document.createElement('div');
    ui.id = 'klc-ui';
    ui.setAttribute('lang', lang);
    const btn = dom.document.createElement('button');
    btn.setAttribute('data-act', 'padset');
    ui.appendChild(btn);
    dom.document.body.appendChild(ui);
    const settings = { leftHanded: false, invertY: false, speed: 1, sens: 1, coach: false };
    const set = (k, v) => {
      if (k === 'speed' || k === 'sens') { settings.speed = clampSpeed(v); settings.sens = settings.speed; setLook({ speed: settings.speed }, { persist: false }); }
      else { settings[k] = !!v; if (k === 'invertY') setLook({ invertY: settings.invertY }, { persist: false }); }
    };
    let exited = 0;
    dom.document.pointerLockElement = { locked: true };
    dom.document.exitPointerLock = () => { exited += 1; dom.document.pointerLockElement = null; };
    const desk = openDesktopLook(dom.document, { get: () => settings, set });
    return { dom, desk, settings, btn, exited: () => exited };
  }

  test('labels, the readout, arrows, Tab and Esc', () => {
    const { dom, desk, settings, btn } = sheet('ja');
    expect(desktopLookOpen()).toBe(true);
    expect(lookBlocked()).toBe(true);
    expect(desk.querySelector('#klc-look-title').textContent).toBe('操作設定');
    expect(desk.textContent).toContain('視点の速さ');
    expect(desk.textContent).toContain('上下を反転');
    const range = desk.querySelector('input[type="range"]');
    expect(range.getAttribute('min')).toBe('0.3');
    expect(range.getAttribute('max')).toBe('2.5');
    expect(range.getAttribute('step')).toBe('0.1');
    expect(desk.querySelector('output').textContent).toBe('1.0×');
    expect(dom.document.activeElement).toBe(range);
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    dom.fire(range, 'keydown', { key: 'ArrowRight', code: 'ArrowRight' });
    expect(settings.speed).toBe(1.1);
    expect(desk.querySelector('output').textContent).toBe('1.1×');
    expect(range.getAttribute('aria-valuetext')).toBe('1.1×');
    expect(getLook().speed).toBe(1.1);

    dom.fire(range, 'keydown', { key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(settings.speed).toBe(1);
    expect(desk.querySelector('output').textContent).toBe('1.0×');

    const items = desk.querySelectorAll('button, input');
    dom.fire(range, 'keydown', { key: 'Tab', code: 'Tab' });
    expect(dom.document.activeElement).toBe(items[0]);
    dom.fire(items[0], 'keydown', { key: 'Tab', code: 'Tab', shiftKey: true });
    expect(dom.document.activeElement).toBe(range);

    const sw = desk.querySelector('[data-set="invertY"]');
    dom.fire(sw, 'click', {});
    expect(settings.invertY).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(getLook().invertY).toBe(true);

    let bubbled = false;
    dom.document.addEventListener('keydown', () => { bubbled = true; });
    dom.fire(range, 'keydown', { key: 'Escape', code: 'Escape' });
    expect(bubbled).toBe(false);
    expect(desk.hidden).toBe(true);
    expect(lookBlocked()).toBe(false);
    expect(desktopLookOpen()).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(dom.document.activeElement).toBe(btn);
  });

  test('English labels, and a pointer outside closes it', () => {
    const { dom, desk } = sheet('en');
    expect(desk.querySelector('#klc-look-title').textContent).toBe('Controls');
    expect(desk.textContent).toContain('Look speed');
    expect(desk.textContent).toContain('Invert Y');
    const away = dom.document.createElement('button');
    dom.document.body.appendChild(away);
    dom.fire(away, 'pointerdown', {});
    expect(desk.hidden).toBe(true);
    expect(lookBlocked()).toBe(false);
  });

  test('opening drops pointer lock', () => {
    const s = sheet('ja');
    expect(s.exited()).toBe(1);
    expect(s.dom.document.pointerLockElement).toBe(null);
    closeDesktopLook();
  });
});
