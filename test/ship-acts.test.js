// [ship:acts] The three acts of 第一昭福丸: the tag format (never the real form), the act state machine (legal and
// illegal transitions, guards, serialisation), the ICCAT release rule, the quota stop, the true Act 3 chain, the
// UI strings (JA and EN complete) and the phone budget of the act scenes.
import { test, expect, describe } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { formatTag, isDemoTag, REAL_TAG_RE, DEMO_TAG_RE, tagSerial } from "../src/anime/world/ship/tags.js";
import { createActs, STATES, ACT_OF, CHAIN_ORDER, EVENTS, RULES, makeCatch, seasonOpen, forkLengthCm, japanSharePct, weighIn, SHIMIZU_STEPS } from "../src/anime/world/ship/acts.js";
import { CHAIN, chainCards, CLOSING } from "../src/anime/world/ship/chain.js";
import { BUDGET as SENDOFF_BUDGET, tapeState, TAPE_COLOURS, hornSpec, MELODY, musicProbeAllowed } from "../src/anime/world/ship/sendoff.js";
import { BUDGET as OCEAN_BUDGET, swellAt, OCEAN_LABEL_KEYS } from "../src/anime/world/ship/ocean.js";
import { PHONE } from "../src/anime/core/tier.js";

const ROOT = new URL("../", import.meta.url).pathname;

// ---------------------------------------------------------------------------------------------------------- helpers
/** Drive a fresh machine to `target` along the legal path (the haul keeps every legal fish it can). */
function driveTo(target, init = {}) {
  const M = createActs(init);
  const step = (ev, p) => { const r = M.send(ev, p); if (!r.ok) throw new Error(`${M.state} ${ev}: ${r.reason}`); return r; };
  const at = () => M.state;
  const order = STATES.indexOf(target);
  if (order >= 1) step("START");
  if (order >= 2) { step("HORN"); step("CAST_OFF"); }
  if (order >= 3) { step("PASS", { what: "shoko" }); step("PASS", { what: "kanae" }); step("REACH_BAY_MOUTH"); }
  if (order >= 4) step("TO_OCEAN");
  if (order >= 5) { step("SET_PROGRESS", { km: 150 }); step("SET_DONE"); }
  if (order >= 6) { step("WAIT_PROGRESS", { h: 2.5 }); step("WAIT_DONE"); }
  if (order >= 7) {
    while (at() === "HAUL") {
      step("FISH_UP");
      const f = M.data.onScale;
      const k = M.send("KEEP");
      if (!k.ok) step("RELEASE");
    }
  }
  if (order >= 8) { step("FREEZE_PROGRESS", { h: 36 }); step("STOW_DONE"); }
  for (let i = 9; i <= order; i++) step("NEXT");
  expect(M.state).toBe(target);
  return M;
}

