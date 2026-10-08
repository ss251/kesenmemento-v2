// A manual clock for unit tests of code that is a timer and a next-frame callback (the veil, ui/veil.js): nothing runs until the test moves time.
//
//   const clk = manualClock();  clk.setTimeout / clk.clearTimeout / clk.raf  (hand them to the code under test)
//   clk.tick(ms)     move time forward and run the timers that are due, in order      clk.frame()    run the callbacks that asked for the next frame
//   clk.advance(ms)  tick, then frame        clk.now / clk.timers (Map id -> { f, at }) / clk.frames (array)
export function manualClock() {
  let now = 0, id = 0; const timers = new Map(), frames = [];
  const api = {
    get now() { return now; }, timers, frames,
    setTimeout: (f, ms) => { timers.set(++id, { f, at: now + ms }); return id; },
    clearTimeout: (i) => { timers.delete(i); },
    raf: (f) => { frames.push(f); },
    tick(ms) { now += ms; for (const [i, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) if (t.at <= now) { timers.delete(i); t.f(); } },
    frame() { const fs = frames.splice(0); for (const f of fs) f(); },
    advance(ms) { api.tick(ms); api.frame(); },
  };
  return api;
}
