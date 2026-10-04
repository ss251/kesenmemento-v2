// [ship:acts] ACT 2, 漁: a stylised North Atlantic around 第一昭福丸. The ground is the real one only in words:
// 「北大西洋 西経10度以西・北緯42度以北 / 8月〜1月の漁期」 (ICCAT: large-scale longliners may fish west of 10°W and north
// of 42°N from 1 Aug to 31 Jan). There are NO coordinates and no map position: on demo day she is genuinely out there.
//
// While the ocean is shown the town is HIDDEN (every world group set invisible, never stacked: the ocean is built when
// it is entered and freed when it is left), the sky and the cel materials are reused, the palette is cold, the swells
// long, the sun low.
//
//   - SET (投縄) from the stern: a radio buoy (red flag and lamp), orange floats (one per 300 m of line on the HUD;
//     one visual float per few km, time-compressed), the main line paying out over the stern roller;
//   - WAIT (縄待ち): the ship lies near the end buoy;
//   - HAUL (揚縄) at the STARBOARD forward 舷門 with the line hauler: the fish come up one by one, are swung in through
//     the opening, laid on the scale, then kept (tagged, bled and spiked, gills, guts and tail off, slid to the -60 °C freezer) or released;
//   - STOW: the freezer hatch, -60 °C, about 36 h to the core.
//
//   const oc = createOcean(ctx, { ship })    oc.enter({ heading }) / oc.exit() / oc.update(dt, t)
//   oc.setStage('set'|'wait'|'haul'|'stow')  oc.setLineKm(km)  oc.fishUp(fish) -> s  oc.decide('keep'|'release', tag)
//   oc.camera(stage) -> { pos, look }        swellAt(x, z, t) (pure, tested)
import * as THREE from 'three';

export const BUDGET = {
  high: { grid: 96, size: 900, floats: 24, tex: 512 },
  medium: { grid: 72, size: 800, floats: 20, tex: 512 },
  phone: { grid: 40, size: 600, floats: 14, tex: 256 },
};
const budgetFor = (q) => (q?.phone || q?.name === 'low' ? BUDGET.phone : q?.name === 'medium' ? BUDGET.medium : BUDGET.high);
/** The i18n keys the ocean scene shows (the UI renders them). */
export const OCEAN_LABEL_KEYS = ['ship.ocean.where', 'ship.ocean.nopos', 'ship.ocean.nopos.off', 'ship.ocean.seasonNote'];
/**
 * The sun in each stage (JST hour on the app's sun model). Source notes §5: the set runs 4-5 h from near dawn (the HUD clock
 * 05:30 -> 10:00), the 縄待ち soak 2-3 h (about 10:00-12:30, so the sky sits at 11:00), then the 10-12 h haul that
 * often ends at midnight (shown at 16:12 in the afternoon light; the night-haul variant lights it after dark).
 */
export const STAGE_HOURS = { set: 5.9, wait: 11.0, haul: 16.2, stow: 16.6 };
/** One visual float per this many km of line (500 real floats over 150 km would be a wall of orange). */
export const VISUAL_FLOAT_KM = 2.5;

// Long North Atlantic swells: [wavelength m, amplitude m, direction rad, phase]; deep-water speed sqrt(g L / 2 pi).
const SWELLS = [[140, 1.15, 0.35, 0.0], [85, 0.55, -0.4, 1.7], [46, 0.22, 1.1, 4.1], [23, 0.07, 0.2, 2.3]];
const G = 9.81;
/** Sea surface height at (x, z) and time t (pure). */
export function swellAt(x, z, t) {
  let h = 0;
  for (const [L, A, dir, ph] of SWELLS) {
    const k = (2 * Math.PI) / L, c = Math.sqrt((G * L) / (2 * Math.PI));
    h += A * Math.sin(k * (x * Math.cos(dir) + z * Math.sin(dir) - c * t) + ph);
  }
  return h;
}

const COLD = { deep: '#24465c', mid: '#355f77', crest: '#6d93a8', foam: '#dce7ec', far: '#3a5c70' };

