// [perf] The four scripted scenarios, run inside the page (tools/perf/run.mjs and wk-run.mjs evaluate this file once, after the town is
// ready and started). Input goes through the app's own paths: key events on window (W, Shift: the walker and the car read them), the
// player's yaw (what the mouse turns), explore's driveAt (the car's spawn), the tour's film path and the player's setPose (the drone).
//
//   window.__perfScn.setup('walk' | 'drive' | 'drone' | 'turn')   then every frame the scenario steers (a ctx.onUpdate of its own)
//   window.__perfScn.stop() -> what the scenario did: metres walked, km driven, stuck recoveries, the camera's path length
//
// walk   on foot (Shift: running, 6.4 m/s) along the streets of the inner bay: follows the road ahead (explore's road net), turns away
//        when blocked, and heads back toward the bay when it strays more than 420 m from it
// drive  the kei car from the inner bay, W held, the car's own lane assist following the road; stuck for 2 s -> the next spawn point
// drone  the film path (tour.filmPose: high over the bay, down the inner bay, 浮見堂, Pier 7, up to the whole bay), 30 s out and 30 s back
// turn   the opening drone view (the tour's hero framing), the view turned through a full 360 degrees in 60 s
(() => {
  if (window.__perfScn) return 'again';
  const ctx = window.__ctx, P = ctx.playerObj, E = window.__explore, life = window.__life;
  const DEG = Math.PI / 180;
  const held = new Set();
  const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Shift') ? 'Shift' : code, bubbles: true }));
  const hold = (code) => { if (!held.has(code)) { held.add(code); key(code, true); } };
  const releaseAll = () => { for (const c of [...held]) { held.delete(c); key(c, false); } };
  const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
  const BAY = { x: 180, z: -20 };
  // spawn points around the inner bay (x, z, yaw degrees), taken in turn after a stuck
  const SPAWNS = [[168, -122, 111], [60, 60, 200], [330, -80, 250], [-40, -40, 80], [250, 120, 160], [120, -200, 20]];
  const S = { name: null, t: 0, tick: null, stuck: 0, spawnI: 0, path: 0, lastCam: null, chk: null, info: {} };

  function reset() {
    releaseAll();
    try { if (E?.drive?.active) E.drive.exit(); } catch (e) { /* none */ }
    try { life?.tour?.stop?.(); } catch (e) { /* none */ }
    try { if (ctx.planet?.active) ctx.planet.exit(); } catch (e) { /* none */ }
    S.t = 0; S.stuck = 0; S.spawnI = 0; S.path = 0; S.lastCam = null; S.chk = null; S.info = {};
  }
  function walkSpawn(i) {
    const [x, z, yd] = SPAWNS[i % SPAWNS.length];
    const sp = E?.net?.spawn(x, z, yd * DEG);
    P.fly = false;
    if (sp) P.setPose(sp.x, sp.z, sp.yaw / DEG, 0); else P.setPose(x, z, yd, 0);
  }

  const SC = {
    walk: {
      setup() { walkSpawn(0); hold('KeyW'); hold('ShiftLeft'); S.info.d0 = P.distance; },
      tick(dt) {
        const p = P.pos;
        let want = null;
        if (Math.hypot(p.x - BAY.x, p.z - BAY.z) > 420) want = yawTo(p.x, p.z, BAY.x, BAY.z);
        else { const a = E?.net?.ahead(p.x, p.z, P.yaw, 5); if (a) want = yawTo(p.x, p.z, a.x + a.dx * 3, a.z + a.dz * 3); }
        if (want !== null) P.yaw += Math.max(-2 * dt, Math.min(2 * dt, wrapPi(want - P.yaw)));
        // stuck: under 1 m in 1.5 s -> turn a quarter; three times in a row -> the next spawn point
        if (!S.chk) S.chk = { t: S.t, x: p.x, z: p.z, n: 0 };
        if (S.t - S.chk.t > 1.5) {
          const moved = Math.hypot(p.x - S.chk.x, p.z - S.chk.z);
          if (moved < 1) { S.stuck++; S.chk.n++; P.yaw += Math.PI / 2; if (S.chk.n >= 3) { S.spawnI++; walkSpawn(S.spawnI); S.chk.n = 0; } } else S.chk.n = 0;
          S.chk.t = S.t; S.chk.x = p.x; S.chk.z = p.z;
        }
      },
      done() { return { walkedM: Math.round(P.distance - S.info.d0), stuck: S.stuck, respawns: S.spawnI }; },
    },
    drive: {
      setup() {
        const [x, z, yd] = SPAWNS[0];
        S.info.ok = !!E?.driveAt?.(x, z, yd); hold('KeyW'); S.info.km0 = E?.drive?.state?.km ?? 0; S.info.slow = 0;
      },
      tick(dt) {
        const D = E?.drive; if (!D) return;
        const s = D.state;
        S.info.slow = Math.abs(s.speed) < 0.5 ? S.info.slow + dt : 0;
        const far = Math.hypot(s.x - BAY.x, s.z - BAY.z) > 700;
        if (S.info.slow > 2 || far || !D.active) {
          S.stuck++; S.spawnI++;
          const [x, z, yd] = SPAWNS[S.spawnI % SPAWNS.length];
          // (enter, not driveAt: driveAt settles every wanted tile at once, a multi-second stall that belongs to the screenshot tools)
          if (D.active) D.exit();
          D.enter({ x, z, yaw: yd * DEG }); S.info.slow = 0;
        }
      },
      done() { const s = E?.drive?.state; return { ok: S.info.ok, km: s ? +(s.km - S.info.km0).toFixed(3) : null, respawns: S.stuck }; },
    },
    drone: {
      setup() { P.fly = true; life.tour.applyFilm(0, 30); },
      tick() { const u = S.t % 60; life.tour.applyFilm(u < 30 ? u : 60 - u, 30); },
      done() { return {}; },
    },
    turn: {
      setup() {
        const hd = life.tour.stops.find((s) => s.id === 'hero')?.drone;
        const dx = hd.look[0] - hd.pos[0], dy = hd.look[1] - hd.pos[1], dz = hd.look[2] - hd.pos[2];
        S.info.pose = { x: hd.pos[0], y: hd.pos[1], z: hd.pos[2], yaw: Math.atan2(-dx, -dz) / DEG, pitch: Math.atan2(dy, Math.hypot(dx, dz)) / DEG };
        P.fly = true; const q = S.info.pose; P.setPose(q.x, q.z, q.yaw, q.pitch, q.y);
      },
      tick() { const q = S.info.pose; P.setPose(q.x, q.z, q.yaw + 360 * (S.t / 60), q.pitch, q.y); },
      done() { return { turnedDeg: Math.round(360 * S.t / 60) }; },
    },
  };

  const fn = (dt) => {
    if (!S.tick || !(dt > 0)) return;
    S.t += dt;
    S.tick(dt);
    const c = ctx.camera.position;
    if (S.lastCam) S.path += Math.hypot(c.x - S.lastCam[0], c.y - S.lastCam[1], c.z - S.lastCam[2]);
    S.lastCam = [c.x, c.y, c.z];
  };
  ctx.onUpdate(fn); fn.__mod = 'harness';
  window.__perfScn = {
    setup(name) { const sc = SC[name]; if (!sc) throw new Error('no scenario ' + name); reset(); S.name = name; sc.setup(); S.tick = sc.tick; return name; },
    stop() { const sc = SC[S.name]; const out = { scenario: S.name, simSecs: +S.t.toFixed(2), cameraPathM: Math.round(S.path), ...(sc ? sc.done() : {}) }; S.tick = null; releaseAll(); return out; },
    get state() { return { name: S.name, t: S.t, stuck: S.stuck }; },
  };
  return 'ok';
})();
