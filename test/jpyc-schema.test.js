// [jpyc] data/shops/jpyc.json: its schema, the demo entry, the consent gate, and that the app (ui/jpyc-lib.js) and the production proxy (server/app/jpyc.js) decide the same
// thing for every entry. The two keep their own copy of the rule (the codebase's convention: no import across the server / app line); this file is what stops them drifting.
import { describe, test, expect, setSystemTime, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateFile, validateEntry, visibleEntries, entryVisible, hasConsent as appConsent, alcoholAllowed as appAlcohol, isCalendarDate as appDate, SLUG_RE as APP_SLUG, CONSENT_SCOPES as APP_SCOPES, KINDS as APP_KINDS, publicHost as appHost, safeImage as appImage } from "../src/anime/ui/jpyc-lib.js";
import { buildAllowlist, entryAllowed, hasConsent as srvConsent, alcoholAllowed as srvAlcohol, isCalendarDate as srvDate, SLUG_RE as SRV_SLUG, ID_RE, CONSENT_SCOPES as SRV_SCOPES, KINDS as SRV_KINDS, publicHost as srvHost, safeImageUrl as srvImage } from "../server/app/jpyc.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const FILE = JSON.parse(read("data/shops/jpyc.json"));
const T0 = Date.UTC(2026, 9, 6, 6, 0, 0);

describe("data/shops/jpyc.json as shipped", () => {
  test("it is sound: the envelope, every entry, unique ids and shop slugs", () => {
    expect(validateFile(FILE)).toEqual([]);
    expect(FILE.schema).toBe("klc-jpyc-shops/1"); expect(FILE.version).toBe(1); expect(FILE.doc).toBe("docs/jpyc/README.md");
  });
  test("it starts with ONE entry: the platform's own demo shop, kind demo, never attributed to a Kesennuma business", () => {
    expect(FILE.entries.length).toBe(1);
    const e = FILE.entries[0];
    expect([e.id, e.kind, e.enabled, e.shopSlug, e.consent, e.productIds, e.googleMapsQuery, e.googleMapsPlaceId]).toEqual(["jpyc-demo", "demo", false, "otameshi", null, null, null, null]);   // (enabled: false is THE SWITCH, shipped off)
    expect(e.ja).toBe("JPYC EC デモショップ"); expect(e.en).toBe("JPYC EC demo shop");
    expect(FILE.entries.filter((x) => x.kind === "kesennuma").length).toBe(0);   // (a real shop enters with its consent record, after the owner agreed)
    expect(`${e.ja} ${e.en}`).not.toMatch(/気仙沼|Kesennuma|男山|K-port|マンボ|エール|etrepas|Black Tide/i);
  });
  test("the demo is parked at the PIER7 walk spot of the tour (the demo's venue), so its x and z come from the layout, not from a guess", () => {
    const layout = JSON.parse(read("data/anime/layout.json"));
    const pier7 = layout.tour.find((s) => s.id === "pier7");
    expect([FILE.entries[0].x, FILE.entries[0].z]).toEqual([pier7.walk.x, pier7.walk.z]);
  });
  test("the demo shop's own slug is the one JPYC EC marks is_demo (the recorded response)", () => {
    const rec = JSON.parse(read("test/fixtures/jpyc/shop-otameshi-products.json")).data.shop;
    expect([rec.slug, rec.is_demo]).toEqual([FILE.entries[0].shopSlug, true]);
  });
  test("PRODUCTION DEFAULT: as shipped, the visitor and the proxy get NOTHING (no menu item, no sheet, no platform call): the demo is switched off", () => {
    expect(FILE.entries.every((e) => e.kind === "demo" ? e.enabled === false : false)).toBe(true);
    expect(visibleEntries(FILE, { now: T0 })).toEqual([]); expect([...buildAllowlist(FILE, { now: T0 }).shops.keys()]).toEqual([]);
    // dev (a dev host's ?jpyc=dev, a dev server's JPYC_DEV=1) still sees it, labelled as switched off
    expect(visibleEntries(FILE, { dev: true, now: T0 }).map((e) => [e.id, e.off])).toEqual([["jpyc-demo", true]]); expect([...buildAllowlist(FILE, { dev: true, now: T0 }).shops.keys()]).toEqual(["otameshi"]);
  });
  test("THE SWITCH, flipped on the real file: set the demo's enabled to true and the visitor and the proxy both get the demo, the same one", () => {
    const on = { ...FILE, entries: FILE.entries.map((e) => ({ ...e, enabled: true })) };
    expect(validateFile(on, { now: T0 })).toEqual([]);
    expect(visibleEntries(on, { now: T0 }).map((e) => [e.id, e.off])).toEqual([["jpyc-demo", false]]); expect([...buildAllowlist(on, { now: T0 }).shops.keys()]).toEqual(["otameshi"]);
    // the flag is the only difference: the text of the file differs from the flipped one in exactly the one value
    expect(read("data/shops/jpyc.json").replace('"enabled": false', '"enabled": true')).toBe(JSON.stringify(on, null, 2) + "\n");
  });
  test("the file says where the switch is (a note at the top) and the schema makes a demo carry the key", () => {
    expect(FILE.note).toMatch(/THE SWITCH/); expect(FILE.note).toMatch(/"enabled": true/); expect(FILE.note).toMatch(/consent/); expect(FILE.note).toContain("docs/jpyc/README.md");
    const noFlag = { ...FILE, entries: FILE.entries.map(({ enabled, ...rest }) => rest) };
    expect(validateFile(noFlag, { now: T0 }).join()).toMatch(/must say "enabled"/);
  });
});