// ------------------------------------------------------------------------------------------------ fish models
/** A cel tuna along +Z (head forward), fork length `fl` m. species: bluefin | bigeye | albacore. */
export function makeTuna(ctx, species = 'bluefin', fl = 2) {
  const g = new THREE.Group(); g.name = 'tuna-' + species;
  const prof = [];
  const n = 14;
  const fat = species === 'bigeye' ? 0.27 : species === 'albacore' ? 0.2 : 0.23;
  for (let i = 0; i <= n; i++) {
    const u = i / n;   // 0 = nose, 1 = tail stock
    const r = u < 0.32 ? fat * Math.sin((u / 0.32) * Math.PI / 2) ** 0.8 : fat * (1 - ((u - 0.32) / 0.68) ** 1.6) + 0.018 * ((u - 0.32) / 0.68);
    prof.push(new THREE.Vector2(Math.max(0.004, r), -u));
  }
  const body = new THREE.LatheGeometry(prof, 14);
  body.rotateX(-Math.PI / 2);   // axis along +Z, nose at z = 0 -> tail stock at z = -1
  body.translate(0, 0, 0.5);
  body.scale(0.62, 1, 1);
  // colours: navy back, a steel-blue band, silver belly
  const pos = body.attributes.position, col = new Float32Array(pos.count * 3);
  const back = new THREE.Color(species === 'albacore' ? '#2b3a5a' : '#1f2b46').convertSRGBToLinear(), band = new THREE.Color('#5e7fa6').convertSRGBToLinear(), belly = new THREE.Color('#dfe6ea').convertSRGBToLinear();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / fat;
    c.copy(y > 0.25 ? back : y > -0.05 ? band : belly);
    col.set([c.r, c.g, c.b], i * 3);
  }
  body.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const M = ctx.mat.toon('#ffffff', { vertexColors: true, noSnow: true });
  const dark = ctx.mat.toon('#1d2438', { side: 'double', noSnow: true });
  const yellow = ctx.mat.toon('#e8c547', { side: 'double', noSnow: true });
  g.add(new THREE.Mesh(body, M));
  // lunate tail
  const tail = new THREE.Shape();
  tail.moveTo(0, 0); tail.quadraticCurveTo(-0.12, 0.2, -0.2, 0.36); tail.quadraticCurveTo(-0.08, 0.16, -0.07, 0); tail.quadraticCurveTo(-0.08, -0.16, -0.2, -0.36); tail.quadraticCurveTo(-0.12, -0.2, 0, 0);
  const tg = new THREE.ShapeGeometry(tail, 6); tg.rotateY(Math.PI / 2);
  const tm = new THREE.Mesh(tg, dark); tm.position.set(0, 0, -0.48); g.add(tm);
  // dorsal + anal fins, pectorals (albacore: long), finlets
  const tri = (a, b, c2, m) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c2], 3)); geo.computeVertexNormals(); const me = new THREE.Mesh(geo, m); g.add(me); return me; };
  tri([0, fat * 0.95, 0.15], [0, fat * 1.9, 0.02], [0, fat * 0.9, -0.05], dark);
  tri([0, fat * 0.7, -0.12], [0, fat * 1.5, -0.2], [0, fat * 0.55, -0.24], yellow);   // second dorsal (yellowish on bluefin)
  tri([0, -fat * 0.7, -0.12], [0, -fat * 1.4, -0.2], [0, -fat * 0.55, -0.24], yellow);
  const pl = species === 'albacore' ? 0.42 : species === 'bigeye' ? 0.24 : 0.17;
  for (const s of [1, -1]) tri([s * fat * 0.55, 0, 0.3], [s * fat * 1.4, -fat * 0.2, 0.3 - pl], [s * fat * 0.55, -fat * 0.15, 0.22], dark);
  for (let i = 0; i < 6; i++) { const z = -0.27 - i * 0.032, h = fat * (0.42 - i * 0.05); for (const s of [1, -1]) tri([0, s * h, z], [0, s * (h + 0.04), z - 0.012], [0, s * h, z - 0.024], yellow); }
  // eye
  const eye = new THREE.Mesh(new THREE.SphereGeometry(species === 'bigeye' ? 0.03 : 0.022, 8, 6), ctx.mat.toon('#15161c', { noSnow: true }));
  for (const s of [1, -1]) { const e = eye.clone(); e.position.set(s * fat * 0.5, fat * 0.18, 0.39); g.add(e); }
  g.scale.setScalar(fl);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}
/** The blue catch-documentation strap tag (slide 72), looped round the tail stock. */
function makeTag(ctx) {
  const g = new THREE.Group(); g.name = 'demo-tag';
  const m = ctx.mat.toon('#2f6fd6', { noSnow: true });
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 4, 12), m));
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.14), m); plate.position.set(0, -0.08, -0.04); g.add(plate);
  return g;
}

