// [feel] The probe's measurements (tools/anime/feel-metrics.mjs) against synthetic motion with known answers.
import { test, expect, describe } from "bun:test";
import { FIELDS, toFrames, startResponse, stopResponse, turnResponse, cameraMetrics, footMetrics, stepMetrics, inputHeading, idealCam, jitter } from "../tools/anime/feel-metrics.mjs";

/** Frames of a body on a straight line along -z (yaw 0), its speed driven by `speed(t)`, facing by `face(t)`, the camera on its ideal spot. */
function synth({ dur = 3, hz = 60, speed, face = () => 0, input = () => [1, 0], camOff = () => [0, 0, 0], feet = null, y = () => 0 }) {
  const frames = [];
  let z = 0, v = 0;
  for (let i = 0; i <= dur * hz; i++) {
    const t = i / hz;
    v = speed(t, v, 1 / hz);
    if (i) z -= v / hz;
    const [inF, inS] = input(t);
    const f = { t, dt: 1 / hz, alpha: 1, px: 0, py: y(t), pz: z, vx: 0, vz: -v, vy: 0, gnd: 1, fly: 0, yaw: 0, pitch: 0, rx: 0, ry: y(t), rz: z, rface: face(t),
      lx: 0, ly: 0, lz: -1, inF, inS, run: 0, boom: 4.5, top: 0.1, bot: -0.1, clip: 1, simT: t, water: 0, ground: 0 };
    const I = idealCam(f); const o = camOff(t);
    f.cx = I.x + o[0]; f.cy = I.y + o[1]; f.cz = I.z + o[2];
    const ft = feet ? feet(t, z) : { R: [0.1, 0, z], L: [-0.1, 0.05, z] };
    [f.fRx, f.fRy, f.fRz] = ft.R; [f.fLx, f.fLy, f.fLz] = ft.L;
    frames.push(f);
  }
  return frames;
}

