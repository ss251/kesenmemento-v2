// [ui-c2] Wait until the browser has painted what the page just wrote, so a label or a card is on the glass BEFORE a long task blocks the main thread.
//
// `await new Promise((r) => setTimeout(r, 0))` is not enough: a timer can run before the next rendering opportunity, and the heavy task that follows then starts first (the loading
// label and the photo card never showed). requestAnimationFrame runs at the start of the next frame's rendering; a timer queued from it runs after that frame has been committed.
// A hidden tab never gets frames, so a plain timer is the backstop: this never waits longer than `cap` ms.
//
//   await afterPaint();          // up to 120 ms
//   await afterPaint(40);

/** Resolves after the next frame has been presented, or after `cap` ms, whichever comes first. `env` is injectable for tests ({ raf, timeout }). */
export function afterPaint(cap = 120, env = {}) {
  const raf = env.raf ?? (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
  const timeout = env.timeout ?? setTimeout;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    if (raf) { try { raf(() => timeout(finish, 0)); } catch { /* no frames: the backstop below */ } }
    timeout(finish, cap);
  });
}