// ------------------------------------------------------------------------------------------------ the ocean
/** Move a ship group directly (no sail): world pose on the group, the bob on top of it. */
export function shipRig(ship) {
  const g = ship.group;
  const R = {
    root: g, x: g.position.x, z: g.position.z, yaw: g.rotation.y,
    set(x, z, yaw) { R.x = x; R.z = z; R.yaw = yaw; g.position.set(x, g.position.y, z); g.rotation.set(g.rotation.x, yaw, g.rotation.z, 'YXZ'); g.updateMatrixWorld(true); },
    bob(y, pitch, roll) { g.position.y = y; g.rotation.set(pitch, R.yaw, roll, 'YXZ'); g.updateMatrixWorld(true); },
  };
  return R;
}
export function createOcean(ctx, { ship, rig = null }) {
  // the ship is moved through a rig (voyage.js: the sail's carrier when sailing exists, else the group itself)
  rig = rig || shipRig(ship);
  const B = budgetFor(ctx.quality);
  const S = { active: false, stage: null, built: false, lineKm: 0, floatsDropped: 0, heading: 0.22, fish: null, hidden: [], saved: null, t: 0, buoys: [] };
  let root = null, sea = null, ring = null, seaBase = null, floats = null, floatLines = null, hauler = null, scale = null, hatch = null, lineMesh = null, wake = null;
  const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _u = new THREE.Vector3(1, 1, 1);
  const V = (a, d) => (a?.isVector3 ? a.clone() : Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : a ? new THREE.Vector3(a.x, a.y, a.z) : d.clone());
  const GANG = () => V(ship.anchors?.gangwayStbd, new THREE.Vector3(-4.6, 3.1, 2.4));
  const STERN = () => V(ship.anchors?.sternSetting, new THREE.Vector3(0, 3.6, -28.8));

  // ---- hide / show the town (never stack the ocean on the town)
  function hideWorld() {
    const keep = new Set([root, ship.group, rig.root, ...(S.keep || [])]);
    const hide = (o) => { if (o && o.visible && !keep.has(o)) { S.hidden.push(o); o.visible = false; } };
    hide(ctx.staticRoot);
    for (const c of [...(ctx.dynamicRoot?.children || [])]) hide(c);
    for (const c of [...(ctx.scene?.children || [])]) if (c !== ctx.staticRoot && c !== ctx.dynamicRoot && !c.isLight && c.name !== 'sky' && c !== ctx.sky?.sun?.target && !keep.has(c)) hide(c);
    if (typeof document !== 'undefined') document.body?.classList?.add('klc-ship-ocean');
  }
  function showWorld() {
    for (const o of S.hidden) o.visible = true;
    S.hidden = [];
    if (typeof document !== 'undefined') document.body?.classList?.remove('klc-ship-ocean');
  }

  function build() {
    root = new THREE.Group(); root.name = 'ship-ocean';
    // the swell grid, re-centred on the ship each frame (snapped to the grid: the swell is in world space, so no swim)
    const geo = new THREE.PlaneGeometry(B.size, B.size, B.grid, B.grid); geo.rotateX(-Math.PI / 2);
    seaBase = Float32Array.from(geo.attributes.position.array);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    sea = new THREE.Mesh(geo, ctx.mat.toon('#ffffff', { vertexColors: true, noSnow: true }));
    sea.receiveShadow = true; sea.frustumCulled = false; sea.name = 'ocean-swell';
    root.add(sea);
    ring = new THREE.Mesh(new THREE.RingGeometry(B.size * 0.49, 14000, 64, 1).rotateX(-Math.PI / 2), ctx.mat.toon(COLD.far, { noSnow: true }));
    ring.position.y = -0.05; ring.frustumCulled = false; root.add(ring);
    ctx.noOutline(sea); ctx.noOutline(ring);
    // floats (orange, 30 cm across, scaled up a little to read) and their float lines, instanced
    const fGeo = new THREE.SphereGeometry(0.32, 10, 8);
    floats = new THREE.InstancedMesh(fGeo, ctx.mat.toon('#f07a2a', { noSnow: true }), B.floats);
    floats.count = 0; floats.frustumCulled = false; root.add(floats);
    floatLines = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 4).translate(0, -0.5, 0), ctx.mat.toon('#2a2f3a', { noSnow: true }), B.floats);
    floatLines.count = 0; floatLines.frustumCulled = false; root.add(floatLines);
    S.floatPos = Array.from({ length: B.floats }, () => ({ x: 0, z: 0, on: false }));
    // the main line from the stern roller into the sea (a thin tube re-posed every frame)
    lineMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).translate(0, 0.5, 0), ctx.mat.toon('#2b2a33', { noSnow: true }));
    lineMesh.frustumCulled = false; root.add(lineMesh);
    // wake: a foam fan astern
    const wt = ctx.tex.draw(B.tex, B.tex, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { const u = i / 90, x = w / 2 + (Math.sin(i * 12.9898) * 0.5) * w * (0.15 + u * 0.8), y = h * u; g.fillStyle = `rgba(240,246,248,${0.55 * (1 - u)})`; g.beginPath(); g.ellipse(x, y, 6 + u * 22, 3 + u * 6, 0, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(240,246,248,0.6)'; g.fillRect(w * 0.42, 0, w * 0.16, h * 0.5);
    }, { key: 'ship-wake-' + B.tex });
    wake = new THREE.Mesh(new THREE.PlaneGeometry(24, 120).rotateX(-Math.PI / 2).translate(0, 0, -60), ctx.mat.toon('#ffffff', { map: wt, transparent: true, depthWrite: false, noSnow: true }));
    wake.frustumCulled = false; root.add(wake); ctx.noOutline(wake);
    // the hauling station at the starboard 舷門: line hauler drum, the scale, the freezer hatch (on the ship)
    const gang = GANG();
    hauler = new THREE.Group(); hauler.name = 'line-hauler';
    const steel = ctx.mat.toon('#8b98a3', { noSnow: true }), blue = ctx.mat.toon('#3d6f9a', { noSnow: true });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 14).rotateZ(Math.PI / 2), steel); drum.position.set(0, 0.95, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.5), blue); frame.position.set(0, 0.45, 0);
    hauler.add(drum, frame); hauler.userData.drum = drum;
    hauler.position.set(gang.x + 1.0, gang.y, gang.z + 2.6);
    // the real model carries its own line hauler (anchors.lineHauler, the drum's centre): use it, draw ours only on a stand-in
    const LH = ship.anchors?.lineHauler;
    if (LH) { hauler.visible = false; hauler.position.set(LH[0] ?? LH.x, (LH[1] ?? LH.y) - 0.95, LH[2] ?? LH.z); }
    scale = new THREE.Group(); scale.name = 'fish-scale';
    const plat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 2.6), steel); plat.position.y = 0.06;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), blue); post.position.set(0.55, 0.55, 1.2);
    const disp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.44), ctx.mat.emissive ? ctx.mat.emissive('#8ef0a8', 1.0) : steel); disp.position.set(0.55, 1.15, 1.2);
    scale.add(plat, post, disp);
    scale.position.set(gang.x + 1.6, gang.y, gang.z - 0.6);
    hatch = new THREE.Group(); hatch.name = 'freezer-hatch';
    const coam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.4), ctx.mat.toon('#c8cfd4', { noSnow: true })); coam.position.y = 0.15;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.4).translate(0, 0, -0.7), ctx.mat.toon('#5a8db0', { noSnow: true })); lid.position.set(0, 0.32, 0.7);
    const frost = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2), ctx.mat.toon('#e9f4fb', { noSnow: true, emissive: '#bfe6ff', emissiveIntensity: 0.4 })); frost.position.y = 0.29;
    hatch.add(coam, frost, lid); hatch.userData.lid = lid;
    hatch.position.set(gang.x + 2.6, gang.y, gang.z - 4.2);
    // [ship:integrate] the floodlights of a night haul (hauling often runs to midnight): additive warm pools on the
    // working deck, the inner side of the 舷門 and the sea under it, faded in with ctx.shared.uNight (the cel materials
    // take no point lights). Three quads, one shared material.
    const glowTex = ctx.tex?.draw ? ctx.tex.draw(128, 128, (g) => { g.clearRect(0, 0, 128, 128); const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(255,240,205,1)'); gr.addColorStop(0.55, 'rgba(255,232,185,0.45)'); gr.addColorStop(1, 'rgba(255,232,185,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }, { key: 'ship-worklight' }) : null;
    const workMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffe2b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const work = new THREE.Group(); work.name = 'haul-worklights'; work.visible = false;
    const q = (w, h, rot, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), workMat); m.rotation.set(...rot); m.position.set(x, y, z); m.renderOrder = 3; work.add(m); return m; };
    q(6.5, 10, [-Math.PI / 2, 0, 0], gang.x + 2.6, gang.y + 0.04, gang.z - 1.0);          // the working deck
    q(10, 3.4, [0, Math.PI / 2, 0], gang.x + 4.2, gang.y + 1.5, gang.z - 1.0);             // the inner side of the opening
    q(12, 16, [-Math.PI / 2, 0, 0], gang.x - 5.0, -gang.y + 0.06, gang.z - 1.0);           // the sea under the 舷門
    ctx.noOutline?.(work);
    S.work = work; S.workMat = workMat;
    const station = new THREE.Group(); station.name = 'haul-station'; station.add(hauler, scale, hatch, work);
    ship.group.add(station); S.station = station;
    // fish slot
    S.fishG = new THREE.Group(); S.fishG.name = 'haul-fish'; root.add(S.fishG);
    root.traverse((o) => { o.userData.noBatch = true; o.userData.dynamic = true; });
    station.traverse((o) => { o.userData.noBatch = true; o.userData.dynamic = true; if (o.isMesh) o.castShadow = true; });
    S.built = true;
  }

  function radioBuoy(x, z) {
    const g = new THREE.Group(); g.name = 'radio-buoy';
    const red = ctx.mat.toon('#d8352c', { side: 'double', noSnow: true });
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), ctx.mat.toon('#f07a2a', { noSnow: true }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 3.2, 6).translate(0, 1.6, 0), ctx.mat.toon('#d9d4c8', { noSnow: true }));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.55).translate(0.42, 0, 0), red); flag.position.y = 2.85;
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 4).translate(0, 0.7, 0), ctx.mat.toon('#2a2f3a', { noSnow: true })); ant.position.y = 3.2;
    const lampMat = ctx.mat.emissive ? ctx.mat.emissive('#ffe27a', 2.2) : new THREE.MeshBasicMaterial({ color: '#ffe27a' });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), lampMat); lamp.position.y = 3.25;
    g.add(fl, pole, flag, ant, lamp); g.userData.lamp = lamp; g.userData.flag = flag;
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    ctx.noOutline(lamp);
    root.add(g); S.buoys.push(g);
    return g;
  }

  // ---- per frame
  function updateSea(t) {
    const p = { x: rig.x, z: rig.z };
    const step = B.size / B.grid;
    const cx = Math.round(p.x / step) * step, cz = Math.round(p.z / step) * step;
    sea.position.set(cx, 0, cz); ring.position.x = cx; ring.position.z = cz;
    const pos = sea.geometry.attributes.position, col = sea.geometry.attributes.color;
    const half = B.size / 2;
    const cd = new THREE.Color(COLD.deep).convertSRGBToLinear(), cm = new THREE.Color(COLD.mid).convertSRGBToLinear(), cc = new THREE.Color(COLD.crest).convertSRGBToLinear(), cf = new THREE.Color(COLD.foam).convertSRGBToLinear();
    const c = S._c || (S._c = new THREE.Color());
    for (let i = 0; i < pos.count; i++) {
      const lx = seaBase[i * 3], lz = seaBase[i * 3 + 2];
      const edge = Math.min(1, Math.max(0, (half - Math.max(Math.abs(lx), Math.abs(lz))) / (half * 0.35)));
      const h = swellAt(lx + cx, lz + cz, t) * edge;
      pos.array[i * 3 + 1] = h;
      const k = (h / 1.6 + 1) * 0.5;
      if (k < 0.5) c.copy(cd).lerp(cm, k * 2); else c.copy(cm).lerp(cc, (k - 0.5) * 2);
      const fx = Math.sin((lx + cx) * 0.37 + (lz + cz) * 0.21) * Math.sin((lx + cx) * 0.13 - (lz + cz) * 0.43 + t * 0.3);
      if (h > 1.05 * edge && fx > 0.55) c.lerp(cf, 0.65);
      col.array[i * 3] = c.r; col.array[i * 3 + 1] = c.g; col.array[i * 3 + 2] = c.b;
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    sea.geometry.computeVertexNormals();
  }
  function floatShip(t, dt) {
    const p = { x: rig.x, z: rig.z };
    const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
    const hc = swellAt(p.x, p.z, t), hf = swellAt(p.x + fx * 20, p.z + fz * 20, t), ha = swellAt(p.x - fx * 20, p.z - fz * 20, t);
    const hs = swellAt(p.x + fz * 4.6, p.z - fx * 4.6, t), hp = swellAt(p.x - fz * 4.6, p.z + fx * 4.6, t);
    rig.bob(hc * 0.75, Math.atan2(ha - hf, 40) * 0.8, Math.atan2(hs - hp, 9.2) * 0.5);
  }
  const speedFor = (stage) => (stage === 'set' ? 5.2 : stage === 'haul' ? 1.0 : stage === 'stow' ? 0.6 : 0.15);
  function advance(dt) {
    const v = speedFor(S.stage);
    rig.set(rig.x + Math.sin(S.heading) * v * dt, rig.z + Math.cos(S.heading) * v * dt, S.heading);
    wake.position.set(rig.x, 0.06, rig.z);
    wake.rotation.y = S.heading;
    wake.material.opacity = Math.min(1, v / 5);
    wake.visible = v > 0.5;
  }
  function placeFloats(t) {
    let n = 0;
    for (const f of S.floatPos) {
      if (!f.on) continue;
      const h = swellAt(f.x, f.z, t);
      _m.compose(_p.set(f.x, h + 0.12, f.z), _q.identity(), _u.set(1, 1, 1)); floats.setMatrixAt(n, _m);
      _m.compose(_p.set(f.x, h, f.z), _q.identity(), _u.set(1, 6, 1)); floatLines.setMatrixAt(n, _m);
      n++;
    }
    floats.count = n; floatLines.count = n;
    floats.instanceMatrix.needsUpdate = true; floatLines.instanceMatrix.needsUpdate = true;
    for (const b of S.buoys) {
      b.position.y = swellAt(b.position.x, b.position.z, t) + 0.1;
      b.userData.lamp.visible = Math.sin(t * 3.1) > 0;
      b.userData.flag.rotation.y = Math.sin(t * 2.3) * 0.3;
    }
  }
  function poseLine(t) {
    // SET: stern roller -> the sea 25 m astern; HAUL: the sea abeam -> the hauler drum through the 舷門
    const g = ship.group;
    let a, b;
    if (S.stage === 'set') { a = STERN().applyMatrix4(g.matrixWorld); b = _v.set(0, 0, -50).applyMatrix4(g.matrixWorld).clone(); b.y = swellAt(b.x, b.z, t) - 0.3; }
    else if (S.stage === 'haul') { a = new THREE.Vector3().copy(hauler.position).add(new THREE.Vector3(0, 0.95, 0)).applyMatrix4(g.matrixWorld); const gg = GANG(); b = new THREE.Vector3(gg.x - 9, 0, gg.z + 6).applyMatrix4(g.matrixWorld); b.y = swellAt(b.x, b.z, t) - 0.4; }
    else { lineMesh.visible = false; return; }
    lineMesh.visible = true;
    const d = new THREE.Vector3().subVectors(b, a), l = d.length();
    lineMesh.position.copy(a);
    lineMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    lineMesh.scale.set(1, l, 1);
  }

  // ---- the fish on the line: rise -> swing in -> on the scale -> keep (tag, freezer) | release (back to the sea)
  function fishUp(fish) {
    clearFish();
    const m = makeTuna(ctx, fish.species, fish.fl / 100);
    S.fishG.add(m);
    S.fish = { m, fish, phase: 'rise', t: 0, tag: null, decision: null };
    return S.fish;
  }
  function clearFish() { if (S.fish?.m) { S.fish.m.parent?.remove(S.fish.m); S.fish.m.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); } S.fish = null; }
  function decide(kind, tag) {
    if (!S.fish) return;
    S.fish.decision = kind; S.fish.phase = kind === 'keep' ? 'tag' : 'release'; S.fish.t = 0;
    if (kind === 'keep') { const tg = makeTag(ctx); tg.position.set(0, 0, -0.42); tg.scale.setScalar(1 / (S.fish.fish.fl / 100)); S.fish.m.add(tg); S.fish.tag = tag; }
  }
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  function poseFish(dt, t) {
    const F = S.fish; if (!F) return;
    F.t += dt;
    const g = ship.group, gang = GANG(); g.updateWorldMatrix(true, false);
    const sea = new THREE.Vector3(gang.x - 2.2, -0.6, gang.z + 1.5);           // beside the hull under the opening
    const sill = new THREE.Vector3(gang.x + 0.2, gang.y + 1.0, gang.z + 0.6);   // swung in through the 舷門
    const onScale = new THREE.Vector3().copy(scale.position).add(new THREE.Vector3(0, 0.12 + 0.18 * F.fish.fl / 200, 0));
    const toHatch = new THREE.Vector3().copy(hatch.position).add(new THREE.Vector3(0, 0.3, 0));
    let p = new THREE.Vector3(), yaw = 0, roll = Math.PI / 2, wig = 0;
    const T = { rise: 2.2, swing: 1.4, tag: 1.6, slide: 1.6, release: 2.0 };
    if (F.phase === 'rise') { const k = ease(F.t / T.rise); p.lerpVectors(sea, new THREE.Vector3(gang.x - 1.4, gang.y + 0.4, gang.z + 1.0), k); p.y = THREE.MathUtils.lerp(-0.8, gang.y + 0.5, k); yaw = 0.4; roll = 0.2; wig = 0.35 * (1 - k * 0.6); if (F.t > T.rise) { F.phase = 'swing'; F.t = 0; } }
    else if (F.phase === 'swing') { const k = ease(F.t / T.swing); p.lerpVectors(new THREE.Vector3(gang.x - 1.4, gang.y + 0.5, gang.z + 1.0), sill, k); p.y += Math.sin(k * Math.PI) * 0.6; yaw = THREE.MathUtils.lerp(0.4, 0, k); roll = THREE.MathUtils.lerp(0.2, Math.PI / 2, k); wig = 0.15 * (1 - k); if (F.t > T.swing) { F.phase = 'scale'; F.t = 0; } }
    if (F.phase === 'scale') { const k = ease(F.t / 0.8); p.lerpVectors(sill, onScale, k); yaw = 0; roll = Math.PI / 2; wig = 0.04 * Math.max(0, 1 - F.t / 3); }
    if (F.phase === 'tag') { p.copy(onScale); roll = Math.PI / 2; if (F.t > T.tag) { F.phase = 'slide'; F.t = 0; } }
    if (F.phase === 'slide') { const k = ease(F.t / T.slide); p.lerpVectors(onScale, toHatch, k); p.y -= k > 0.85 ? (k - 0.85) * 6 : 0; roll = Math.PI / 2; hatch.userData.lid.rotation.x = -1.2 * Math.sin(Math.min(1, F.t / T.slide) * Math.PI); if (F.t > T.slide) { F.phase = 'gone'; clearFish(); return; } }
    if (F.phase === 'release') { const k = ease(F.t / T.release); p.lerpVectors(onScale, new THREE.Vector3(gang.x - 3.0, -0.5, gang.z + 0.5), k); p.y += Math.sin(k * Math.PI) * 0.8; roll = Math.PI / 2 * (1 - k) + 0.2; if (F.t > T.release) { F.phase = 'gone'; clearFish(); return; } }
    F.m.position.copy(p).applyMatrix4(g.matrixWorld);
    _e.set(0, rig.yaw + yaw + Math.sin(t * 9) * wig, roll, 'YXZ');   // the fish lies fore and aft (the carrier holds the heading)
    F.m.quaternion.setFromEuler(_e);
  }

  // ---- api
  const api = {
    get active() { return S.active; },
    get stage() { return S.stage; },
    get fish() { return S.fish; },
    get fishBusy() { return !!S.fish && S.fish.phase !== 'gone'; },
    get fishReady() { return S.fish?.phase === 'scale'; },
    get heading() { return S.heading; },
    hideWorld, showWorld,
    enter({ at = null, heading = 0.22, keep = [] } = {}) {
      if (!S.built) build();
      S.keep = keep;
      if (!root.parent) ctx.add(root);
      root.visible = true; S.station.visible = true;
      S.heading = heading;
      rig.set(at ? at.x : rig.x, at ? at.z : rig.z, heading);
      S.active = true;
      hideWorld();
      S.saved = { cloud: ctx.sky?.uniforms?.uCloud?.value };
      if (ctx.sky?.uniforms?.uCloud) ctx.sky.uniforms.uCloud.value = 0.55;
      return api;
    },
    exit() {
      if (!S.active) return;
      S.active = false;
      showWorld();
      if (S.saved && ctx.sky?.uniforms?.uCloud && S.saved.cloud !== undefined) ctx.sky.uniforms.uCloud.value = S.saved.cloud;
      api.dispose();
    },
    setStage(stage) {
      S.stage = stage;
      const T = ctx.services?.time;
      const h = STAGE_HOURS[stage];
      if (h !== undefined) { if (T?.setHours) T.setHours(h); else ctx.sky?.setHours?.(h); }
      if (stage === 'set' && !S.buoys.length) { const s = STERN().applyMatrix4(ship.group.updateWorldMatrix(true, false) || ship.group.matrixWorld); radioBuoy(s.x, s.z); }
      if (stage === 'wait' && S.buoys.length < 2) { const s = STERN().applyMatrix4(ship.group.updateWorldMatrix(true, false) || ship.group.matrixWorld); radioBuoy(s.x - Math.sin(S.heading) * 12, s.z - Math.cos(S.heading) * 12); }
    },
    /** The line paid out so far (km): drops a visual float every VISUAL_FLOAT_KM over the stern. */
    setLineKm(km) {
      S.lineKm = km;
      const want = Math.floor(km / VISUAL_FLOAT_KM);
      while (S.floatsDropped < want) {
        const s = STERN().applyMatrix4(ship.group.updateWorldMatrix(true, false) || ship.group.matrixWorld);
        const f = S.floatPos[S.floatsDropped % S.floatPos.length];
        f.x = s.x - Math.sin(S.heading) * 6; f.z = s.z - Math.cos(S.heading) * 6; f.on = true;
        S.floatsDropped++;
      }
    },
    fishUp, decide, clearFish,
    /** Camera rigs: { pos, look } in world space for a stage. */
    camera(stage = S.stage, t = 0) {
      const g = ship.group; g.updateWorldMatrix(true, true);
      const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
      const gang = GANG();
      if (stage === 'set') return { pos: W(-22 + Math.sin(t * 0.05) * 3, 15, -62), look: W(0, 3, -24) };
      if (stage === 'wait') return { pos: W(-70, 26, 40), look: W(0, 4, -8) };
      // outside the starboard side, level with the 舷門: the opening sits right of centre (the HUD is on the left)
      // [ship:integrate] a portrait phone: further out and aimed below the sill, so the opening, the scale and the fish sit
      // in the upper half of the screen, above the haul panel
      const portrait = (ctx.camera?.aspect ?? 1.6) < 1;
      if (stage === 'haul') return portrait ? { pos: W(gang.x - 12.5, gang.y + 1.4, gang.z - 2.4), look: W(gang.x + 1.6, gang.y - 2.6, gang.z - 1.2) } : { pos: W(gang.x - 6.8, gang.y + 2.1, gang.z - 4.6), look: W(gang.x + 1.6, gang.y + 0.35, gang.z - 2.5) };
      if (stage === 'stow') return portrait ? { pos: W(gang.x - 12.0, gang.y + 1.8, gang.z - 6.5), look: W(gang.x + 2.4, gang.y - 2.4, gang.z - 5.0) } : { pos: W(gang.x - 6.0, gang.y + 2.3, gang.z - 9.0), look: W(gang.x + 2.4, gang.y + 0.3, gang.z - 6.0) };
      if (stage === 'side') return { pos: W(-75, 6, 0), look: W(0, 5, 0) };
      return { pos: W(-40, 18, -40), look: W(0, 4, 0) };
    },
    update(dt, t) {
      if (!S.active) return;
      if (dt > 0) advance(dt);
      floatShip(t, dt);
      updateSea(t);
      placeFloats(t);
      poseLine(t);
      if (hauler) hauler.userData.drum.rotation.x -= (S.stage === 'haul' ? 2.4 : 0) * dt;
      if (S.work) { const n = Math.max(0, Math.min(1, ((ctx.shared?.uNight?.value || 0) - 0.15) / 0.45)); const on = n > 0.01 && (S.stage === 'haul' || S.stage === 'stow'); S.work.visible = on; S.workMat.opacity = 0.62 * n; }
      poseFish(dt, t);
    },
    dispose() {
      clearFish();
      if (S.station) { S.station.parent?.remove(S.station); S.station.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
      if (root) { root.parent?.remove(root); root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
      root = sea = ring = floats = floatLines = hauler = scale = hatch = lineMesh = wake = null;
      S.workMat?.dispose(); S.work = S.workMat = null;
      S.built = false; S.buoys = []; S.floatsDropped = 0; S.lineKm = 0; S.station = null;
    },
    get stats() { return { built: S.built, grid: B.grid, floats: floats?.count || 0, floatsDropped: S.floatsDropped, buoys: S.buoys.length, hidden: S.hidden.length }; },
  };
  return api;
}
