// Synthetic Kesennuma-shaped geography for the development fixtures (ENU metres, z = south).
// sdWater(x, z): signed distance to the sea in metres (negative = water). heightAt(x, z): terrain metres.
// Hand-placed against the tour stops in BUILD-SPEC §7 so each stop frames something; not real data.

// Water bodies: polylines with a radius per vertex (tapered capsules).
const WATER = [
  { pts: [[380, 60], [520, 250], [700, 420]], r: [300, 330, 380] },                         // inner bay (pier 7 on its west shore)
  { pts: [[380, 60], [430, -420], [470, -760], [1300, -1250], [1850, -1650]], r: [250, 230, 250, 300, 260] }, // north arm: market quay, Kanae crossing
  { pts: [[700, 420], [1800, 1600], [2500, 2950], [2900, 5200], [3000, 9800]], r: [520, 600, 260, 520, 900] }, // channel to Oshima bridge and the sea
  { pts: [[2500, 2400], [4200, 1800], [5900, 1900]], r: [380, 420, 480] },                  // north of Oshima
  { pts: [[5900, 1900], [6000, 5000], [6000, 9800]], r: [520, 650, 900] },                 // Oshima / Karakuwa channel
  { pts: [[5600, 7000], [11500, 7000]], r: [2300, 2300] },                                   // open sea to the south-east
  { pts: [[10400, -10000], [10400, 9000]], r: [1200, 1200] },                               // open sea to the east
  { pts: [[-7000, 9800], [12000, 9800]], r: [1900, 1900] },                                 // open sea to the south
];

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2)) : 0;
  return [Math.hypot(px - (ax + vx * t), pz - (az + vz * t)), t];
}
function vnoise(x, y) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), yi = Math.floor(y); let xf = x - xi, yf = y - yi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
  return (h(xi, yi) * (1 - xf) + h(xi + 1, yi) * xf) * (1 - yf) + (h(xi, yi + 1) * (1 - xf) + h(xi + 1, yi + 1) * xf) * yf;
}
export function fbm(x, y, oct = 5) { let s = 0, a = 1, t = 0, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 17.3, y * f); t += a; a *= 0.5; f *= 2; } return s / t; }

export function sdWater(x, z) {
  let d = Infinity;
  for (const w of WATER) for (let i = 0; i + 1 < w.pts.length; i++) {
    const [a, b] = [w.pts[i], w.pts[i + 1]], [dist, t] = segDist(x, z, a[0], a[1], b[0], b[1]);
    d = Math.min(d, dist - (w.r[i] + (w.r[i + 1] - w.r[i]) * t));
  }
  const near = Math.min(1, Math.hypot(x - 300, z - 0) / 2500);                            // quiet coastline in the core
  return d + (fbm(x / 650, z / 650) - 0.5) * (70 + 380 * near);
}

const PEAKS = [[-781, -1332, 239, 380], [4150, 4700, 205, 900], [7300, -1500, 180, 1400], [-3500, -4000, 320, 2200], [800, -3300, 170, 900]];
export function heightAt(x, z) {
  const sd = sdWater(x, z);
  if (sd <= 0) return 0;
  const coast = Math.min(1, sd / 10) * (1.8 + Math.min(sd, 80) * 0.035);
  const urbanCalm = Math.min(1, Math.max(0, (Math.hypot(x - 250, z + 250) - 1100) / 1300));
  const hill = Math.pow(Math.min(1, Math.max(0, (sd - 260) / 1600)), 1.3) * (40 + 190 * fbm(x / 900 + 3, z / 900 + 9)) * urbanCalm;
  let h = coast + hill;
  for (const [px, pz, ph, pr] of PEAKS) {
    const g = ph * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (2 * pr * pr));
    h = Math.max(h, g * Math.min(1, sd / 150) + coast);
  }
  return Math.min(h, 330);
}

// Urban zones for synthetic footprints: centre, radius, grid block size and angle, density, max ground height.
export const URBAN = [
  { name: "naiwan", x: 60, z: -150, r: 650, block: 46, angle: 0.28, density: 0.72, maxH: 16 },
  { name: "market", x: 150, z: -900, r: 420, block: 50, angle: 0.08, density: 0.55, maxH: 16 },
  { name: "shishiori", x: 1150, z: -1950, r: 650, block: 52, angle: -0.5, density: 0.5, maxH: 18 },
  { name: "south", x: 1050, z: 1750, r: 600, block: 54, angle: 0.72, density: 0.45, maxH: 22 },
  { name: "oshima", x: 3500, z: 3300, r: 380, block: 50, angle: 0.3, density: 0.3, maxH: 30 },
  { name: "karakuwa", x: 6900, z: 600, r: 450, block: 56, angle: -0.2, density: 0.3, maxH: 30 },
];