describe("the schema, fault by fault", () => {
  const good = { id: "k-port", kind: "kesennuma", ja: "K-port", en: "K-port", x: 120.6, z: 124.7, shopSlug: "k-port", productIds: null, consent: null, googleMapsQuery: "K-port 気仙沼" };
  const file = (...entries) => ({ schema: "klc-jpyc-shops/1", version: 1, entries });
  test("a sound file; a pending Kesennuma entry is allowed in the file (it is hidden at run time, not forbidden)", () => {
    expect(validateFile(file(FILE.entries[0], good), { now: T0 })).toEqual([]);
    expect(validateFile(file(FILE.entries[0], { ...good, consent: { owner: "K-port", date: "2026-10-05", scope: ["jpyc-listing", "display-event"], ref: "message of 5 Oct" } }), { now: T0 })).toEqual([]);
  });
  test("the envelope", () => {
    for (const bad of [null, [], "x", 5]) expect(validateFile(bad)).toEqual(["the file is not an object"]);
    expect(validateFile({ ...file(), schema: "x" }).join()).toMatch(/schema must/); expect(validateFile({ ...file(), version: 2 }).join()).toMatch(/version must/); expect(validateFile({ schema: "klc-jpyc-shops/1", version: 1, entries: {} }).join()).toMatch(/entries must/);
  });
  test("ids and shop slugs are unique", () => {
    expect(validateFile(file(good, { ...good, shopSlug: "other" }), { now: T0 }).join()).toMatch(/id k-port is used twice/);
    expect(validateFile(file(good, { ...good, id: "other" }), { now: T0 }).join()).toMatch(/shopSlug k-port is used twice/);
  });
  test("coordinates are numbers inside the town; names are 1 to 80 characters; the maps query has no control characters", () => {
    for (const bad of [{ x: NaN }, { x: Infinity }, { x: null }, { x: "5" }, { z: 21000 }, { z: -21000 }]) expect(validateEntry({ ...good, ...bad }, { now: T0 }).length).toBeGreaterThan(0);
    for (const ok of [{ x: 0, z: 0 }, { x: -20000, z: 20000 }, { x: 1e-3, z: -5.5 }]) expect(validateEntry({ ...good, ...ok }, { now: T0 })).toEqual([]);
    for (const bad of [{ ja: "" }, { ja: " " }, { en: "e".repeat(81) }, { ja: null }, { en: 5 }]) expect(validateEntry({ ...good, ...bad }, { now: T0 }).length).toBeGreaterThan(0);
    for (const bad of [{ googleMapsQuery: "a\u0007b" }, { googleMapsQuery: "" }, { googleMapsQuery: 5 }, { googleMapsQuery: "x".repeat(201) }]) expect(validateEntry({ ...good, ...bad }, { now: T0 }).length).toBeGreaterThan(0);
  });
});