// ---------------------------------------------------------------------------------------------------------- tags
describe("ship: tags", () => {
  test("the demo format", () => {
    expect(formatTag(1)).toBe("DEMO-7KFY-26-0001");
    expect(formatTag(42)).toBe("DEMO-7KFY-26-0042");
    expect(formatTag(9999, 27)).toBe("DEMO-7KFY-27-9999");
    expect(formatTag(7, 5)).toBe("DEMO-7KFY-05-0007");
    expect(tagSerial("DEMO-7KFY-26-0042")).toBe(42);
  });
  test("a demo tag never has the real form 7KFY-20-0001", () => {
    expect(REAL_TAG_RE.test("7KFY-20-0001")).toBe(true);    // the slide's real tag
    expect(REAL_TAG_RE.test("7KFY-20-0050")).toBe(true);
    for (let n = 1; n <= 9999; n += 37) for (const yy of [0, 20, 26, 99]) {
      const t = formatTag(n, yy);
      expect(REAL_TAG_RE.test(t)).toBe(false);
      expect(t.startsWith("DEMO-")).toBe(true);
      expect(isDemoTag(t)).toBe(true);
      expect(DEMO_TAG_RE.test(t)).toBe(true);
    }
  });
  test("real or malformed tags are not demo tags", () => {
    for (const s of ["7KFY-20-0001", "7KFY-26-0001", " DEMO-7KFY-26-0001", "DEMO-7KFY-26-0001 ", "DEMO-7KFY-26-01", "demo-7KFY-26-0001", "DEMO-7KFZ-26-0001", "DEMO7KFY-26-0001", null, 1, undefined])
      expect(isDemoTag(s)).toBe(false);
  });
  test("serials and years are checked, never guessed", () => {
    for (const bad of [0, -1, 1.5, 10000, NaN, "1"]) expect(() => formatTag(bad)).toThrow();
    for (const bad of [-1, 100, 2.5, "26"]) expect(() => formatTag(1, bad)).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------- machine
describe("ship: act state machine", () => {
  test("states in order and their acts", () => {
    expect(STATES).toEqual(["DOCKED", "SENDOFF", "DEPART", "BAY_MOUTH", "OCEAN_SET", "WAIT", "HAUL", "STOW", "TRANSSHIP_LAS_PALMAS", "REEFER", "SHIMIZU_WEIGH", "HOMECOMING", "CARD"]);
    expect(STATES.map((s) => ACT_OF[s])).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
  });
  test("the whole voyage is legal end to end and visits every state in order", () => {
    const M = driveTo("CARD");
    const visited = ["DOCKED", ...M.log.filter((l) => l.includes(">")).map((l) => l.split(">")[2])];
    expect(visited).toEqual(STATES);
    expect(M.act).toBe(3);
  });
  test("illegal transitions are refused and change nothing", () => {
    const M = createActs();
    for (const ev of ["CAST_OFF", "REACH_BAY_MOUTH", "TO_OCEAN", "SET_DONE", "WAIT_DONE", "FISH_UP", "KEEP", "RELEASE", "HAUL_DONE", "STOW_DONE", "NEXT", "RESTART"]) {
      const r = M.send(ev);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("illegal");
      expect(M.state).toBe("DOCKED");
    }
    expect(M.send("FLY_HOME").reason).toBe("unknown_event");
    const H = driveTo("HAUL");
    for (const ev of ["START", "CAST_OFF", "TO_OCEAN", "SET_DONE", "NEXT", "STOW_DONE"]) expect(H.send(ev).reason).toBe("illegal");
    expect(H.state).toBe("HAUL");
  });
  test("guards: horn before casting off, under かなえ大橋 before the bay mouth, the line set, the soak, the freeze", () => {
    const M = createActs();
    M.send("START");
    expect(M.send("CAST_OFF").reason).toBe("no_horn");
    M.send("HORN"); expect(M.send("CAST_OFF").ok).toBe(true);
    M.send("PASS", { what: "shoko" });
    expect(M.send("REACH_BAY_MOUTH").reason).toBe("not_under_kanae");
    expect(M.send("PASS", { what: "nowhere" }).reason).toBe("bad_payload");
    M.send("PASS", { what: "kanae" }); expect(M.send("REACH_BAY_MOUTH").ok).toBe(true);
    M.send("TO_OCEAN");
    M.send("SET_PROGRESS", { km: 75 });
    expect(M.data.hooks).toBe(1500);
    expect(M.data.floats).toBe(250);   // one float every 300 m
    expect(M.send("SET_DONE").reason).toBe("line_not_set");
    M.send("SET_PROGRESS", { km: 400 });
    expect(M.data.setKm).toBe(150); expect(M.data.hooks).toBe(3000);
    M.send("SET_DONE");
    M.send("WAIT_PROGRESS", { h: 1.5 });
    expect(M.send("WAIT_DONE").reason).toBe("still_soaking");
    M.send("WAIT_PROGRESS", { h: 2 }); expect(M.send("WAIT_DONE").ok).toBe(true);
    const S = driveTo("STOW");
    S.send("FREEZE_PROGRESS", { h: 20 });
    expect(S.send("STOW_DONE").reason).toBe("not_frozen");
  });
  test("large longliners may fish west of 10°W / north of 42°N only 1 Aug-31 Jan (ICCAT Rec 22-08)", () => {
    expect(seasonOpen("2026-10-10")).toBe(true);
    expect(seasonOpen("2026-08-01")).toBe(true);
    expect(seasonOpen("2027-01-31")).toBe(true);
    expect(seasonOpen("2027-02-01")).toBe(false);
    expect(seasonOpen("2026-06-15")).toBe(false);
    expect(seasonOpen("2026-07-31")).toBe(false);
    expect(seasonOpen("nope")).toBe(false);
    const M = driveTo("BAY_MOUTH", { date: "2026-05-20" });
    expect(M.send("TO_OCEAN").reason).toBe("season_closed");
    expect(M.state).toBe("BAY_MOUTH");
  });
  test("serialisable: a snapshot restores the exact machine", () => {
    const M = driveTo("HAUL");
    M.send("FISH_UP"); M.send("KEEP");
    const json = JSON.stringify(M.snapshot());
    const R = createActs(JSON.parse(json));
    expect(R.state).toBe(M.state);
    expect(R.data).toEqual(M.data);
    expect(JSON.stringify(R)).toBe(json);
    expect(() => createActs({ v: 1, state: "SAILING_HOME_WITH_FISH", data: {} })).toThrow();
  });
  test("RESTART from the card starts a fresh voyage", () => {
    const M = driveTo("CARD");
    expect(M.data.kept.length).toBeGreaterThan(0);
    expect(M.send("RESTART").ok).toBe(true);
    expect(M.state).toBe("DOCKED");
    expect(M.data.kept).toEqual([]); expect(M.data.nextTag).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------- the haul
describe("ship: haul rules", () => {
  test("the catch: mostly bluefin, plus a bigeye and an albacore, deterministic per seed", () => {
    const c = makeCatch("shofuku-2026");
    expect(makeCatch("shofuku-2026")).toEqual(c);
    expect(c.filter((f) => f.species === "bluefin").length).toBeGreaterThan(c.length / 2);
    expect(c.some((f) => f.species === "bigeye")).toBe(true);
    expect(c.some((f) => f.species === "albacore")).toBe(true);
    expect(c.some((f) => f.species === "bluefin" && f.kg < 30)).toBe(true);
    // 30 kg is 115 cm fork length: the two halves of the ICCAT minimum agree
    expect(Math.abs(forkLengthCm("bluefin", 30) - 115)).toBeLessThanOrEqual(1);
  });
  test("release rule: a bluefin under 30 kg cannot be kept, and is released", () => {
    const M = driveTo("HAUL");
    let seen = 0;
    while (M.state === "HAUL" && seen < 20) {
      M.send("FISH_UP");
      const f = M.data.onScale;
      if (f.species === "bluefin" && f.kg < RULES.minKg) {
        const r = M.send("KEEP");
        expect(r.ok).toBe(false);
        expect(r.reason).toBe("undersize");
        expect(M.data.onScale).toEqual(f);          // still on the scale: the player must choose again
        expect(M.send("RELEASE").ok).toBe(true);
        expect(M.data.released.at(-1).kg).toBe(f.kg);
        seen++;
        break;
      }
      if (!M.send("KEEP").ok) M.send("RELEASE");
    }
    expect(seen).toBe(1);
    expect(M.data.kept.every((f) => f.species !== "bluefin" || f.kg >= 30)).toBe(true);
  });
  test("every kept bluefin gets the next DEMO tag, is bled and spiked, and goes to -60 °C; others are untagged", () => {
    const M = driveTo("STOW");
    const blue = M.data.kept.filter((f) => f.species === "bluefin");
    expect(blue.length).toBeGreaterThan(0);
    blue.forEach((f, i) => { expect(f.tag).toBe(formatTag(i + 1)); expect(isDemoTag(f.tag)).toBe(true); });
    for (const f of M.data.kept) { expect(f.bled && f.spiked).toBe(true); expect(f.frozenC).toBe(-60); }
    for (const f of M.data.kept.filter((x) => x.species !== "bluefin")) expect(f.tag).toBe(null);
    // no two fish share a tag
    expect(new Set(blue.map((f) => f.tag)).size).toBe(blue.length);
  });
  test("the quota stops the haul: a keep past the allowance is refused and the haul ends", () => {
    const M = driveTo("HAUL", { allowanceKg: 300 });
    let refused = null;
    for (let i = 0; i < 30 && M.state === "HAUL"; i++) {
      M.send("FISH_UP");
      const r = M.send("KEEP");
      if (!r.ok && r.reason === "quota") { refused = M.data.onScale; M.send("RELEASE"); break; }
      if (!r.ok) M.send("RELEASE");
    }
    expect(refused).not.toBe(null);
    expect(M.state).toBe("STOW");
    expect(M.data.haulEnd).toBe("quota");
    expect(M.data.landedKg).toBeLessThanOrEqual(300);
    expect(M.data.next).toBeLessThan(M.data.catch.length);   // fish were still on the line
    expect(M.send("FISH_UP").reason).toBe("illegal");
  });
  test("the quota line is the slide's: Japan 3,779 t of 43,296 t (8.7 %)", () => {
    expect(RULES.japanT).toBe(3779); expect(RULES.tacT).toBe(43296);
    expect(japanSharePct()).toBe("8.7");
  });
});

// ---------------------------------------------------------------------------------------------------------- act 3
describe("ship: Act 3, the true chain", () => {
  test("the order is exactly LAS_PALMAS -> REEFER -> SHIMIZU_WEIGH -> HOMECOMING -> CARD", () => {
    expect(CHAIN_ORDER).toEqual(["TRANSSHIP_LAS_PALMAS", "REEFER", "SHIMIZU_WEIGH", "HOMECOMING", "CARD"]);
    const M = driveTo("STOW");
    M.send("FREEZE_PROGRESS", { h: 36 });
    const seen = [];
    seen.push(M.send("STOW_DONE").state);
    while (M.state !== "CARD") { const r = M.send("NEXT"); expect(r.ok).toBe(true); seen.push(r.state); }
    expect(seen).toEqual(CHAIN_ORDER);
    // the chain never skips a step
    const N = driveTo("TRANSSHIP_LAS_PALMAS");
    expect(EVENTS.NEXT.from).not.toContain("CARD");
    N.send("NEXT"); expect(N.state).toBe("REEFER");
    expect(N.send("RESTART").reason).toBe("illegal");
  });
  test("the ship does not carry the catch home: the fish leave her at Las Palmas", () => {
    expect(CHAIN.map((c) => c.state)).toEqual(CHAIN_ORDER);
    const lp = CHAIN.find((c) => c.state === "TRANSSHIP_LAS_PALMAS"), home = CHAIN.find((c) => c.state === "HOMECOMING");
    expect(lp.carrier).toBe("reefer");
    expect(home.withCatch).toBe(false);
  });
  test("Shimizu: every fish is weighed, and 1 kg over the declared catch is refused", () => {
    const M = driveTo("SHIMIZU_WEIGH");
    const w = M.data.weighIn;
    expect(w.rows.length).toBe(M.data.kept.filter((f) => f.tag).length);
    expect(w.overKg).toBe(0);
    // tamper: one fish weighs 1.2 kg more at the bonded port than declared at sea
    const s = M.snapshot();
    s.data.kept.find((f) => f.tag).weighed = s.data.kept.find((f) => f.tag).kg + 1.2;
    const T = createActs(s);
    expect(weighIn(T.data).overKg).toBeGreaterThanOrEqual(1);
    const r = T.send("NEXT");
    expect(r.ok).toBe(false); expect(r.reason).toBe("over_declared");
    expect(T.state).toBe("SHIMIZU_WEIGH");
  });
  test("the final card lists the player's DEMO tags and sends them to 北かつまぐろ屋 (no discount promise)", () => {
    const M = driveTo("CARD");
    const cards = chainCards(M.data, "ja");
    const card = cards.find((c) => c.state === "CARD");
    expect(card.tags.length).toBe(M.data.kept.filter((f) => f.tag).length);
    for (const t of card.tags) expect(isDemoTag(t)).toBe(true);
    const ja = JSON.parse(readFileSync(ROOT + "data/ship/i18n.json", "utf8"));
    expect(ja.ja["ship.card.line"]).toBe("まぐろの日は北かつまぐろ屋へ");
    const all = JSON.stringify(ja);
    expect(/割引|値引|% ?off|discount|クーポン|coupon|お得/i.test(all)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------- i18n
describe("ship: i18n", () => {
  const D = JSON.parse(readFileSync(ROOT + "data/ship/i18n.json", "utf8"));
  test("JA and EN have exactly the same keys, none empty", () => {
    const ja = Object.keys(D.ja).sort(), en = Object.keys(D.en).sort();
    expect(en).toEqual(ja);
    for (const l of ["ja", "en"]) for (const [k, v] of Object.entries(D[l])) { expect(typeof v).toBe("string"); expect(v.trim().length).toBeGreaterThan(0); }
  });
  test("every key the ship UI and scenes use exists", () => {
    const files = ["src/anime/ui/ship.js", "src/anime/world/ship/chain.js", "src/anime/world/ship/ocean.js", "src/anime/world/ship/voyage.js"];
    const used = new Set();
    for (const f of files) {
      const src = readFileSync(ROOT + f, "utf8");
      for (const m of src.matchAll(/\bt\(\s*['"`](ship\.[\w.]+)['"`]/g)) used.add(m[1]);
      for (const m of src.matchAll(/['"`](ship\.[a-z]+\.[\w.]+)['"`]/g)) used.add(m[1]);
    }
    for (const k of OCEAN_LABEL_KEYS) used.add(k);
    // keys built at run time: act titles and chips, species, every state, the facts list
    for (const a of [1, 2, 3]) { used.add("ship.act" + a); used.add("ship.act" + a + ".sub"); used.add("ship.chip." + a); }
    for (const s of ["bluefin", "bigeye", "albacore"]) used.add("ship.species." + s);
    for (const s of STATES) used.add("ship.state." + s);
    const ui = readFileSync(ROOT + "src/anime/ui/ship.js", "utf8");
    const facts = ui.match(/const keys = \[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((q) => q.slice(1, -1));
    expect(facts.length).toBeGreaterThanOrEqual(10);
    for (const f of facts) used.add("ship.facts." + f);
    for (const c of CHAIN) { used.add(c.title); used.add(c.body); }
    expect(used.size).toBeGreaterThan(40);
    const missing = [...used].filter((k) => !(k in D.ja) && !Object.keys(D.ja).some((j) => j.startsWith(k) && j !== k));   // prefixes of run-time keys (checked above)
    expect(missing).toEqual([]);
  });
  test("the facts are the sourced ones (486 t, 58.60 m, 2020-02-05 みらい造船, EN to LC in 2021)", () => {
    const ja = Object.values(D.ja).join("\n"), en = Object.values(D.en).join("\n");
    for (const s of ["486", "58.60", "2020", "みらい造船", "Starlink", "MSC"]) expect(ja).toContain(s);
    expect(ja).toContain("2021"); expect(en).toContain("2021");
    expect(ja).not.toMatch(/2022年.*(LC|低懸念)/); expect(en).not.toMatch(/2022.*Least Concern/);
    expect(ja).not.toContain("724");
    expect(D.ja["ship.ocean.where"]).toBe("北大西洋 西経10度以西・北緯42度以北 / 8月〜1月の漁期");
    expect(D.ja["ship.haul.japan"]).toContain("3,779t"); expect(D.ja["ship.haul.japan"]).toContain("43,296t"); expect(D.ja["ship.haul.japan"]).toContain("8.7%");
  });
  test("no coordinates or map position in the ocean act", () => {
    for (const l of ["ja", "en"]) for (const [k, v] of Object.entries(D[l])) if (k.startsWith("ship.ocean")) expect(/\d+\s*°\s*\d+|\d+\.\d+\s*[NSEW]\b|\d+°\d+'/.test(v)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------- sendoff / ocean pure parts
describe("ship: sendoff and ocean (pure parts)", () => {
  test("five-colour tapes stretch, then snap past their length", () => {
    expect(TAPE_COLOURS.length).toBe(5);
    expect(tapeState(10, 30).state).toBe("slack");
    expect(tapeState(28, 30).state).toBe("taut");
    expect(tapeState(31, 30).state).toBe("snapped");
    expect(tapeState(10, 30).sag).toBeGreaterThan(tapeState(28, 30).sag);
  });
  test("the horn is a prolonged blast in the COLREG band for a vessel under 75 m", () => {
    const h = hornSpec();
    expect(h.f0).toBeGreaterThanOrEqual(250); expect(h.f0).toBeLessThanOrEqual(700);
    expect(h.blast).toBeGreaterThanOrEqual(4); expect(h.blast).toBeLessThanOrEqual(6);
  });
  test("the music sting is an original tune (a pentatonic melody of our own notes)", () => {
    expect(MELODY.length).toBeGreaterThan(16);
    const scale = new Set([0, 2, 4, 7, 9]);   // a major pentatonic on the tonic
    for (const [semi] of MELODY) if (semi !== null) expect(scale.has(((semi % 12) + 12) % 12)).toBe(true);
  });
  test("the captain's local music file is looked for only on local hosts, never in public, shots or automation", () => {
    expect(musicProbeAllowed({ host: "localhost" })).toBe(true);
    expect(musicProbeAllowed({ host: "127.0.0.1" })).toBe(true);
    expect(musicProbeAllowed({ host: "example.tail1234.ts.net" })).toBe(false);   // the public Funnel link is a ts.net host
    expect(musicProbeAllowed({ host: "example.tail1234.ts.net", search: "?music=local" })).toBe(true);
    expect(musicProbeAllowed({ host: "kesennuma.example.org" })).toBe(false);
    expect(musicProbeAllowed({ host: "localhost", search: "?shot=1" })).toBe(false);
    expect(musicProbeAllowed({ host: "localhost", webdriver: true })).toBe(false);
    expect(musicProbeAllowed({ host: "localhost", search: "?music=0" })).toBe(false);
    expect(musicProbeAllowed({ host: "kesennuma.example.org", search: "?music=local" })).toBe(true);
    const gi = readFileSync(ROOT + ".gitignore", "utf8");
    expect(gi).toContain("data/ship/sendoff-music.mp3");
  });
  test("long swells: bounded, smooth, deterministic", () => {
    let maxH = 0;
    for (let x = -400; x <= 400; x += 37) for (let t = 0; t < 30; t += 3.3) maxH = Math.max(maxH, Math.abs(swellAt(x, x * 0.7, t)));
    expect(maxH).toBeGreaterThan(0.5); expect(maxH).toBeLessThan(3.5);
    expect(swellAt(12, 5, 3)).toBe(swellAt(12, 5, 3));
    expect(Math.abs(swellAt(0, 0, 1) - swellAt(0.5, 0, 1))).toBeLessThan(0.2);
  });
  test("phone memory budget: the act scenes stay inside the phone tier's limits", () => {
    expect(SENDOFF_BUDGET.phone.people).toBeLessThanOrEqual(6);
    expect(SENDOFF_BUDGET.phone.people).toBeLessThan(SENDOFF_BUDGET.high.people);
    expect(SENDOFF_BUDGET.phone.tapes).toBeLessThanOrEqual(24);
    expect(SENDOFF_BUDGET.phone.flagTex).toBeLessThanOrEqual(PHONE.canvasMax);
    expect(OCEAN_BUDGET.phone.grid).toBeLessThanOrEqual(40);
    expect(OCEAN_BUDGET.phone.floats).toBeLessThanOrEqual(24);
    expect(OCEAN_BUDGET.phone.tex).toBeLessThanOrEqual(PHONE.canvasMax);
    // the ocean replaces the town while it is shown, and is freed when it leaves (never both at once)
    const src = readFileSync(ROOT + "src/anime/world/ship/ocean.js", "utf8");
    expect(src).toMatch(/dispose\(\)/);
    expect(src).toMatch(/hideWorld|showWorld/);
  });
});

// ---------------------------------------------------------------------------------------------------------- fix round 2
describe("ship: fix round 2 (the dossier's processing, clock and quota bar)", () => {
  const I18N = JSON.parse(readFileSync(ROOT + "data/ship/i18n.json", "utf8"));
  test("every kept fish is bled, spiked and dressed (gills, guts and tail off), then frozen at -60 °C (dossier §5)", () => {
    const M = driveTo("STOW");
    expect(M.data.kept.length).toBeGreaterThan(0);
    for (const f of M.data.kept) { expect(f.bled).toBe(true); expect(f.spiked).toBe(true); expect(f.dressed).toBe(true); expect(f.frozenC).toBe(-60); }
    for (const k of ["ship.haul.kept", "ship.haul.keptOther"]) {
      expect(I18N.ja[k]).toContain("すぐに血抜き・神経締め、エラ・内臓・尾を取って−60℃の冷凍庫へ");
      expect(I18N.en[k]).toContain("bled and spiked at once, gills, guts and tail removed, then into the −60 °C freezer".replace(/^b/, I18N.en[k].includes("Bled") ? "B" : "b"));
    }
  });
  test("Act 2's clock runs forward: set 05:30-10:00, the soak from 10:00 (sky 11:00), the haul from 12:30 on", async () => {
    const { STAGE_HOURS } = await import("../src/anime/world/ship/ocean.js");
    const { SET_CLOCK } = await import("../src/anime/world/ship/voyage.js");
    const setEnd = SET_CLOCK.start + SET_CLOCK.hours;
    expect(SET_CLOCK.start).toBeCloseTo(5.5, 6); expect(setEnd).toBeCloseTo(10.0, 6);
    expect(STAGE_HOURS.wait).toBeGreaterThanOrEqual(setEnd);                         // never back before the set ended
    expect(STAGE_HOURS.wait).toBeLessThanOrEqual(setEnd + RULES.waitMaxH);
    expect(STAGE_HOURS.haul).toBeGreaterThanOrEqual(setEnd + RULES.waitH + 0.5);     // the haul starts about 12:30-13:00 or later
    expect(STAGE_HOURS.set).toBeLessThan(STAGE_HOURS.wait); expect(STAGE_HOURS.wait).toBeLessThan(STAGE_HOURS.haul); expect(STAGE_HOURS.haul).toBeLessThan(STAGE_HOURS.stow);
  });
  test("the quota bar is the ship's share, about 80 t (Usui, 2026-10-03); this set's catch is a slice of it", () => {
    expect(RULES.shipShareKg).toBe(80000);
    expect(RULES.allowanceKg).toBe(RULES.shipShareKg);
    expect(I18N.ja["ship.haul.quotaBar"]).toContain("この船1隻への配分 約80t（臼井社長, 2026-10-03）");
    expect(I18N.en["ship.haul.quotaBar"]).toContain("about 80 t (Usui, 2026-10-03)");
    const M = driveTo("STOW");
    expect(M.data.landedKg).toBeGreaterThan(0); expect(M.data.landedKg / M.data.allowanceKg).toBeLessThan(0.1);
    expect(M.data.haulEnd).toBe("line_in");                                            // one set never fills the ship's share
    // the old claim is gone from the code and the docs
    for (const f of ["src/anime/world/ship/acts.js", "docs/ship/acts.md", "docs/ship/README.md"]) expect(readFileSync(ROOT + f, "utf8")).not.toMatch(/not public|never shown|ゲームの設定）　\{kg\}/);
  });
});

// ---------------------------------------------------------------------------------------------------------- Usui's talk
// docs/ship/next-pass-usui.md (the captain's product-safe notes of 臼井壯太朗's talk at Hackatsuon, 2026-10-03):
// items 1, 2, 3, 4, 6 and 7. The UI is rendered for real through mountShipUI on a minimal DOM stub.
function withStubDOM(fn) {
  const mk = () => ({ id: "", hidden: false, innerHTML: "", textContent: "", style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(type, fn) { this.on = fn; }, querySelectorAll() { return []; }, querySelector() { return null; }, appendChild() {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
  const prev = globalThis.document;
  globalThis.document = { getElementById: () => null, createElement: () => mk(), head: mk(), body: mk() };
  try { return fn(); } finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
}
async function renderView(view, data, lang, { facts = false, today = null } = {}) {
  const { mountShipUI } = await import("../src/anime/ui/ship.js");
  return withStubDOM(() => {
    const ui = mountShipUI({}, { lang });
    if (today) ui.update({ today });
    ui.show(view, data);
    // the 船のデータ button: a click through the UI's own handler opens the facts panel
    if (facts) ui.el.on({ target: { closest: () => ({ disabled: false, dataset: { a: "facts" } }) } });
    return ui;
  });
}
const textOf = (html) => html.replace(/<[^>]+>/g, "\n").replace(/&quot;/g, '"').replace(/&amp;/g, "&").split("\n").map((x) => x.trim()).filter(Boolean);

describe("ship: Usui's talk, 2026-10-03 (next-pass-usui.md items 1-4, 6, 7)", () => {
  const D = JSON.parse(readFileSync(ROOT + "data/ship/i18n.json", "utf8"));
  const NEW_KEYS = [
    "ship.facts.fleet", "ship.facts.voyage", "ship.facts.aroma", "ship.facts.trivia",
    ...SHIMIZU_STEPS.map((id) => "ship.chain.shimizu.step." + id), "ship.tag.real",
    "ship.card.closing", "ship.card.closingBy",
  ];
  test("i18n: every new key is in JA and EN, filled, and actually translated", () => {
    for (const k of NEW_KEYS) for (const l of ["ja", "en"]) { expect(typeof D[l][k]).toBe("string"); expect(D[l][k].trim().length).toBeGreaterThan(0); }
    for (const k of NEW_KEYS) expect(D.en[k]).not.toBe(D.ja[k]);
    expect(Object.keys(D.en)).toEqual(Object.keys(D.ja));
  });
  test("item 1: 6 ships now, one retired in 2026 (SHIP, the facts panel, the Las Palmas card); no 7-ship count left", async () => {
    const { SHIP } = await import("../src/anime/world/ship/shofukumaru1.js");
    expect(SHIP.fleet).toEqual({ ships: 6, retired: { n: 1, year: 2026 } });
    for (const k of ["ship.facts.fleet", "ship.chain.lp.fact"]) { expect(D.ja[k]).toContain("現在6隻（2026年に1隻退役）"); expect(D.en[k]).toContain("6 tuna vessels (one retired in 2026)"); }
    const all = JSON.stringify(D);
    expect(all).not.toMatch(/気仙沼に3隻|3 ships at Kesennuma|7隻|7 ships/);
  });
  test("item 2: the quota bar is the minister's allocation to this one ship, about 80 t, with the 3,700 t / ~100 boats / 48 context", () => {
    expect(RULES.allowanceKg).toBe(80000);
    expect(D.ja["ship.haul.quotaBar"]).toContain("大臣からこの船1隻への配分 約80t");
    expect(D.en["ship.haul.quotaBar"]).toContain("The minister's allocation to this one ship: about 80 t");
    for (const s of ["約3,700t", "3,779t", "43,296t", "8.7%", "約100隻", "48隻", "大西洋クロマグロ"]) expect(D.ja["ship.haul.japan"]).toContain(s);
    for (const s of ["about 3,700 t", "3,779 t of 43,296 t", "8.7%", "about 100 registered boats", "48 of which fish Atlantic bluefin"]) expect(D.en["ship.haul.japan"]).toContain(s);
    expect([RULES.japanBoats, RULES.japanBluefinBoats]).toEqual([100, 48]);
    expect(japanSharePct()).toBe("8.7");
  });
  test("item 3: Act 3 runs Las Palmas, reefer, the Shimizu inspection steps in order, home, card", () => {
    expect(SHIMIZU_STEPS).toEqual(["inspectors", "chip", "sticker", "truck", "rule"]);
    const M = driveTo("SHIMIZU_WEIGH");
    const beats = [];
    for (const c of chainCards(M.data)) { beats.push(c.state); if (c.steps) for (const st of c.steps) beats.push(c.state + ":" + st.id); }
    expect(beats).toEqual(["TRANSSHIP_LAS_PALMAS", "REEFER", "SHIMIZU_WEIGH", "SHIMIZU_WEIGH:inspectors", "SHIMIZU_WEIGH:chip", "SHIMIZU_WEIGH:sticker", "SHIMIZU_WEIGH:truck", "SHIMIZU_WEIGH:rule", "HOMECOMING", "CARD"]);
    const shimizu = chainCards(M.data).find((c) => c.state === "SHIMIZU_WEIGH");
    expect(shimizu.steps.map((x) => x.n)).toEqual([1, 2, 3, 4, 5]);
    expect(shimizu.steps.filter((x) => x.rule).map((x) => x.id)).toEqual(["rule"]);
    // each fish's chip is scanned and its cheek sticker carries the same number as its tag; the tags stay DEMO
    for (const r of M.data.weighIn.rows) { expect(r.scanned).toBe(true); expect(r.sticker).toBe(r.tag); expect(isDemoTag(r.tag)).toBe(true); }
  });
  test("item 3: the Shimizu captions (3 inspectors, reader guns, the cheek sticker, truck scales, all 6 licences) and the real tag copy", async () => {
    expect(RULES.inspectors).toBe(3); expect(RULES.fleetShips).toBe(6);
    const M = driveTo("SHIMIZU_WEIGH");
    for (const [lang, want] of [
      ["ja", ["水産庁の検査官 約3人", "リーダーガンで、1本ずつICチップを読み取る", "同じ番号のシールを、魚のほほに貼る", "トラックスケール", "1kgでも超えれば、臼福の6隻すべてが漁業許可を失い、罰金や懲役", "ICチップ＋QRコードで、1番からの通し番号"]],
      ["en", ["About 3 Fisheries Agency inspectors", "scan each fish's chip with a reader gun", "same number goes on the fish's cheek", "weighed on truck scales", "1 kg over the quota means losing the licences of all 6 ships, plus fines or prison", "IC chip plus QR code, numbered from 1"]],
    ]) {
      const ui = await renderView("SHIMIZU_WEIGH", M.data, lang);
      const html = ui.el.innerHTML;
      const order = [...html.matchAll(/data-step="(\w+)"/g)].map((m) => m[1]);
      expect(order).toEqual(SHIMIZU_STEPS);
      const text = textOf(html).join("\n");
      for (const s of want) expect(text).toContain(s);
      for (const r of M.data.weighIn.rows) expect(html).toContain(r.tag);
    }
  });
  test("item 4: the crew life copy in the facts panel and the crew card, JA and EN", () => {
    expect(D.ja["ship.facts.voyage"]).toContain("9〜15か月"); expect(D.en["ship.facts.voyage"]).toContain("9 to 15 months");
    expect(D.ja["ship.facts.crew"]).toContain("日本人6〜7人、インドネシア人約18人"); expect(D.en["ship.facts.crew"]).toContain("6–7 Japanese, about 18 Indonesian");
    expect(D.ja["ship.facts.aroma"]).toContain("「気仙沼を思い出しながら眠れるように」"); expect(D.en["ship.facts.aroma"]).toContain("sleep remembering home, Kesennuma, Japan");
    expect(D.ja["ship.facts.aroma"]).toContain("森の香り"); expect(D.en["ship.facts.aroma"]).toContain("forest-scent aroma");
    for (const s of ["9〜15か月", "日本人6〜7人", "インドネシア人約18人", "気仙沼を思い出しながら眠れるように"]) expect(D.ja["ship.chain.home.fact"]).toContain(s);
    for (const s of ["9 to 15 months", "6–7 Japanese", "about 18 Indonesian", "sleep remembering home, Kesennuma, Japan"]) expect(D.en["ship.chain.home.fact"]).toContain(s);
  });
  test("items 1, 4, 6: the facts panel lists the fleet, the voyage, the aroma and the Precure trivia as text only", async () => {
    const ui = readFileSync(ROOT + "src/anime/ui/ship.js", "utf8");
    const keys = ui.match(/const keys = \[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((q) => q.slice(1, -1));
    for (const k of ["crew", "voyage", "aroma", "fleet", "trivia"]) expect(keys).toContain(k);
    for (const lang of ["ja", "en"]) {
      const text = textOf((await renderView("HAUL", driveTo("HAUL").data, lang, { facts: true })).el.innerHTML);
      for (const k of ["crew", "voyage", "aroma", "fleet", "trivia"]) expect(text).toContain(D[lang]["ship.facts." + k]);
      expect(text).toContain(D[lang]["ship.facts.title"]);
    }
    expect(D.ja["ship.facts.trivia"]).toContain("デリシャスパーティ♡プリキュア"); expect(D.ja["ship.facts.trivia"]).toContain("主人公の父がまぐろ船の船長");
    expect(D.en["ship.facts.trivia"]).toContain("the heroine's father is a tuna-boat captain");
    expect(D.en["ship.facts.trivia"]).not.toContain("their");
    // text only: no Precure image, file or URL anywhere in the app
    const files = [];
    const walk = (d) => { for (const e of readdirSync(ROOT + d, { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) walk(p); else files.push(p); } };
    walk("src"); walk("data/ship");
    expect(files.filter((f) => /precure|cure|プリキュア/i.test(f))).toEqual([]);
    for (const f of files.filter((x) => /\.(js|html|css)$/.test(x))) expect(readFileSync(ROOT + f, "utf8")).not.toMatch(/precure|プリキュア/i);
  }, 30000);   // reads every file under src/ and data/ship: it timed out at the 5 s default under machine load
  test("the facts panel's source line names every body its numbers come from, including MSC (the 2020 certification) and IUCN (EN to LC)", () => {
    for (const k of ["ICCAT", "IUCN", "MSC", "WCPFC", "JASNAOE"]) expect(D.en["ship.facts.src"]).toContain(k);
    for (const k of ["ICCAT", "IUCN", "MSC", "WCPFC", "臼福本店", "臼井壯太朗"]) expect(D.ja["ship.facts.src"]).toContain(k);
  });
  test("the Precure trivia says the same in JA and EN: a tuna-boat captain, no 'their' boat", () => {
    expect(D.ja["ship.facts.trivia"]).toContain("主人公の父がまぐろ船の船長");
    expect(D.en["ship.facts.trivia"]).toBe("Trivia: in the anime デリシャスパーティ♡プリキュア, the heroine's father is a tuna-boat captain");
  });
  test("the ocean banner claims the real ship is fishing 'right now' only inside the Aug-Jan season (the page stays up all year)", async () => {
    const { oceanNoposKey, todayJst } = await import("../src/anime/world/ship/acts.js");
    for (const d of ["2026-10-10", "2026-08-01", "2027-01-31", "2026-12-25"]) expect(oceanNoposKey(d)).toBe("ship.ocean.nopos");
    for (const d of ["2027-02-01", "2027-03-15", "2026-07-31", "2026-06-30"]) expect(oceanNoposKey(d)).toBe("ship.ocean.nopos.off");
    expect(todayJst(Date.UTC(2026, 9, 3, 16, 0))).toBe("2026-10-04");   // JST is UTC+9
    expect(D.ja["ship.ocean.nopos"]).toContain("いまこの海で操業しています");
    expect(D.en["ship.ocean.nopos"]).toContain("fishing these waters right now");
    expect(D.ja["ship.ocean.nopos.off"]).toContain("毎年8月〜1月の漁期"); expect(D.ja["ship.ocean.nopos.off"]).not.toContain("いま");
    expect(D.en["ship.ocean.nopos.off"]).toContain("each Aug–Jan season"); expect(D.en["ship.ocean.nopos.off"]).not.toContain("right now");
    for (const lang of ["ja", "en"]) {
      const inSeason = textOf((await renderView("OCEAN_SET", driveTo("OCEAN_SET").data, lang, { today: "2026-10-10" })).el.innerHTML).join("\n");
      const off = textOf((await renderView("OCEAN_SET", driveTo("OCEAN_SET").data, lang, { today: "2027-03-01" })).el.innerHTML).join("\n");
      expect(inSeason).toContain(D[lang]["ship.ocean.nopos"]); expect(inSeason).not.toContain(D[lang]["ship.ocean.nopos.off"]);
      expect(off).toContain(D[lang]["ship.ocean.nopos.off"]); expect(off).not.toContain(D[lang]["ship.ocean.nopos"]);
    }
  });
  test("item 7: the final card ends on Usui's line, attributed to 臼井壯太朗 (臼福本店) at Hackatsuon on 2026-10-03", async () => {
    expect(CLOSING).toEqual({ line: "ship.card.closing", by: "ship.card.closingBy" });
    expect(D.ja["ship.card.closing"]).toBe("「気仙沼の食を、世界中で楽しんでもらい、輸出していこう。」");
    expect(D.en["ship.card.closing"]).toBe("\"Help Kesennuma's food be enjoyed, and exported, all over the world.\"");
    for (const l of ["ja", "en"]) for (const s of ["臼井壯太朗", "臼福本店", "Hackatsuon"]) expect(D[l]["ship.card.closingBy"]).toContain(s);
    expect(D.ja["ship.card.closingBy"]).toContain("2026年10月3日"); expect(D.en["ship.card.closingBy"]).toContain("2026-10-03");
    const M = driveTo("CARD");
    for (const lang of ["ja", "en"]) {
      const ui = await renderView("CARD", M.data, lang);
      const html = ui.el.innerHTML;
      const beforeButtons = textOf(html.slice(0, html.indexOf('<div class="row"')));
      expect(beforeButtons.at(-2)).toBe(D[lang]["ship.card.closing"]);
      expect(beforeButtons.at(-1)).toBe("— " + D[lang]["ship.card.closingBy"]);
      expect(textOf(html)).toContain(D[lang]["ship.card.line"]);
    }
  });
});
