// [v3:harbor] DEV test scenes. Each returns a list of default camera views ([px,py,pz,lx,ly,lz]).
import * as H from '../index.js';

function land(ctx, x0, z0, x1, z1, y, color = '#b9b4a6') {
  const k = ctx.kit(ctx.staticRoot);
  k.boxB(x1 - x0, y + 6, z1 - z0, ctx.mat.toon(color, { paint: 0.06 }), [(x0 + x1) / 2, -6, (z0 + z1) / 2]);
}

export async function build(name, ctx) {
  const S = {
    boats() {
      land(ctx, -160, 10, 160, 80, 2.17);
      H.buildQuay(ctx, [-150, 0], [150, 0], { top: 2.2, kind: 'quay', noLand: false });
      H.placeBoat(ctx, 'katsuo', { x: -95, z: -6.4, rotY: Math.PI / 2 }, { seed: 11, flags: true });
      H.placeBoat(ctx, 'maguro', { x: -30, z: -5.7, rotY: -Math.PI / 2 }, { seed: 12 });
      H.placeBoat(ctx, 'sanma', { x: 22, z: -5.4, rotY: Math.PI / 2 }, { seed: 13 });
      H.placeBoat(ctx, 'small', { x: 56, z: -3.0, rotY: Math.PI / 2 }, { seed: 14 });
      H.placeBoat(ctx, 'small', { x: 56, z: -7.4, rotY: Math.PI / 2 }, { seed: 15, trim: '#b0453a' });
      const fb = H.placeBoat(ctx, 'ferry', { x: 95, z: -6.0, rotY: -Math.PI / 2 }, { seed: 16 });
      H.buildGulls(ctx, { flocks: [{ center: [-60, 4, -30], radius: 45, count: 14, height: 10 }], perches: [...fb.perches], perchCount: 4 });
      return [
        [-40, 14, -70, -40, 3, 0],
        [-120, 9, -30, -95, 6, -6],
        [30, 8, -26, 22, 5, -5],
        [80, 5, -20, 56, 2, -4],
        [110, 8, -30, 95, 4, -6],
        [0, 70, -150, 0, 0, 0],
      ];
    },
    quay() {
      // four edge kinds in a row along z = 0 (water to the north, -z), land behind
      land(ctx, -130, 14, 130, 60, 2.17);
      const kinds = [['quay', -120, -60], ['seawall', -60, 0], ['promenade', 0, 60], ['rocks', 60, 95], ['beach', 95, 125]];
      for (const [kind, x0, x1] of kinds) {
        const apron = { quay: 14, seawall: 14, promenade: 14, rocks: 14, beach: 14 }[kind];
        H.buildQuay(ctx, [x0, 0], [x1, 0], { kind, top: 2.2, apron });
      }
      H.placeBoat(ctx, 'small', { x: -90, z: -3.2, rotY: Math.PI / 2 }, { seed: 21 });
      H.placeBoat(ctx, 'small', { x: 25, z: -3.0, rotY: -Math.PI / 2 }, { seed: 22, trim: '#2f6f78' });
      const k = ctx.kit(ctx.staticRoot), M = H.props.hmats(ctx);
      H.props.buoy(ctx, k, M, -40, 0, -30, 'red'); H.props.buoy(ctx, k, M, -20, 0, -34, 'green'); H.props.buoy(ctx, k, M, 10, 0, -22, 'mooring');
      return [
        [-100, 4.2, 9, -80, 2.6, -2],       // working quay, walking eye
        [-40, 3.75, 6, -37.5, 3.25, 2.6],     // seawall street side, window at eye level
        [-30, 5, -14, -30, 2.8, 2],         // seawall from the water
        [14, 3.8, 11, 30, 3.2, 0],          // promenade
        [-10, 26, -60, -10, 0, 5],          // mid overview
        [95, 8, -22, 100, 1, 4],            // rocks + beach
      ];
    },
    market() {
      land(ctx, -40, 0, 360, 120, 2.37);
      const mk = H.buildFishMarket(ctx, [0, 0], [300, 0], { top: 2.4 });   // water on the left of a->b = -z
      const bs = H.mooreAlong(ctx, [0, 0], [300, 0], [{ type: 'katsuo', flags: true }, { type: 'katsuo' }, { type: 'maguro' }, { type: 'sanma' }], { gap: 8, start: 10, fender: 0.9 });
      for (const b of bs) H.mooringLines(ctx, b, [0, 0], [300, 0], 2.4);
      return [];
    },
    shrine() {
      land(ctx, -60, 20, 60, 90, 2.0);
      // small headland: rocks edge
      H.buildQuay(ctx, [-50, 20], [50, 20], { kind: 'rocks', top: 2.0, apron: 10 });
      const u = H.buildUkimido(ctx, { x: 0, y: 0, z: 0, rotY: Math.PI }, { bridgeLen: 16 });
      H.buildIsuzuTorii(ctx, { x: 14, y: 2.0, z: 28, rotY: Math.PI * 0.95 });
      H.buildIsuzuShrine(ctx, { x: 16, y: 6.4, z: 52, rotY: Math.PI * 0.95 }, { steps: 22 });
      const k = ctx.kit(ctx.staticRoot);
      k.boxB(40, 4.4, 30, ctx.mat.toon('#8fa66f', { paint: 0.08 }), [16, 2.0, 62]);   // shrine mound
      H.buildAnbaLookout(ctx, { x: -120, y: 0, z: 120, rotY: 0 });
      H.placeBoat(ctx, 'small', { x: -18, z: -6, rotY: 0.4 }, { seed: 31 });
      H.buildGulls(ctx, { flocks: [{ center: [0, 4, 10], radius: 30, count: 8, height: 8 }], perches: [...u.perches], perchCount: 3 });
      return [];
    },
    gulls() {
      land(ctx, -40, 0, 40, 30, 2.17);
      const q = H.buildQuay(ctx, [-40, 0], [40, 0], { kind: 'quay', top: 2.2, apron: 12, bollardSpacing: 5 });
      H.mooringLines(ctx, H.placeBoat(ctx, 'small', { x: 5, z: -3.0, rotY: Math.PI / 2 }, { seed: 51 }), [-40, 0], [40, 0], 2.2);
      H.buildGulls(ctx, { flocks: [{ center: [0, 2, -8], radius: 9, count: 7, height: 3 }], perches: q.bollards, perchCount: 5, seed: 'g2' });
      return [];
    },
    real() {
      // the whole harbour on the real layout (needs ?layout=real); no terrain in this harness
      const t0 = performance.now();
      const out = H.buildHarbor(ctx);
      window.__harborStats = { ...out.stats, total: Math.round(performance.now() - t0), quays: out.quays.length, boats: out.boats.length };
      return [];
    },
    bridges() {
      // Kanae (1344 m) along +z at x = 0, Oshima (356 m) at x = 900; hills at the abutments
      const k = ctx.kit(ctx.staticRoot), g = ctx.mat.toon('#7f9a6a', { paint: 0.08 });
      for (const [x, z, w, d, h] of [[0, -60, 260, 140, 26], [0, 1404, 260, 140, 26], [900, -40, 200, 90, 24], [900, 396, 200, 90, 24]]) k.boxB(w, h + 4, d, g, [x, -4, z]);
      const K = H.buildBridgeKanae(ctx, [0, 24, 0], [0, 24, 1344]);
      const O = H.buildBridgeOshima(ctx, [900, 26, 0], [900, 26, 356], { springY: 4 });
      H.placeBoat(ctx, 'ferry', { x: 870, z: 150, rotY: -1.2 }, { seed: 41, dynamic: false });
      H.placeBoat(ctx, 'katsuo', { x: 40, z: 700, rotY: 0.2 }, { seed: 42 });
      H.buildGulls(ctx, { flocks: [{ center: [0, 30, 672], radius: 60, count: 10, height: 10 }], perches: K.perches });
      return [];
    },
  };
  const f = S[name] || S.boats;
  return f();
}