describe("the consent gate: one table, two implementations", () => {
  const OWNERS = [undefined, null, "", "  ", "K-port", 5, {}];
  const DATES = [undefined, null, "", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-02-30", "2026-13-01", "5 Oct", "2026-10-05T00:00:00Z", 20261005];
  const SCOPES = [undefined, null, [], "jpyc-listing", ["jpyc-listing"], ["jpyc-listing", "display-event"], ["display-event"], ["jpyc-listing", "bogus"], ["bogus"], ["display-web", "display-event", "jpyc-listing"], 5];
  const consents = [null, undefined, "yes", [], 5];
  for (const owner of OWNERS) for (const date of DATES) for (const scope of SCOPES) consents.push({ owner, date, scope });
  test(`hasConsent agrees on all ${consents.length} consent records, and on the date rule`, () => {
    let yes = 0;
    for (const c of consents) { const a = appConsent(c, T0), b = srvConsent(c, T0); if (a !== b) throw new Error("the app and the server disagree on " + JSON.stringify(c)); if (a) yes++; }
    expect(yes).toBeGreaterThan(5); expect(yes).toBeLessThan(consents.length / 10);
    for (const d of DATES) expect([d, appDate(d, T0)]).toEqual([d, srvDate(d, T0)]);
  });
  test(`alcoholAllowed (the licence and the age check in words and a real date) agrees on every declaration of a table, and the shipped file declares nothing`, () => {
    const LIC = [undefined, null, "", "  ", "通信販売酒類小売業免許", 5, {}], AGE = [undefined, null, "", " ", "注文時に生年月日を確認", 7, []], CONF = [undefined, null, "", "2026-10-05", "2026-10-09", "2026-02-30", "5 Oct", 20261005];
    const decls = [null, undefined, "yes", [], 5];
    for (const mailOrderLicence of LIC) for (const ageCheck of AGE) for (const confirmed of CONF) decls.push({ mailOrderLicence, ageCheck, confirmed });
    let yes = 0;
    for (const d of decls) { const a = appAlcohol(d, T0), b = srvAlcohol(d, T0); if (a !== b) throw new Error("the app and the server disagree on " + JSON.stringify(d)); if (a) yes++; }
    expect(yes).toBe(1);   // (only the whole declaration: a licence, an age check, a date; half of it never counts)
    for (const e of FILE.entries) expect([e.id, e.alcohol ?? null, e.notAlcohol ?? null]).toEqual([e.id, null, null]);
  });
  test("the words are the same: kinds, consent scopes, and the safe-segment rule", () => {
    expect(APP_KINDS).toEqual(SRV_KINDS); expect(APP_SCOPES).toEqual(SRV_SCOPES); expect(APP_SLUG.source).toBe(SRV_SLUG.source); expect(APP_SLUG.source).toBe(ID_RE.source);
    for (const s of ["otameshi", "56gorodao56", "yorikomatsudaira-officialwebsite", "a_b", "A", "-x", "a/b", "a.b", "", "x".repeat(64), "x".repeat(65), "ü", "a b"]) expect([s, APP_SLUG.test(s)]).toEqual([s, SRV_SLUG.test(s)]);
  });
  test("the image host rule is the same on both sides, on hosts and on whole URLs", () => {
    const hosts = ["imagedelivery.net", "cdn.a-b.example.com", "A.B.COM", "localhost", "localhost.", "a.localhost", "127.0.0.1", "127.1", "10.0.0.1", "169.254.169.254", "[::1]", "::1", "intranet", "printer.local", "db.internal", "nas.lan", "x.corp", "a..b.com", "-a.com", "a.com.", "a_b.com", "x".repeat(64) + ".com", "", "xn--wgv71a.jp", "a.c", "a.toolongtld" + "x".repeat(20), null, undefined, 5];
    for (const h of hosts) expect([h, appHost(h)]).toEqual([h, srvHost(h)]);
    const urls = ["https://imagedelivery.net/a/b/public", "http://imagedelivery.net/a", "https://u:p@imagedelivery.net/a", "https://localhost/a", "https://127.1/a", "https://[::1]/a", "javascript:alert(1)", "data:image/png;base64,AA", "//imagedelivery.net/a", "/a.png", "", "https://" + "a".repeat(2100) + ".com/", null, 5];
    for (const u of urls) expect([u, appImage(u)]).toEqual([u, srvImage(u)]);
  });
  test("entry by entry, in normal and dev mode, the app shows exactly the shops the proxy would serve", () => {
    const good = { id: "k-port", ja: "K-port", en: "K-port", x: 1, z: 2, productIds: null };
    const entries = [];
    let n = 0;
    for (const kind of ["demo", "kesennuma", "other", undefined]) for (const enabled of [undefined, true, false, "yes"]) for (const slug of ["shop-a", "../x", "", "a/b", "Z9_-"]) for (const consent of [null, { owner: "o", date: "2026-10-05", scope: ["jpyc-listing"] }, { owner: "", date: "2026-10-05", scope: ["jpyc-listing"] }, { owner: "o", date: "2999-01-01", scope: ["jpyc-listing"] }, { owner: "o", date: "2026-10-05", scope: ["display-event"] }]) {
      entries.push({ ...good, id: "e" + n++, kind, ...(enabled === undefined ? {} : { enabled }), shopSlug: slug, consent: kind === "demo" ? null : consent });
    }
    for (const dev of [false, true]) {
      for (const e of entries) { const a = entryVisible(e, { dev, now: T0 }), b = entryAllowed(e, { dev, now: T0 }); if (a !== b) throw new Error(`disagree (dev ${dev}) on ${JSON.stringify(e)}`); }
      // the whole file at once: the same shops, in the same order (every entry here is sound, so the app's shape check passes the ones the gate passes)
      // (the whole file at once, over the entries whose shape is sound for the app: a demo without an explicit boolean, or any non-boolean flag, is a damaged entry the app skips and the server's gate reads by its own words)
      const sound = entries.filter((e) => validateEntry(e, { now: T0 }).length === 0);
      const app = visibleEntries({ entries: sound }, { dev, now: T0 }).map((e) => e.shopSlug), srv = [...buildAllowlist({ entries: sound }, { dev, now: T0 }).shops.keys()];
      expect(app).toEqual(srv); expect(sound.length).toBeGreaterThan(20);
    }
  });
  test("a Kesennuma entry without a consent record is never visible in normal mode, whatever else it carries; dev mode shows it as pending", () => {
    const e = { id: "pending", kind: "kesennuma", ja: "p", en: "p", x: 0, z: 0, shopSlug: "p-shop", consent: null, googleMapsQuery: "p 気仙沼" };
    expect(visibleEntries({ entries: [e] }, { now: T0 })).toEqual([]); expect(buildAllowlist({ entries: [e] }, { now: T0 }).shops.size).toBe(0);
    expect(visibleEntries({ entries: [e] }, { dev: true, now: T0 }).map((x) => x.pending)).toEqual([true]);
  });
});

describe("the clock: CI checks the dates, a visitor's phone never decides who may be shown", () => {
  afterEach(() => setSystemTime());
  const cafe = { id: "k-port", kind: "kesennuma", ja: "K-port", en: "K-port", x: 1, z: 2, shopSlug: "k-port", productIds: null, consent: { owner: "K-port", date: "2026-10-05", scope: ["jpyc-listing"] } };
  test("with the device clock years in the past (or in the future), the app and the proxy still show a consented shop and still hide a pending one", () => {
    const pending = { ...cafe, id: "p", shopSlug: "p-shop", consent: null };
    for (const when of ["2001-01-01T00:00:00Z", "2020-01-01T00:00:00Z", "2026-10-06T00:00:00Z", "2099-01-01T00:00:00Z"]) {
      setSystemTime(new Date(when));
      const demoOn = { ...FILE.entries[0], enabled: true };
      expect([when, visibleEntries({ entries: [demoOn, cafe, pending] }).map((e) => e.id)]).toEqual([when, ["jpyc-demo", "k-port"]]);
      expect([when, [...buildAllowlist({ entries: [demoOn, cafe, pending] }).shops.keys()]]).toEqual([when, ["otameshi", "k-port"]]);
    }
  });
  test("CI: the schema check runs against the real date, so a consent date in the future (a typo like 2062) fails the test that guards the data file", () => {
    const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    expect(validateFile({ schema: "klc-jpyc-shops/1", version: 1, entries: [{ ...cafe, consent: { ...cafe.consent, date: soon } }] }).join()).toMatch(/consent\.date is not a real date/);
    expect(validateFile({ schema: "klc-jpyc-shops/1", version: 1, entries: [{ ...cafe, consent: { ...cafe.consent, date: "2062-10-05" } }] }).join()).toMatch(/consent\.date/);
    expect(validateFile({ schema: "klc-jpyc-shops/1", version: 1, entries: [cafe] })).toEqual([]);
    expect(validateFile(FILE)).toEqual([]);
  });
});

describe("the strings file and the other new files", () => {
  test("data/ui-jpyc-i18n.json is a pair of equal key sets (the lib test checks the words), and no other file's strings were touched", () => {
    const j = JSON.parse(read("data/ui-jpyc-i18n.json"));
    expect(Object.keys(j).sort()).toEqual(["en", "ja"]); expect(Object.keys(j.en).sort()).toEqual(Object.keys(j.ja).sort());
    for (const f of ["data/i18n.json", "data/ui-touch-i18n.json", "data/ui-contrib-i18n.json"]) expect(Object.keys(JSON.parse(read(f)).ja).some((k) => k.startsWith("jpyc."))).toBe(false);
  });
  test("no disaster word in the data and strings this lane writes", () => {
    const WORDS = ["201" + "1", "3." + "11", "tsu" + "nami", "津" + "波", "震" + "災"];
    for (const f of ["data/shops/jpyc.json", "data/ui-jpyc-i18n.json", "test/jpyc-lib.test.js", "test/jpyc-schema.test.js", "test/jpyc-hud.test.js", "test/fixtures/jpyc/shops-demo-only.json", "test/fixtures/jpyc/shop-otameshi-products.json", "test/fixtures/jpyc/product-otameshi.json"]) {
      let text; try { text = read(f).toLowerCase(); } catch { continue; }
      for (const w of WORDS) expect([f, w, text.includes(w.toLowerCase())]).toEqual([f, w, false]);
    }
  });
  test("the fixtures hold no personal data: the wallet address is the zero address, no SNS handle, no e-mail, no phone number", () => {
    for (const f of ["shops-demo-only", "shop-otameshi-products", "product-otameshi", "shop-not-found"]) {
      const text = read(`test/fixtures/jpyc/${f}.json`);
      for (const m of text.matchAll(/0x[0-9a-fA-F]{40}/g)) expect(m[0]).toBe("0x0000000000000000000000000000000000000000");
      expect(text).not.toMatch(/@[A-Za-z0-9_.-]+\.[a-z]{2,}|x\.com\/|twitter\.com|instagram\.com|\b0\d{1,3}-\d{2,4}-\d{3,4}\b|mameta/i);
    }
  });
});
