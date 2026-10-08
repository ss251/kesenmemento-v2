// Demo data for the contributor backend: contributors and submissions made entirely of synthetic images and
// invented text, sent through the real HTTP API, so the admin page and the pipeline have something to show.
//
//   import { seedDemo } from "./seed.mjs";
//   const demo = await seedDemo({ base: "http://127.0.0.1:8981", adminToken });
//
// CLI:  ADMIN_TOKEN=... env -u NODE_OPTIONS bun tools/contrib/seed.mjs --api http://127.0.0.1:8981
//
// The set covers what triage meets: issues and fixes, photos with and without GPS, a HEIC the server cannot
// decode, a photo taken far from the camera, an emoji note, and nicknames that try HTML and spreadsheet formulas.
import { synthJpeg, synthScreenshot, synthHeic, synthPng } from "./synth.mjs";
import { enuToLatLon } from "../../server/contrib/geo.js";

const CAT = ["building", "road", "shop", "sign", "landmark", "other"];

/** @param {{base: string, adminToken: string, log?: (s: string) => void}} opts */
export async function seedDemo({ base, adminToken, log = () => {} }) {
  const api = `${base}/api/contrib/v1`;
  const json = async (res) => { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } };
  const post = (path, body, headers = {}) => fetch(api + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }).then(json);
  const admin = { authorization: `Bearer ${adminToken}` };

  const people = [
    { key: "sakura", nickname: "さくら", crewNo: "1234-5678-9012-34" },
    { key: "taro", nickname: "Taro K." },
    { key: "mei", nickname: "めい🌊" },
    { key: "ken", nickname: "Ken" },
    { key: "html", nickname: "<b>bold</b> & <i>x</i>" },
    { key: "formula", nickname: "=cmd|' /C calc'!A0", crewNo: "0000-1111-2222-33" },
    { key: "spam", nickname: "Spam Bot" },
  ];
  const who = {};
  for (const p of people) {
    const r = await post("/contributors", { nickname: p.nickname, crewNo: p.crewNo });
    if (!r.token) throw new Error(`could not create ${p.key}: ${JSON.stringify(r)}`);
    who[p.key] = { ...p, id: r.contributorId, token: r.token };
  }

  const pose = (x, z, extra = {}) => ({ enu: [x, 1.6, z], heading: 120, pitch: -4, fov: 60, mode: "walk", at: new Date().toISOString(), appVersion: "0.1.0", layoutVersion: "v6", timePreset: "noon", season: "autumn", viewport: { w: 390, h: 844, dpr: 3 }, ...extra });
  const spots = [[12, -34], [250, 410], [-180, 90], [700, 1030], [-60, -220], [330, 20], [90, 610], [-400, 300], [15, 15], [560, -140], [220, 780], [-90, -90]];
  const items = [
    { by: "sakura", kind: "issue", category: "sign", note: "鹿折の交差点の看板の文字が実際と違います。「魚市場前」が「魚市場」になっています。", spot: 0 },
    { by: "sakura", kind: "fix", category: "building", note: "屋根の色が違います。現地は青い瓦屋根です。写真を3枚撮りました。", spot: 1, photos: 3 },
    { by: "taro", kind: "issue", category: "road", note: "Crosswalk paint is missing here, and the pole is on the wrong side of the street.", spot: 2 },
    { by: "taro", kind: "fix", category: "shop", note: "The shop front is a different color. Photo from across the street.", spot: 3, photos: 1 },
    { by: "mei", kind: "issue", category: "landmark", note: "この灯台のそばにベンチがあります 🌊 ありません。", spot: 4 },
    { by: "mei", kind: "fix", category: "sign", note: "The bus stop sign is missing. Two photos.", spot: 5, photos: 2, far: true },
    { by: "ken", kind: "issue", category: "other", note: "", spot: 6, noPose: true },
    { by: "ken", kind: "fix", category: "building", note: "iPhone HEIC photo: the warehouse has two doors, not one.", spot: 7, photos: 1, heic: true },
    { by: "html", kind: "issue", category: "other", note: "<img src=x onerror=alert(1)> this note tries HTML; it must show as plain text.", spot: 8 },
    { by: "formula", kind: "issue", category: "road", note: "=HYPERLINK(\"http://evil.example\",\"click\") formula-looking note", spot: 9 },
    { by: "spam", kind: "issue", category: "other", note: "buy followers", spot: 10 },
    { by: "sakura", kind: "issue", category: "building", note: "長いメモ。" + "とても長い説明が続きます。".repeat(40), spot: 11 },
  ];

  const created = [];
  let n = 0;
  for (const it of items) {
    const fd = new FormData();
    const [x, z] = spots[it.spot];
    if (!it.noPose) fd.append("pose", JSON.stringify(pose(x, z)));
    fd.append("category", it.category);
    fd.append("kind", it.kind);
    fd.append("note", it.note);
    fd.append("lang", /[ぁ-んァ-ヶ一-龠]/.test(it.note) ? "ja" : "en");
    fd.append("consent", "1");
    fd.append("screenshot", new File([await synthScreenshot({ seed: n })], "shot.jpg", { type: "image/jpeg" }));
    for (let i = 0; i < (it.photos ?? 0); i++) {
      const at = it.far ? { enuX: x + 640, enuZ: z - 80 } : { enuX: x + 6 + i * 2, enuZ: z - 4 };
      const opts = { ...at, alt: 3.5, heading: (120 + i * 25) % 360, takenAt: `2026:10:04 14:${String(20 + n).padStart(2, "0")}:05`, offset: "+09:00", make: "SynthPhone", model: "SP-1", focal35: 26, seed: n + i + 1, width: 1600, height: 1200 };
      const bytes = it.heic ? await synthHeic(opts) : i === 1 ? await synthPng({ width: 1200, height: 800, seed: n }) : await synthJpeg(opts);
      const type = it.heic ? "image/heic" : i === 1 ? "image/png" : "image/jpeg";
      fd.append("photos", new File([bytes], `IMG_${1000 + n}${i}.${it.heic ? "heic" : i === 1 ? "png" : "jpg"}`, { type }));
    }
    const res = await fetch(api + "/submissions", { method: "POST", headers: { authorization: `Bearer ${who[it.by].token}`, "idempotency-key": `seed-${n}-${it.by}-0000` }, body: fd });
    const body = await json(res);
    if (res.status !== 201) throw new Error(`submission ${n} failed: ${res.status} ${JSON.stringify(body)}`);
    created.push({ ...body, by: it.by, item: it });
    n++;
    log(`seeded ${body.id} (${it.kind}, ${it.category}, ${it.photos ?? 0} photos)`);
  }

  // a few decisions, so every tab has something
  const review = (id, body) => post(`/admin/submissions/${id}`, body, admin);
  await review(created[1].id, { status: "accepted", points: 25, reviewerNote: "Verified against the survey photos." });
  await review(created[3].id, { status: "accepted" });
  await review(created[4].id, { status: "accepted", points: 5 });
  await review(created[2].id, { status: "rejected", reviewerNote: "Duplicate of an earlier report." });
  await review(created[0].id, { status: "used", points: 5, version: "v0.1.0" });
  await post(`/admin/contributors/${who.spam.id}`, { banned: true }, admin);
  return { who, created, api };
}

if (import.meta.main) {
  const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
  const base = arg("--api", "http://127.0.0.1:8981");
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) { console.error("set ADMIN_TOKEN"); process.exit(2); }
  const demo = await seedDemo({ base, adminToken, log: console.log });
  console.log(`seeded ${demo.created.length} submissions from ${Object.keys(demo.who).length} contributors`);
}
