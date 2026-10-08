// [ui-c] Row 10: sound on an iPhone (src/anime/core/audio-session.js, mobile review F12 / T6): the audio session type, the silent-element
// fallback for an older iOS, and resuming the AudioContext from a touch. Driven with fakes (no device, no AudioContext); the wiring into
// core/audio.js is pinned; the resume-on-touch in a real browser is checked by tools/anime/ui-c-check.mjs --steps survive.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createAudioSession, silentWavBytes, silentWavUri, isIOS, GESTURES } from "../src/anime/core/audio-session.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

const fakeAudioEl = () => ({ paused: true, plays: 0, pauses: 0, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, play() { this.paused = false; this.plays++; return Promise.resolve(); }, pause() { this.paused = true; this.pauses++; } });
const fakeAc = (state = "suspended") => ({ state, resumed: 0, resume() { this.resumed++; return Promise.resolve(); } });

describe("the silent clip (the older-iOS fallback)", () => {
  test("a valid mono 16-bit PCM WAV of zeros: header fields add up, every sample is 0", () => {
    const b = silentWavBytes(120, 8000), v = new DataView(b.buffer), ascii = (o, n) => String.fromCharCode(...b.slice(o, o + n));
    const n = Math.round(8000 * 0.12);
    expect(b.length).toBe(44 + n * 2);
    expect([ascii(0, 4), ascii(8, 4), ascii(12, 4), ascii(36, 4)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint32(4, true)).toBe(b.length - 8); expect(v.getUint32(40, true)).toBe(n * 2);
    expect(v.getUint16(20, true)).toBe(1); expect(v.getUint16(22, true)).toBe(1); expect(v.getUint32(24, true)).toBe(8000); expect(v.getUint32(28, true)).toBe(16000); expect(v.getUint16(34, true)).toBe(16);
    expect(b.slice(44).every((x) => x === 0)).toBe(true);
  });
  test("as a data: URI it decodes back to the same bytes", () => {
    const uri = silentWavUri(50, 8000);
    expect(uri.startsWith("data:audio/wav;base64,")).toBe(true);
    expect([...Buffer.from(uri.slice(22), "base64")]).toEqual([...silentWavBytes(50, 8000)]);
  });
});

describe("isIOS", () => {
  test("an iPhone and an iPad are; a desktop-mode iPad (Macintosh with touch points) is; a Mac, an Android phone and nothing are not", () => {
    expect(isIOS({ userAgent: IPHONE })).toBe(true);
    expect(isIOS({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15" })).toBe(true);
    expect(isIOS({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
    expect(isIOS({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
    expect(isIOS(null)).toBe(false); expect(isIOS({})).toBe(false);
  });
});

describe("apply(): the audio session", () => {
  test("where Safari has navigator.audioSession the type becomes playback, and nothing else is started", () => {
    const nav = { userAgent: IPHONE, audioSession: { type: "auto" } }, made = [];
    const s = createAudioSession({ nav, doc: null, win: null, makeAudio: () => { const a = fakeAudioEl(); made.push(a); return a; } });
    expect(s.apply()).toBe("playback");
    expect(nav.audioSession.type).toBe("playback");
    expect(s.stats).toMatchObject({ supported: true, type: "playback", fallback: false, error: null });
    expect(made.length).toBe(0); expect(s.silent).toBeNull();
  });
  test("already playback: left alone; the desktop (no API, not iOS): nothing happens at all", () => {
    const nav = { userAgent: IPHONE, audioSession: { _t: "playback", get type() { return this._t; }, set type(v) { throw new Error("must not be set again"); } } };
    expect(createAudioSession({ nav, doc: null, win: null }).apply()).toBe("playback");
    const made = [];
    const d = createAudioSession({ nav: { userAgent: MAC, maxTouchPoints: 0 }, doc: null, win: null, makeAudio: () => (made.push(1), fakeAudioEl()) });
    expect(d.apply()).toBeNull(); expect(d.stats).toMatchObject({ supported: false, fallback: false }); expect(made.length).toBe(0);
  });
  test("an older iOS (no audioSession): a silent looping <audio> element plays from the gesture that started the sound", () => {
    const el = fakeAudioEl();
    const s = createAudioSession({ nav: { userAgent: IPHONE, maxTouchPoints: 5 }, doc: null, win: null, makeAudio: () => el, isHidden: () => false });
    s.apply();
    expect(s.stats.fallback).toBe(true); expect(s.silent).toBe(el);
    expect(el.loop).toBe(true); expect(el.src.startsWith("data:audio/wav;base64,")).toBe(true); expect(el.controls).toBe(false); expect(el.disableRemotePlayback).toBe(true);
    expect(el.attrs).toMatchObject({ "x-webkit-airplay": "deny", playsinline: "" });
    expect(el.plays).toBe(1); expect(el.paused).toBe(false);
    s.apply(); expect(el.plays).toBe(1);   // once
  });
  test("an audioSession that refuses the assignment on an iPhone falls back to the silent element and records why", () => {
    const el = fakeAudioEl();
    const nav = { userAgent: IPHONE, audioSession: { get type() { return "auto"; }, set type(v) { throw new Error("NotAllowedError"); } } };
    const s = createAudioSession({ nav, doc: null, win: null, makeAudio: () => el, isHidden: () => false });
    s.apply();
    expect(s.stats.error).toContain("NotAllowedError"); expect(s.stats.fallback).toBe(true); expect(el.plays).toBe(1);
  });
  test("no Audio constructor (a test runner, a very old browser) is not an error", () => {
    const s = createAudioSession({ nav: { userAgent: IPHONE }, doc: null, win: null, makeAudio: () => null });
    expect(() => s.apply()).not.toThrow(); expect(s.stats.fallback).toBe(false);
  });
});

describe("sync(): the silent element follows the sound", () => {
  test("it plays while there is sound to hear, pauses when muted or hidden, and plays again when both are over", () => {
    const el = fakeAudioEl(); let muted = false, hidden = false;
    const s = createAudioSession({ nav: { userAgent: IPHONE }, doc: null, win: null, makeAudio: () => el, isMuted: () => muted, isHidden: () => hidden });
    s.apply(); expect(el.paused).toBe(false);
    muted = true; s.sync(); expect(el.paused).toBe(true); expect(el.pauses).toBe(1);
    s.sync(); expect(el.pauses).toBe(1);   // not paused twice
    muted = false; hidden = true; s.sync(); expect(el.paused).toBe(true);
    hidden = false; s.sync(); expect(el.paused).toBe(false); expect(el.plays).toBe(2);
  });
  test("a play() the browser rejects, or throws, never escapes", () => {
    const el = fakeAudioEl(); el.play = () => Promise.reject(new Error("NotAllowedError"));
    const s = createAudioSession({ nav: { userAgent: IPHONE }, doc: null, win: null, makeAudio: () => el, isHidden: () => false });
    expect(() => s.apply()).not.toThrow();
    const el2 = fakeAudioEl(); el2.play = () => { throw new Error("boom"); };
    const s2 = createAudioSession({ nav: { userAgent: IPHONE }, doc: null, win: null, makeAudio: () => el2, isHidden: () => false });
    expect(() => s2.apply()).not.toThrow(); expect(s2.stats.error).toContain("boom");
  });
});

describe("resume(): a touch brings the sound back", () => {
  const mk = (ac, over = {}) => createAudioSession({ nav: null, doc: null, win: null, getContext: () => ac, isMuted: () => false, isHidden: () => false, ...over });
  test("a context that is suspended or interrupted (a call, Siri, the lock screen) is resumed; one that runs, is closed or does not exist is left alone", () => {
    for (const state of ["suspended", "interrupted"]) { const ac = fakeAc(state), s = mk(ac); expect(s.resume()).toBe(true); expect(ac.resumed).toBe(1); expect(s.stats.resumes).toBe(1); }
    for (const state of ["running", "closed"]) { const ac = fakeAc(state), s = mk(ac); expect(s.resume()).toBe(false); expect(ac.resumed).toBe(0); }
    expect(mk(null).resume()).toBe(false);
  });
  test("not while muted (the mute suspended it on purpose) and not while the page is hidden", () => {
    const a = fakeAc("suspended"); expect(mk(a, { isMuted: () => true }).resume()).toBe(false); expect(a.resumed).toBe(0);
    const b = fakeAc("suspended"); expect(mk(b, { isHidden: () => true }).resume()).toBe(false); expect(b.resumed).toBe(0);
  });
  test("a resume() that rejects or throws is swallowed", () => {
    const rej = fakeAc("suspended"); rej.resume = () => Promise.reject(new Error("InvalidStateError"));
    expect(() => mk(rej).resume()).not.toThrow();
    const thr = fakeAc("suspended"); thr.resume = () => { throw new Error("boom"); };
    const s = mk(thr); expect(() => s.resume()).not.toThrow(); expect(s.stats.error).toContain("boom");
  });
});

describe("arm(): listening for the gestures", () => {
  test("touchend, pointerup, click and keydown are listened for on the document in the capture phase, passively (the touch pad cannot swallow them), plus pageshow on the window", () => {
    const seen = [];
    const doc = { addEventListener: (t, f, o) => seen.push([t, o]), removeEventListener() {} }, win = { addEventListener: (t) => seen.push([t, "win"]), removeEventListener() {} };
    const s = createAudioSession({ nav: null, doc, win });
    s.arm(); s.arm();   // once
    expect(seen.filter(([, o]) => o !== "win").map(([t]) => t)).toEqual(GESTURES);
    for (const [, o] of seen.filter(([, o]) => o !== "win")) expect(o).toEqual({ capture: true, passive: true });
    expect(seen.filter(([, o]) => o === "win").map(([t]) => t)).toEqual(["pageshow"]);
    expect(GESTURES).toContain("touchend");   // iOS counts touchend (not touchstart) as the activation that may resume audio
  });
  test("a touch resumes a suspended context, re-asserts the playback session, and plays the silent element; once it runs, a touch does nothing", () => {
    const doc = new EventTarget(), win = new EventTarget(), ac = fakeAc("interrupted"), el = fakeAudioEl();
    const nav = { userAgent: IPHONE, audioSession: { type: "auto" } };
    const s = createAudioSession({ nav, doc, win, getContext: () => ac, isMuted: () => false, isHidden: () => false, makeAudio: () => el });
    s.apply(); s.arm();
    nav.audioSession.type = "ambient";             // something changed it
    doc.dispatchEvent(new Event("touchend"));
    expect(ac.resumed).toBe(1); expect(nav.audioSession.type).toBe("playback");
    ac.state = "running";
    doc.dispatchEvent(new Event("pointerup")); doc.dispatchEvent(new Event("click")); doc.dispatchEvent(new Event("keydown"));
    expect(ac.resumed).toBe(1);
    ac.state = "suspended"; win.dispatchEvent(new Event("pageshow"));   // back from the page cache
    expect(ac.resumed).toBe(2);
  });
  test("disarm() stops listening", () => {
    const doc = new EventTarget(), win = new EventTarget(), ac = fakeAc("suspended");
    const s = createAudioSession({ nav: null, doc, win, getContext: () => ac });
    s.arm(); s.disarm();
    doc.dispatchEvent(new Event("touchend"));
    expect(ac.resumed).toBe(0); expect(s.stats.armed).toBe(false);
  });
  test("the context is read when the touch happens, so arm() may run before the AudioContext exists", () => {
    const doc = new EventTarget(); let ac = null;
    const s = createAudioSession({ nav: null, doc, win: null, getContext: () => ac });
    s.arm();
    doc.dispatchEvent(new Event("touchend"));         // no context yet: nothing
    ac = fakeAc("suspended"); doc.dispatchEvent(new Event("touchend"));
    expect(ac.resumed).toBe(1);
  });
});

describe("core/audio.js wiring", () => {
  const src = read("src/anime/core/audio.js");
  test("start() sets the session before the AudioContext is created, arms the touch listeners, and never does either for a context handed in (headless render tests)", () => {
    expect(src).toContain("import { createAudioSession } from './audio-session.js';");
    const iApply = src.indexOf("session.apply()"), iNew = src.indexOf("ac = new AC({ latencyHint: 'balanced' })");
    expect(iApply).toBeGreaterThan(0); expect(iNew).toBeGreaterThan(iApply);
    const iCtx = src.indexOf("if (O.context) ac = O.context;"), iMake = src.indexOf("session = createAudioSession({ getContext: () => ac, isMuted: () => muted, isHidden: hidden });");
    expect(iCtx).toBeGreaterThan(0); expect(iMake).toBeGreaterThan(iCtx);   // inside the else branch: a context handed in never gets a session
    expect(iMake).toBeLessThan(iApply);
    expect(src).toContain("session.apply(); session.arm();")
  });
  test("muting and unmuting re-syncs the silent element; the engine reports its session (the ?dbg=1 strip prints it)", () => {
    expect(src).toMatch(/function applyMute\(\) \{[\s\S]*?session\?\.sync\(\)/);
    expect(src).toContain("get session() { return session ? session.stats : null; }");
  });
  test("the existing visibilitychange handler is still there (suspend when hidden, resume when shown)", () => {
    expect(src).toContain("document.addEventListener('visibilitychange'");
    expect(src).toContain("if (hidden()) { ac.suspend().catch(() => {}); cancelSpeech(); } else if (!muted) ac.resume().catch(() => {});");
  });
});