describe("feel metrics", () => {
  test("FIELDS round-trip through a flat array, null -> NaN", () => {
    const flat = FIELDS.map((_, i) => (i === 13 ? null : i));
    const [f] = toFrames(flat);
    expect(f.t).toBe(0); expect(Number.isNaN(f.rx)).toBe(true); expect(f.ground).toBe(FIELDS.indexOf('ground'));
  });

  test("an exponential approach at rate 10 /s reaches 90 % in ln(10)/10 = 0.230 s and 50 % in 0.069 s", () => {
    const fr = synth({ speed: (t, v, dt) => v + (3.1 - v) * (1 - Math.exp(-10 * dt)) });
    const r = startResponse(fr, 0, fr.length);
    expect(r.steady).toBeCloseTo(3.1, 2);
    expect(Math.abs(r.t90 - Math.log(10) / 10)).toBeLessThan(1 / 60 + 1e-9);
    expect(Math.abs(r.t50 - Math.log(2) / 10)).toBeLessThan(1 / 60 + 1e-9);
    expect(r.firstMoveFrames).toBe(1);
  });

  test("a stop from 3.1 m/s at rate 10 /s: under 5 % after ln(20)/10 = 0.30 s, a slide of 0.31 m, no overshoot", () => {
    const fr = synth({ speed: (t, v, dt) => (t < 1 ? 3.1 : v * Math.exp(-10 * dt)), input: (t) => (t < 1 ? [1, 0] : [0, 0]) });
    const a = fr.findIndex((f) => f.inF === 0);
    const r = stopResponse(fr, a, fr.length);
    expect(Math.abs(r.tStop - Math.log(20) / 10)).toBeLessThan(1 / 60 + 1e-9);
    expect(r.slide).toBeGreaterThan(0.28); expect(r.slide).toBeLessThan(0.32);
    expect(r.overshoot).toBeLessThan(1e-3);
  });

  test("a 180° that eases in 0.15 s is measured within a frame; a body that never turns is 'never' and walks backwards", () => {
    const flip = 1;
    const ease = (t) => (t < flip ? 0 : Math.PI * Math.min(1, (t - flip) / 0.15));
    const fr = synth({ speed: () => 2, face: ease, input: (t) => (t < flip ? [1, 0] : [-1, 0]) });
    const a = fr.findIndex((f) => f.inF < 0);
    const r = turnResponse(fr, a, fr.length);
    expect(r.swingDeg).toBeCloseTo(180, 0);
    expect(r.tTurn).toBeGreaterThan(0.12); expect(r.tTurn).toBeLessThanOrEqual(0.15 + 1e-9);   // within 10° at 0.142 s: the next frame is 0.150
    const still = synth({ speed: (t) => (t < flip ? 2 : -2), input: (t) => (t < flip ? [1, 0] : [-1, 0]) });
    const b = still.findIndex((f) => f.inF < 0);
    const s = turnResponse(still, b, still.length);
    expect(s.tTurn).toBeNull();
    expect(s.backwardsShare).toBe(1);
  });

  test("input heading: forward is the yaw, back is yaw + 180°, right is yaw - 90°", () => {
    expect(inputHeading({ inF: 1, inS: 0, yaw: 0.3 })).toBeCloseTo(0.3, 9);
    expect(Math.abs(inputHeading({ inF: -1, inS: 0, yaw: 0 }))).toBeCloseTo(Math.PI, 9);
    expect(inputHeading({ inF: 0, inS: 1, yaw: 0 })).toBeCloseTo(-Math.PI / 2, 9);
    expect(inputHeading({ inF: 0, inS: 0, yaw: 0 })).toBeNull();
  });

  test("camera lag is the distance to the ideal spot; a 2 cm, 12 Hz shake shows as jitter (~114 m/s² peak), a smooth camera as ~0", () => {
    const smooth = synth({ speed: () => 3, camOff: () => [0, 0, 0.3] });
    const c = cameraMetrics(smooth, 0, smooth.length);
    expect(c.lagMean).toBeCloseTo(0.3, 3);
    expect(c.jitter.rms).toBeLessThan(0.01);
    const shaky = synth({ speed: () => 3, camOff: (t) => [0, 0.02 * Math.sin(2 * Math.PI * 12 * t), 0] });
    const s = cameraMetrics(shaky, 0, shaky.length);
    expect(s.jitter.rmsY).toBeGreaterThan(40);   // 0.02 * (2π·12)² = 114 peak, ~80 rms, minus what the ±0.1 s mean keeps
    expect(jitter([]).rms).toBeNaN();
  });

  test("feet: a planted foot that moves with the ground has zero slip; one dragged along at the body's speed has slip share 1", () => {
    const hz = 60, cad = 2, stride = 1.5 / cad;   // 1.5 m/s, 2 cycles/s
    // the right foot plants for the first half of each cycle (fixed in the world), the left the second half
    const planted = (t, z) => {
      const ph = (t * cad) % 1, c0 = Math.floor(t * cad);
      const zR = ph < 0.5 ? -(c0 * stride) : z, zL = ph >= 0.5 ? -(c0 * stride + stride / 2) : z;
      return { R: [0.1, ph < 0.5 ? 0 : 0.1, zR], L: [-0.1, ph >= 0.5 ? 0 : 0.1, zL] };
    };
    const fr = synth({ dur: 3, hz, speed: () => 1.5, feet: planted });
    const m = footMetrics(fr, 1, fr.length);
    expect(m.slipMean).toBeLessThan(0.15);   // a frame at each hand-over is the only motion of the lower foot
    const dragged = synth({ dur: 3, hz, speed: () => 1.5 });
    const d = footMetrics(dragged, 1, dragged.length);
    expect(d.slipShare).toBeCloseTo(1, 2);
  });

  test("steps: a 0.3 m snap is a 0.3 m per-frame jump; an eased 0.3 m rise over 0.15 s peaks at 5 cm a frame (smoothstep: 1.5x the mean slope)", () => {
    const snap = synth({ speed: () => 2, y: (t) => (t < 1 ? 0 : 0.3) });
    expect(stepMetrics(snap, 0, snap.length).bodyMaxDy).toBeCloseTo(0.3, 3);
    const eased = synth({ speed: () => 2, y: (t) => { const u = Math.min(1, Math.max(0, (t - 1) / 0.15)); return 0.3 * u * u * (3 - 2 * u); } });
    const e = stepMetrics(eased, 0, eased.length);
    expect(e.bodyMaxDy).toBeLessThan(0.0501);
    expect(e.climbed).toBeCloseTo(0.3, 3);
  });
});
