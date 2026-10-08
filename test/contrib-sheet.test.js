// [contrib] The 「修正を報告」 sheet: its markup (parsed with HTMLRewriter: roles, labels, targets, escaping, both languages), its CSS (the three
// layouts, safe areas, 44 px targets, no layout-moving transitions), the HUD wiring (nothing existing moves), and the controller (ui/contrib.js)
// driven through a registry-based fake DOM and a mocked fetch: open and close, focus, the keys, sending, errors, photos, the draft, the transfer code.
// The real-browser behaviour (focus trap, layout shift, 44 px on a phone, the screenshot) is checked by tools/anime/contrib-shots.mjs.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { CSS, CONTRIB_CSS } from "../src/anime/ui/style.js";
import { CSS as PAD_CSS } from "../src/anime/ui/touchpad-style.js";
import { createT, STRINGS, CATEGORIES, KEYS, safeStorage, loadDraft, loadProfile, saveProfile, createAccounts } from "../src/anime/ui/contrib-lib.js";
import { shellHtml, formHtml, shotHtml, tilesHtml, footHtml, doneHtml, privacyHtml, mineHtml, boardHtml, xferHtml, xferCardHtml, eraseHtml, eraseCardHtml, itemHtml, esc } from "../src/anime/ui/contrib-view.js";
import { mountContrib, nextFocus, focusables, BACKGROUND, FOCUSABLE } from "../src/anime/ui/contrib.js";
import { qrEncode, qrToSvg } from "../src/anime/ui/qr.js";
import { quaternionFromYawPitch } from "../src/anime/core/pose.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// ------------------------------------------------------------------ markup helpers
/** Elements matching each selector: { tag, attrs, text (the text of the whole subtree) }. */
async function scan(html, ...sels) {
  const out = Object.fromEntries(sels.map((s) => [s, []]));
  let rw = new HTMLRewriter();
  for (const sel of sels) {
    let cur = null;
    rw = rw.on(sel, { element(el) { cur = { tag: el.tagName, attrs: Object.fromEntries([...el.attributes]), text: "" }; out[sel].push(cur); }, text(t) { if (cur) cur.text += t.text; } });
  }
  await rw.transform(new Response(html)).text();
  return out;
}
const model = (o = {}) => ({ lang: "ja", tab: "report", kind: "issue", category: "", note: "", nickname: "", crewNo: "", consent: false, photos: [], shot: { state: "wait" }, aspect: 390 / 844, meta: ["歩く", "夕方", "秋"],
  testHost: "", mine: { state: "loading" }, board: { state: "loading" }, xfer: { phase: "idle" }, claim: { open: false, value: "", error: "", busy: false, hint: "" }, erase: { phase: "idle" }, notice: "", hasAccount: false, contact: "",
  langBtn: { text: "EN", aria: "言語を切り替え" }, ...o });
const TJ = createT(() => "ja"), TE = createT(() => "en");

describe("the markup: a modal dialog with tabs, native controls and labels", () => {
  const html = shellHtml(model(), TJ);
  test("one dialog: role, aria-modal, labelled by its title; one scrolling body that the touch pad lets through (data-scroll); a polite live region", async () => {
    const r = await scan(html, "section.kc-sheet", "h2", ".kc-body", ".kc-live");
    expect(r["section.kc-sheet"]).toHaveLength(1);
    expect(r["section.kc-sheet"][0].attrs).toMatchObject({ role: "dialog", "aria-modal": "true", "aria-labelledby": "kc-title", tabindex: "-1" });
    expect(r.h2[0].attrs.id).toBe("kc-title"); expect(r.h2[0].text).toBe("修正を報告");
    expect(r[".kc-body"]).toHaveLength(1); expect(r[".kc-body"][0].attrs).toHaveProperty("data-scroll");
    expect(r[".kc-live"][0].attrs).toMatchObject({ role: "status", "aria-live": "polite" });
  });
  test("three tabs (報告する / マイ投稿 / 貢献ランキング): roles, one selected, a roving tabindex, aria-controls point at real tab panels labelled by them", async () => {
    const r = await scan(html, '[role="tablist"]', '[role="tab"]', '[role="tabpanel"]');
    expect(r['[role="tablist"]'][0].attrs["aria-label"]).toBe("表示を切り替え");
    const tabs = r['[role="tab"]']; expect(tabs.map((t) => t.text)).toEqual(["報告する", "マイ投稿", "貢献ランキング"]);
    expect(tabs.map((t) => t.attrs["aria-selected"])).toEqual(["true", "false", "false"]); expect(tabs.map((t) => t.attrs.tabindex)).toEqual(["0", "-1", "-1"]);
    const panels = r['[role="tabpanel"]']; expect(panels).toHaveLength(3);
    for (const t of tabs) { const p = panels.find((x) => x.attrs.id === t.attrs["aria-controls"]); expect(p).toBeTruthy(); expect(p.attrs["aria-labelledby"]).toBe(t.attrs.id); }
    expect(tabs.every((t) => t.attrs["data-act"] === "tab")).toBe(true);
  });
  test("the selected tab follows the model", async () => {
    const r = await scan(shellHtml(model({ tab: "board" }), TJ), '[role="tab"]');
    expect(r['[role="tab"]'].map((t) => t.attrs["aria-selected"])).toEqual(["false", "false", "true"]); expect(r['[role="tab"]'].map((t) => t.attrs.tabindex)).toEqual(["-1", "-1", "0"]);
  });
  test("every button has a type; every icon-only button has an aria-label", async () => {
    const r = await scan(html, "button");
    for (const b of r.button) { expect([b.attrs["data-act"], b.attrs.type]).toEqual([b.attrs["data-act"], expect.stringMatching(/^(button|submit)$/)]); if (!b.text.trim()) expect(b.attrs["aria-label"]).toBeTruthy(); }
    const close = r.button.find((b) => b.attrs["data-act"] === "close"); expect(close.attrs["aria-label"]).toBe("閉じる");
  });
  test("every field has a name: a <label for>, a wrapping <label>, or an aria-label (and nothing points at a missing id)", async () => {
    const r = await scan(html, "input", "textarea", "label[for]", "label input", "[id]", "[aria-describedby]");
    const ids = new Set(r["[id]"].map((e) => e.attrs.id)), labelled = new Set(r["label[for]"].map((l) => l.attrs.for));
    const wrapped = new Set(r["label input"].map((i) => i.attrs.name + ":" + (i.attrs.value || i.attrs.id)));
    for (const f of [...r.input, ...r.textarea]) {
      const ok = labelled.has(f.attrs.id) || wrapped.has(f.attrs.name + ":" + (f.attrs.value || f.attrs.id)) || f.attrs["aria-label"];
      expect([f.attrs.id || f.attrs.name, !!ok]).toEqual([f.attrs.id || f.attrs.name, true]);
    }
    for (const l of r["label[for]"]) expect(ids.has(l.attrs.for)).toBe(true);
    for (const e of r["[aria-describedby]"]) for (const id of e.attrs["aria-describedby"].split(" ")) expect([id, ids.has(id)]).toEqual([id, true]);
  });
  test("ids are unique", async () => {
    const r = await scan(html, "[id]"); const ids = r["[id]"].map((e) => e.attrs.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("the kind is two native radios (問題を報告 / 現地の写真で直す) in a fieldset with a legend; exactly the model's is checked", async () => {
    for (const kind of ["issue", "fix"]) {
      const r = await scan(shellHtml(model({ kind }), TJ), 'input[name="kind"]', "fieldset.kc-kind legend", ".kc-card b");
      expect(r['input[name="kind"]'].map((i) => i.attrs.value)).toEqual(["issue", "fix"]);
      expect(r['input[name="kind"]'].filter((i) => "checked" in i.attrs).map((i) => i.attrs.value)).toEqual([kind]);
      expect(r["fieldset.kc-kind legend"][0].text).toBe("どちらにしますか？"); expect(r[".kc-card b"].map((b) => b.text)).toEqual(["問題を報告", "現地の写真で直す"]);
    }
  });
  test("both kinds explain themselves in one line each (shown by CSS from data-kind): the fix line says on-site photos carry their location", async () => {
    const r = await scan(html, ".kc-descs p[data-only]");
    expect(r[".kc-descs p[data-only]"].map((p) => p.attrs["data-only"])).toEqual(["issue", "fix"]);
    expect(r[".kc-descs p[data-only]"][1].text).toContain("場所の情報"); expect(r[".kc-descs p[data-only]"][0].text).toContain("自動で");
  });
  test("six categories with the spec's values, each with an example; the three examples of the brief are there", async () => {
    const r = await scan(shellHtml(model({ category: "sign" }), TJ), 'input[name="category"]', ".kc-chip-name", ".kc-chip-ex", '[role="radiogroup"]');
    expect(r['input[name="category"]'].map((i) => i.attrs.value)).toEqual(["building", "road", "shop", "sign", "landmark", "other"]); expect(r['input[name="category"]'].map((i) => i.attrs.value)).toEqual(CATEGORIES);
    expect(r['input[name="category"]'].filter((i) => "checked" in i.attrs).map((i) => i.attrs.value)).toEqual(["sign"]);
    expect(r[".kc-chip-ex"]).toHaveLength(6); for (const e of r[".kc-chip-ex"]) expect(e.text.trim().length).toBeGreaterThan(3);
    const ex = r[".kc-chip-ex"].map((e) => e.text).join("|");
    for (const want of ["浮いている建物", "看板の位置がちがう", "道がちがう"]) expect(ex).toContain(want);
    expect(r['[role="radiogroup"]']).toHaveLength(1);
  });
  test("photos: a picker (image/*, several) and a camera (capture) that CSS shows on phones; a counter and the limits", async () => {
    const r = await scan(html, "#kc-file", "#kc-cam", "label[data-only-touch]", "#kc-tiles", '[data-f="photos-n"]');
    expect(r["#kc-file"][0].attrs).toMatchObject({ type: "file", accept: "image/*", multiple: "" }); expect(r["#kc-cam"][0].attrs).toMatchObject({ type: "file", accept: "image/*", capture: "environment" });
    expect("multiple" in r["#kc-cam"][0].attrs).toBe(false); expect(r["label[data-only-touch]"]).toHaveLength(1);
    expect(r['[data-f="photos-n"]'][0].text).toBe("0 / 6枚");
    expect(html).toContain("1枚15MBまで");
  });
  test("the note is a labelled textarea with a counter; the nickname and the クルーNo. are text fields with hints (14-digit keypad)", async () => {
    const r = await scan(html, "#kc-note", "#kc-nick", "#kc-crew", "#kc-crew-h", "#kc-note-n");
    expect(r["#kc-note"][0].attrs).toMatchObject({ maxlength: "2000" }); expect(r["#kc-note-n"][0].text).toBe("0 / 2000");
    expect(r["#kc-nick"][0].attrs).toMatchObject({ type: "text", maxlength: "24", autocomplete: "nickname" });
    expect(r["#kc-crew"][0].attrs).toMatchObject({ type: "text", inputmode: "numeric", autocomplete: "off" }); expect(r["#kc-crew-h"][0].text).toContain("クルーカードアプリの乗組員証に表示される番号");
    expect(r["#kc-crew-h"][0].text).toContain("ポイントプレゼント");   // optional, for tracking and future Crew rewards
    expect(html).toContain("（なくてもOK）");
  });
  test("consent: the one-line summary, a native checkbox with the backend's label, the privacy link as a button, an error region; the points copy and the progress bar are in the footer", async () => {
    const r = await scan(html, 'input[name="consent"]', ".kc-ctext", ".kc-privsum", '[data-act="privacy"]', "#kc-e-consent", ".kc-points", "progress", '[data-act="send"]', '[data-act="cancel"]', ".kc-prog");
    expect(r['input[name="consent"]'][0].attrs.type).toBe("checkbox"); expect(r[".kc-ctext"][0].text).toBe("投稿内容と写真の取り扱い(プライバシー)に同意して送信します");
    expect(r[".kc-privsum"][0].text).toBe("写真と撮影場所は公開されません。3Dの街を実際に近づけるためにだけ使います。"); expect(r['[data-act="privacy"]'][0].text).toBe("取り扱いの詳細");
    expect(r[".kc-privsum"][0].attrs.id).toBe("kc-privsum"); expect(r['input[name="consent"]'][0].attrs["aria-describedby"]).toBe("kc-privsum kc-e-consent");   // (a screen reader reads the summary when the checkbox gets the focus)
    expect(r["#kc-e-consent"][0].attrs).toMatchObject({ role: "alert", hidden: "" });
    expect(r[".kc-points"][0].text).toBe("採用されると、問題の報告は約5ポイント、現地の写真で直すと約20ポイント。確認が終わるまでは「確認待ち」です。");
    expect(r.progress[0].attrs).toMatchObject({ max: "100", value: "0", "aria-label": "送信の進み具合" }); expect(r[".kc-prog"][0].attrs).toHaveProperty("hidden");
    expect(r['[data-act="send"]'][0].attrs).toMatchObject({ type: "submit", form: "kc-form" }); expect(r['[data-act="cancel"]'][0].attrs).toHaveProperty("hidden");
  });
  test("the nickname has an error region of its own (a link or an e-mail address is refused where the visitor is typing)", async () => {
    const r = await scan(html, "#kc-nick", "#kc-e-nick");
    expect(r["#kc-e-nick"][0].attrs).toMatchObject({ role: "alert", hidden: "", class: "kc-err" }); expect(r["#kc-nick"][0].attrs["aria-describedby"]).toBe("kc-nick-h kc-e-nick");
  });
  test("the numbers come from the model: the backend's limits and points when it announced them (note maximum, photo size hint and counter, points copy, the thank-you points), else the built-in ones", async () => {
    const lim = { photos: 3, photoBytes: 5 * 1048576, shotBytes: 4 * 1048576, note: 500, nickname: 24, crewDigits: 14, codeLen: 10, drafts: 1 }, pts = { issue: 7, fix: 30 };
    const r = await scan(formHtml(model({ limits: lim, points: pts, note: "abc" }), TJ), "#kc-note", '[data-f="note-max"]', "#kc-note-n", '[data-f="photos-n"]', '[data-f="photos-hint"]', '[data-f="points"]');
    expect(r["#kc-note"][0].attrs.maxlength).toBe("500"); expect(r['[data-f="note-max"]'][0].text).toBe("500"); expect(r["#kc-note-n"][0].text).toBe("3 / 500"); expect(r['[data-f="photos-n"]'][0].text).toBe("0 / 3枚");
    expect(r['[data-f="photos-hint"]'][0].text).toBe("1枚5MBまで。JPEG・PNG・WebP・HEICに対応しています。"); expect(r['[data-f="points"]'][0].text).toContain("約7ポイント、現地の写真で直すと約30ポイント");
    const d = await scan(doneHtml(TJ, { points: pts }), '[data-f="points-done"]'); expect(d['[data-f="points-done"]'][0].text).toBe("採用されると、問題の報告は約7ポイント、現地の写真で直すと約30ポイントです。");
    const def = await scan(formHtml(model(), TJ), "#kc-note", '[data-f="photos-hint"]'); expect(def["#kc-note"][0].attrs.maxlength).toBe("2000"); expect(def['[data-f="photos-hint"]'][0].text).toContain("1枚15MBまで");
    expect(doneHtml(TJ)).toContain("約5ポイント");   // (no model: the built-in points)
  });
  test("English: the same dialog, no Japanese kana, no missing key", async () => {
    const en = shellHtml(model({ lang: "en", meta: [], langBtn: { text: "JA", aria: "Switch language" } }), TE);
    expect(en.replace(/クルーNo\.|気仙沼地域戦略/g, "")).not.toMatch(/[぀-ヿ]/); expect(en).not.toMatch(/contrib\./);   // (the backend's English privacy text names the クルーNo. and 気仙沼地域戦略 in Japanese)
    const r = await scan(en, "h2", ".kc-card b", ".kc-points", '[role="tab"]');
    expect(r.h2[0].text).toBe("Report a correction"); expect(r[".kc-card b"].map((b) => b.text)).toEqual(["Report a problem", "Fix it with photos from the spot"]);
    expect(r['[role="tab"]'].map((t) => t.text)).toEqual(["Report", "My reports", "Leaderboard"]); expect(r[".kc-points"][0].text).toContain("Pending review");
    expect(shellHtml(model(), TJ)).not.toMatch(/contrib\./);
  });
  test("a language button (the other language's name) and a test-server banner only when the model says so", async () => {
    const r = await scan(html, '[data-act="lang"]', ".kc-warn"); expect(r['[data-act="lang"]'][0].text).toBe("EN"); expect(r['[data-act="lang"]'][0].attrs["aria-label"]).toBe("言語を切り替え"); expect(r[".kc-warn"]).toHaveLength(0);
    const w = await scan(shellHtml(model({ testHost: "api.example.com" }), TJ), ".kc-warn"); expect(w[".kc-warn"][0].text).toBe("テスト用の送信先：api.example.com"); expect(w[".kc-warn"][0].attrs.role).toBe("note");
    expect(shellHtml(model({ langBtn: null }), TJ)).not.toContain('data-act="lang"');
  });
  test("what the visitor typed is HTML-escaped everywhere (nickname, note, クルーNo., file names, notes from the team, leaderboard names)", async () => {
    const evil = `"><script>alert(1)</script><img src=x onerror=alert(2)>`;
    const out = [formHtml(model({ nickname: evil, note: `</textarea>${evil}`, crewNo: evil }), TJ), tilesHtml(model({ photos: [{ id: "p1", name: evil, thumb: "" }] }), TJ),
      mineHtml(model({ mine: { state: "ok", me: { points: 5, nickname: evil, crewNo: "", submissions: [{ id: evil, createdAt: "2026-10-05T00:00:00Z", status: "rejected", kind: "issue", category: evil, note: evil, points: 0, usedVersion: evil }] } }, notice: evil, hasAccount: true }), TJ),
      boardHtml(model({ board: { state: "ok", rows: [{ nickname: evil, accepted: 1, points: 5, me: true }] }, nickname: evil, hasAccount: true }), TJ), privacyHtml(TJ, { contact: evil }), xferHtml(model({ claim: { open: true, value: evil, error: evil, busy: false, hint: evil } }), TJ), shotHtml(model({ shot: { state: "ok", thumb: evil } }), TJ)].join("\n");
    expect(out).not.toMatch(/<script/i); expect(out).not.toMatch(/<img src=x/i);
    const parsed = await scan(out, "script", "[onerror]", "img[src='x']"); expect([parsed.script.length, parsed["[onerror]"].length, parsed["img[src='x']"].length]).toEqual([0, 0, 0]);
    expect(esc(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
    expect(formHtml(model({ nickname: evil }), TJ)).toContain('value="&quot;&gt;&lt;script&gt;');
  });
});

describe("the screenshot card and the photo tiles reserve their space (no layout shift when the picture arrives)", () => {
  test("the box has the screen's own shape from the first paint; the picture is a labelled <img> only once it exists", async () => {
    for (const state of ["wait", "ok", "fail"]) {
      const r = await scan(shotHtml(model({ shot: { state, thumb: state === "ok" ? "blob:x" : "", thumbW: 111, thumbH: 240 }, aspect: 390 / 844 }), TJ), ".kc-shot", ".kc-shot-img", "img", '[data-f="shot-t"]', ".kc-meta span");
      expect(r[".kc-shot"][0].attrs["data-state"]).toBe(state);
      expect(r[".kc-shot-img"][0].attrs.style).toMatch(/--kc-h:96px;aspect-ratio:44 \/ 96/);   // 96 px tall, 44 px wide for a 390 x 844 phone
      expect(r.img).toHaveLength(state === "ok" ? 1 : 0); if (state === "ok") expect(r.img[0].attrs).toMatchObject({ width: "111", height: "240", alt: "いま見ている画面のプレビュー" });
      expect(r['[data-f="shot-t"]'][0].text).toBe(state === "wait" ? "画面を取り込み中…" : state === "fail" ? "画面を取り込めませんでした。このまま送ることもできます。" : "自動でそえます。何もしなくて大丈夫です。");
      expect(r[".kc-meta span"].map((s) => s.text)).toEqual(["歩く", "夕方", "秋"]);
    }
    expect(shotHtml(model({ aspect: 1440 / 900 }), TJ)).toContain("aspect-ratio:154 / 96");
  });
  test("each photo is a fixed tile with a 44 px remove button named after the file; a photo that cannot be previewed shows its type", async () => {
    const r = await scan(tilesHtml(model({ photos: [{ id: "p1", name: "IMG_0001.JPG", thumb: "blob:a" }, { id: "p2", name: "IMG_0002.HEIC", thumb: "" }] }), TJ), ".kc-tile", ".kc-thumb img", ".kc-thumb-none small", ".kc-rm", ".kc-tile-name");
    expect(r[".kc-tile"].map((t) => t.attrs["data-id"])).toEqual(["p1", "p2"]); expect(r[".kc-thumb img"]).toHaveLength(1); expect(r[".kc-thumb-none small"][0].text).toBe("HEIC");
    expect(r[".kc-rm"].map((b) => b.attrs["aria-label"])).toEqual(["この写真を外す：IMG_0001.JPG", "この写真を外す：IMG_0002.HEIC"]); expect(r[".kc-rm"][0].attrs).toMatchObject({ type: "button", "data-act": "rm", "data-id": "p1" });
    expect(r[".kc-tile-name"].map((n) => n.text)).toEqual(["IMG_0001.JPG", "IMG_0002.HEIC"]);
    expect(tilesHtml(model(), TJ)).toBe("");
  });
});

describe("after sending, my reports and the leaderboard", () => {
  const sub = (o) => ({ id: "s", createdAt: "2026-10-05T03:00:00Z", status: "new", kind: "issue", category: "sign", note: "", points: 0, usedVersion: "", ...o });
  test("done: thanks, still pending, and four ways on", async () => {
    const r = await scan(doneHtml(TJ), "h3", ".kc-done p", "button");
    expect(r.h3[0].text).toBe("ありがとう！ 送れました"); expect(r.h3[0].attrs.tabindex).toBe("-1"); expect(r[".kc-done p"][0].text).toContain("確認待ち");
    expect(r.button.map((b) => [b.attrs["data-act"], b.attrs["data-tab"]])).toEqual([["goto", "mine"], ["goto", "board"], ["again", undefined], ["close", undefined]]);
  });
  test("a report: pending has no points; accepted shows +5pt; used shows 反映済み（v…）, +20pt and that the fix is live for everyone; rejected shows no note (the team's note is private)", async () => {
    const mine = (subs, points = 25, extra = {}) => mineHtml(model({ mine: { state: "ok", me: { id: "u", nickname: "さくら", crewNo: "12345678901234", points, ...extra, submissions: subs } } }), TJ);
    const subs = [sub({ id: "a", status: "new" }), sub({ id: "b", status: "accepted", points: 5 }), sub({ id: "c", status: "used", kind: "fix", points: 20, usedVersion: "0.2.0" }), sub({ id: "d", status: "rejected", points: 5, reviewerNote: "private note" })];
    const r = await scan(mine(subs, 25, { rank: 2 }), ".kc-item", ".kc-st", ".kc-pt", ".kc-live-note", ".kc-staff", ".kc-total b", ".kc-total small", ".kc-me dd", ".kc-badge");
    expect(r[".kc-item"].map((i) => i.attrs["data-status"])).toEqual(["pending", "accepted", "used", "rejected"]);
    expect(r[".kc-st"].map((s) => s.text)).toEqual(["確認待ち", "採用", "反映済み（v0.2.0）", "見送り"]);
    expect(r[".kc-pt"].map((s) => s.text)).toEqual(["+5pt", "+20pt"]);   // pending and rejected show none
    expect(r[".kc-live-note"]).toHaveLength(1); expect(r[".kc-live-note"][0].text).toBe("この修正は、みんなが見る町に反映されています。");
    expect(r[".kc-staff"]).toHaveLength(0); expect(mine(subs)).not.toContain("private note");
    expect(r[".kc-total b"][0].text).toBe("合計 25 ポイント"); expect(r[".kc-total small"][0].text).toContain("ランキング2位"); expect(r[".kc-me dd"].map((d) => d.text)).toEqual(["さくら", "••••••••••1234"]);
    expect(r[".kc-badge"].map((b) => b.text)).toEqual(["問題", "問題", "現地", "問題"]);
    expect(mine(subs, 25, { rank: null })).not.toContain("ランキング"); expect(mineHtml(model({ lang: "en", mine: { state: "ok", me: { points: 5, rank: 3, nickname: "a", crewNo: "", submissions: [sub({ status: "accepted", points: 5 })] } } }), TE)).toContain("Rank #3");
  });
  test("a shipped fix without a version is just 反映済み; an unknown category prints as it is; a long note is cut", async () => {
    expect(itemHtml(sub({ status: "used", points: 20 }), "ja", TJ)).toContain("反映済み</span>");
    expect(itemHtml(sub({ category: "castle" }), "ja", TJ)).toContain("castle");
    expect(itemHtml(sub({ note: "あ".repeat(120) }), "ja", TJ)).toContain("あ".repeat(80) + "…");
    expect(itemHtml(sub({ status: "used", usedVersion: "v1.2", points: 20 }), "en", TE)).toContain("Live in the app (v1.2)");
  });
  test("states of マイ投稿: loading, error with a retry, no login or no reports yet (with the transfer and forget sections always there)", async () => {
    const loading = await scan(mineHtml(model({ mine: { state: "loading" } }), TJ), ".kc-state", '[data-act="xfer"]', '[data-act="forget"]', "#kc-claim-in");
    expect(loading[".kc-state"][0].text).toBe("読み込み中…"); expect(loading['[data-act="xfer"]'][0].text).toBe("引き継ぎコードを作る"); expect(loading['[data-act="forget"]']).toHaveLength(1); expect(loading["#kc-claim-in"]).toHaveLength(1);
    const bad = await scan(mineHtml(model({ mine: { state: "error", errorKey: "contrib.err.network" } }), TJ), '[data-act="reload-mine"]', ".kc-state"); expect(bad['[data-act="reload-mine"]']).toHaveLength(1); expect(bad[".kc-state"][0].text).toContain("ネットワーク");
    for (const mine of [{ state: "anon" }, { state: "ok", me: { points: 0, nickname: "", crewNo: "", submissions: [] } }]) expect(mineHtml(model({ mine }), TJ)).toContain("まだ投稿がありません。最初の1件を送ってみよう！");
  });
  test("a status line after 「この端末の情報を消す」 or the delete (role=status), nothing when there is none", async () => {
    const r = await scan(mineHtml(model({ mine: { state: "anon" }, notice: "削除しました。この端末の情報も消しました。" }), TJ), ".kc-notice");
    expect(r[".kc-notice"][0].attrs.role).toBe("status"); expect(r[".kc-notice"][0].text).toBe("削除しました。この端末の情報も消しました。"); expect(mineHtml(model({ mine: { state: "anon" } }), TJ)).not.toContain("kc-notice");
  });
  test("「送ったデータをすべて削除」: only for a device that has a login; a question with the safe answer (やめる) beside the danger button; busy and error states", async () => {
    expect(mineHtml(model({ mine: { state: "anon" }, hasAccount: false }), TJ)).not.toContain("kc-erase"); expect(eraseHtml(model({ hasAccount: false }), TJ)).toBe("");
    const idle = await scan(mineHtml(model({ mine: { state: "loading" }, hasAccount: true }), TJ), "#kc-erase-t", ".kc-erase .kc-hint", '[data-act="erase"]', '[data-f="erase-card"]', ".kc-confirm");
    expect(idle["#kc-erase-t"][0].text).toBe("送ったデータをすべて削除"); expect(idle[".kc-erase .kc-hint"][0].text).toContain("サーバーからすべて消します"); expect(idle['[data-act="erase"]'][0].text).toBe("データを削除する"); expect(idle[".kc-confirm"]).toHaveLength(0);
    const ask = await scan(eraseCardHtml({ phase: "confirm" }, TJ), '[role="group"]', "#kc-erase-q", '[data-act="erase-yes"]', '[data-act="erase-no"]');
    expect(ask['[role="group"]'][0].attrs["aria-labelledby"]).toBe("kc-erase-q"); expect(ask["#kc-erase-q"][0].text).toContain("本当に削除しますか？"); expect(ask["#kc-erase-q"][0].text).toContain("取り消せません");
    expect([ask['[data-act="erase-yes"]'][0].text, ask['[data-act="erase-no"]'][0].text]).toEqual(["削除する", "やめる"]); expect(ask['[data-act="erase-yes"]'][0].attrs.class).toContain("danger");
    expect(eraseCardHtml({ phase: "busy" }, TJ)).toContain("削除しています…"); const bad = eraseCardHtml({ phase: "error", errorKey: "contrib.err.network" }, TJ); expect(bad).toContain('role="alert"'); expect(bad).toContain("サーバーにつながりませんでした"); expect(bad).toContain('data-act="erase"');
    expect(eraseCardHtml({ phase: "confirm" }, TE)).toContain("Really delete?");
  });
  test("the transfer sections: 別の端末に引き継ぐ (a code, the countdown, the QR code, copy) and 引き継ぎコードを入力 (a labelled field, its error)", async () => {
    const svg = qrToSvg(qrEncode("https://app.example/?claim=K7M2X9QP4A"), { title: "引き継ぎ用のQRコード" });   // (the code is shown XXXXX-XXXXX, the way the backend writes it)
    const r = await scan(xferHtml(model({ xfer: { phase: "ready", code: "K7M2X9QP4A", left: "14:59", svg }, claim: { open: false, value: "", error: "", busy: false, hint: "" } }), TJ),
      "#kc-xfer-t", '[data-f="code"]', '[data-f="left"]', '[data-f="qr"] svg', '[data-act="copy"]', '[data-act="xfer-hide"]', '[data-act="xfer"]', "#kc-claim-t", 'label[for="kc-claim-in"]', "#kc-claim-in", "#kc-claim-e");
    expect(r["#kc-xfer-t"][0].text).toBe("別の端末に引き継ぐ"); expect(r['[data-f="code"]'][0].text).toBe("K7M2X-9QP4A"); expect(r['[data-f="left"]'][0].text).toBe("あと 14:59"); expect(r['[data-f="left"]'][0].attrs.role).toBe("timer");
    expect(r['[data-f="qr"] svg']).toHaveLength(1); expect(r['[data-f="qr"] svg'][0].attrs["aria-label"]).toBe("引き継ぎ用のQRコード");
    expect(r['[data-act="xfer"]'][0].attrs["aria-expanded"]).toBe("true"); expect(r["#kc-claim-t"][0].text).toBe("引き継ぎコードを入力"); expect(r['label[for="kc-claim-in"]'][0].text).toBe("引き継ぎコード（10文字）");
    expect(r["#kc-claim-in"][0].attrs).toMatchObject({ maxlength: "16", autocapitalize: "characters", autocomplete: "off" }); expect(r["#kc-claim-e"][0].attrs).toMatchObject({ role: "alert", hidden: "" });
    const expired = xferHtml(model({ xfer: { phase: "expired", code: "K7M2X9QP4A", svg: "" } }), TJ); expect(expired).toContain("期限が切れました。もういちど作ってください。"); expect((await scan(expired, '[data-f="qr"] svg'))['[data-f="qr"] svg']).toHaveLength(0);
    const err = await scan(xferHtml(model({ claim: { open: true, value: "ABC", error: "このコードは使えません。", busy: true, hint: "別の端末のコードが入っています。" } }), TJ), "#kc-claim-e", "#kc-claim-in", '[data-act="claim"]', ".kc-claim .kc-hint");
    expect(err["#kc-claim-e"][0].attrs).not.toHaveProperty("hidden"); expect(err["#kc-claim-in"][0].attrs["aria-invalid"]).toBe("true"); expect(err['[data-act="claim"]'][0].attrs).toHaveProperty("disabled"); expect(err[".kc-claim .kc-hint"][0].text).toBe("別の端末のコードが入っています。");
    expect(xferHtml(model({ xfer: { phase: "error", errorKey: "contrib.err.rate" } }), TJ)).toContain("たくさん送ってくれてありがとう");
  });
  test("the leaderboard: ranks, nickname, accepted count and points; my row is the one the server marked (me); empty and error states", async () => {
    const rows = [{ nickname: "さくら", accepted: 3, points: 35, me: false }, { nickname: "ひろ", accepted: 2, points: 40, me: true }, { nickname: "Mika", accepted: 1, points: 5, me: false }];
    const r = await scan(boardHtml(model({ board: { state: "ok", rows }, hasAccount: true }), TJ), "ol.kc-board", ".kc-row", ".kc-rank", ".kc-nick", ".kc-acc", ".kc-pts", "li[data-me]", ".kc-nick em");
    expect(r[".kc-row"].map((x) => x.attrs["data-rank"])).toEqual(["1", "2", "3"]); expect(r[".kc-rank"].map((x) => x.attrs["aria-label"])).toEqual(["1位", "2位", "3位"]);
    expect(r[".kc-acc"].map((x) => x.text)).toEqual(["採用 3件", "採用 2件", "採用 1件"]); expect(r[".kc-pts"].map((x) => x.text)).toEqual(["35pt", "40pt", "5pt"]);
    expect(r["li[data-me]"]).toHaveLength(1); expect(r["li[data-me]"][0].attrs["data-rank"]).toBe("2"); expect(r[".kc-nick em"][0].text).toBe("あなた");
    expect((await scan(boardHtml(model({ board: { state: "ok", rows }, hasAccount: false, nickname: "ひろ" }), TJ), "li[data-me]"))["li[data-me]"]).toHaveLength(0);   // no login: nobody is "you" (a same name is not enough)
    expect((await scan(boardHtml(model({ board: { state: "ok", rows: rows.map((x) => ({ ...x, me: false })) }, hasAccount: true, nickname: "ひろ" }), TJ), "li[data-me]"))["li[data-me]"]).toHaveLength(0);   // not on the board yet
    expect(boardHtml(model({ board: { state: "ok", rows: [] } }), TJ)).toContain("まだランキングはありません。最初の1人になろう！");
    expect(boardHtml(model({ board: { state: "error", errorKey: "contrib.err.server" } }), TJ)).toContain('data-act="reload-board"');
    expect(boardHtml(model({ board: { state: "loading" } }), TJ)).toContain("読み込み中");
    expect(boardHtml(model({ board: { state: "ok", rows }, lang: "en" }), TE)).toContain("#1");
  });
  test("the privacy notice (the backend's text): the title, the intro, nine headed sections, a line about deleting it yourself and a way back; the contact only once the team has one", async () => {
    const r = await scan(privacyHtml(TJ), "h3", "h4", ".kc-privacy p", ".kc-lead", ".kc-contact", '[data-act="privacy-back"]');
    expect(r.h3[0].text).toBe("投稿の取り扱いについて"); expect(r.h4).toHaveLength(9); expect(r.h4.map((h) => h.text).slice(0, 3)).toEqual(["集める情報", "使う目的", "公開しません"]); expect(r.h4.at(-1).text).toBe("お子さま");
    expect(r[".kc-privacy p"]).toHaveLength(9 + 2); expect(r[".kc-lead"][0].text).toContain("気仙沼 Living City"); expect(r[".kc-lead"][1].text).toContain("マイ投稿"); expect(r[".kc-contact"]).toHaveLength(0);
    expect(r['[data-act="privacy-back"]'][0].text).toBe("もどる"); expect(privacyHtml(TJ)).not.toContain("{{"); expect(privacyHtml(TJ)).not.toContain("{contact}");
    const withContact = await scan(privacyHtml(TJ, { contact: "privacy@example.org" }), ".kc-contact"); expect(withContact[".kc-contact"][0].text).toBe("削除のご依頼・お問い合わせ: privacy@example.org");
    expect(privacyHtml(TE).replace(/クルーNo\.|気仙沼地域戦略/g, "")).not.toMatch(/[぀-ヿ]/); expect(privacyHtml(TE, { contact: "x" })).toContain("To ask for deletion or with any question: x");
  });
});

// ------------------------------------------------------------------ the CSS
describe("the CSS: three layouts, safe areas, 44 px targets, nothing that moves the layout", () => {
  const css = CONTRIB_CSS;
  const block = (re) => { const m = css.match(re); expect(m).not.toBeNull(); return m[0]; };
  test("a panel docked right on a desktop, a rounded card at the bottom on a narrow window / a phone upright, a wide card on a phone on its side", () => {
    expect(block(/@media \(min-width: 721px\) and \(min-height: 521px\) \{[\s\S]*?\n\}/)).toMatch(/right: calc\(18px \+ env\(safe-area-inset-right/);
    const phone = block(/@media \(max-width: 720px\) \{[\s\S]*?\n\}/); expect(phone).toMatch(/bottom: calc\(10px \+ env\(safe-area-inset-bottom/); expect(phone).toMatch(/left: max\(10px, env\(safe-area-inset-left/); expect(phone).toMatch(/100dvh/);
    const land = block(/@media \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*?\n\}/);
    for (const side of ["top", "bottom", "left", "right"]) expect(land).toContain(`env(safe-area-inset-${side}`);
    expect(css.indexOf("(max-width: 720px)")).toBeLessThan(css.indexOf("(orientation: landscape) and (max-height: 520px)"));   // (the landscape rules win on a short, narrow screen)
  });
  test("a phone on its side gets a compact header (one row), a two-column form and a send-only footer, declared AFTER the base rules (same specificity: the later rule wins)", () => {
    const compact = css.lastIndexOf("@media (orientation: landscape) and (max-height: 520px) {");
    expect(compact).toBeGreaterThan(css.indexOf("#klc-contrib .kc-head {")); expect(compact).toBeGreaterThan(css.indexOf("#klc-contrib .kc-form {")); expect(compact).toBeGreaterThan(css.indexOf("#klc-contrib .kc-foot {"));
    expect(compact).toBeGreaterThan(css.indexOf("#klc-contrib .kc-body {")); expect(compact).toBeGreaterThan(css.indexOf("#klc-contrib .kc-tabs {")); expect(compact).toBeGreaterThan(css.indexOf("#klc-contrib .kc-x, #klc-contrib .kc-lang {"));
    const tail = css.slice(compact);
    for (const rule of ["grid-template-columns: auto minmax(0, 1fr) auto auto", "#klc-contrib .kc-title { display: contents; }", "column-count: 2", "#klc-contrib .kc-foot { padding: 6px 16px 8px; }"]) expect([rule, tail.includes(rule)]).toEqual([rule, true]);
  });
  test("the keyboard inset (--kc-kb) lifts the card; the layout does not depend on the touch pad being on", () => {
    expect(css).toMatch(/bottom: calc\(10px \+ env\(safe-area-inset-bottom, 0px\) \+ var\(--kc-kb, 0px\)\)/);
    const rules = css.split("\n").filter((l) => /^#klc-contrib \.kc-sheet/.test(l)); expect(rules.length).toBeGreaterThan(0);
  });
  test("tap targets: 44 px (a phone, a touch screen, the pad on) and 40 px with a mouse; every control uses the size", () => {
    expect(css).toMatch(/--kc-tap: 40px;/); expect(css).toMatch(/@media \(max-width: 720px\) \{\s*#klc-contrib \{ --kc-tap: 44px; \}/); expect(css).toMatch(/@media \(pointer: coarse\) \{ #klc-contrib \{ --kc-tap: 44px; \} \}/);
    expect(css).toMatch(/body\.klc-pad #klc-contrib \{ --kc-tap: 44px; \}/); expect(css).toMatch(/@media \(orientation: landscape\) and \(max-height: 520px\) \{\s*#klc-contrib \{ --kc-tap: 44px; \}/);
    for (const sel of [".kc-btn", ".kc-tab", ".kc-link", ".kc-x", ".kc-check"]) expect([sel, new RegExp(`#klc-contrib \\${sel}[^{]*\\{[^}]*(min-height|height): [^;]*var\\(--kc-tap\\)`).test(css)]).toEqual([sel, true]);
    expect(css).toMatch(/input\[type="text"\], #klc-contrib textarea \{[^}]*min-height: var\(--kc-tap\)/);
    expect(css).toMatch(/\.kc-rm \{[^}]*width: 44px; height: 44px/);   // the remove button of a photo
    expect(css).toMatch(/\.kc-send \{[^}]*min-height: 48px/);
  });
  test("text fields are 16 px (iOS does not zoom the page when one is focused)", () => {
    expect(css).toMatch(/input\[type="text"\], #klc-contrib textarea \{[^}]*font: 500 16px/);
  });
  test("it sits above everything the app draws (the voyage UI is 40, the story card 38, the touch pad 6)", () => {
    const z = Number(css.match(/#klc-contrib \{[^}]*z-index: (\d+)/)[1]); expect(z).toBeGreaterThan(40);
  });
  test("[hidden] always wins (a .kc-btn with display: inline-flex used to stay visible)", () => {
    expect(css).toContain("#klc-contrib [hidden] { display: none !important; }");
  });
  test("only opacity and transform move the sheet; no transition animates a size or a position", () => {
    const trans = [...css.matchAll(/transition: ([^;}]+)/g)].map((m) => m[1]);
    for (const t of trans) { if (t === "width .2s linear") continue; /* the fill inside the fixed-size progress bar */ expect([t, /\b(width|height|top|left|right|bottom|margin|padding|inset|max-height)\b/.test(t.replace(/visibility 0s/g, ""))]).toEqual([t, false]); }
    expect(css).toMatch(/\.kc-sheet \{[^}]*transition: opacity \.28s var\(--ease\), transform \.36s var\(--ease\)/);
  });
  test("reduced motion switches the transitions and animations off; the screenshot box has an aspect ratio and a pulse only while it waits", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ #klc-contrib \*, #klc-contrib \{ transition-duration: 0s !important; animation: none !important; \} \}/);
    expect(css).toMatch(/\.kc-shot\[data-state="wait"\] \.kc-shot-img \{ animation:/);
  });
  test("the kind switch is pure CSS from data-kind (nothing re-renders while the visitor types): both hints exist, one shows", () => {
    expect(css).toMatch(/#klc-contrib\[data-kind="issue"\] \.kc-descs > p\[data-only="issue"\], #klc-contrib\[data-kind="fix"\] \.kc-descs > p\[data-only="fix"\] \{ visibility: visible; \}/);
    expect(css).toMatch(/#klc-contrib \[data-only\] \{ display: none; \}/);
    expect(css).toMatch(/\.kc-descs > p \{ grid-area: 1 \/ 1;/);   // (one grid cell: the taller text sets the height, so a switch never moves what is below)
    expect(css).toMatch(/p\[data-f="shot-t"\] \{ min-height: 4\.5em; \}/);
  });
  test("the camera button is for phones (and ?touch=1): hidden for a mouse unless the pad is on", () => {
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{ body:not\(\.klc-pad\) #klc-contrib \[data-only-touch\] \{ display: none; \} \}/);
  });
  test("a bottom row of the footer never hides behind the home indicator: the card itself is inset by the safe area", () => {
    expect(css).toMatch(/\.kc-foot \{[^}]*padding: 10px 18px 12px/);
  });
  test("the 「あなた」 pill on my leaderboard row is not clipped by the ellipsis box around the nickname (it is an inline-block inside padding)", () => {
    expect(css).toMatch(/\.kc-nick \{[^}]*overflow: hidden;[^}]*padding: 5px 0; margin: -5px 0;/); expect(css).toMatch(/\.kc-nick em \{ display: inline-block;/);
  });
  test("the delete question and the status line have their looks (a red danger button, a calm ghost one, a green notice, the privacy summary); no leftover staff-note rule", () => {
    for (const sel of [".kc-btn.danger {", ".kc-btn.danger-ghost {", ".kc-confirm {", ".kc-notice {", ".kc-privsum {", ".kc-erase-card {"]) expect([sel, css.includes("#klc-contrib " + sel)]).toEqual([sel, true]);
    expect(css).not.toContain(".kc-staff");
  });
  test("the app's sheet palette: paper glass, navy ink, coral accent, Zen Maru Gothic", () => {
    for (const c of ["rgba(250, 247, 241", "#1f3a68", "#e0703f", "Zen Maru Gothic", "backdrop-filter: blur(14px)"]) expect(css).toContain(c);
  });
});

describe("the HUD: the button is added without moving anything that was there", () => {
  const hud = read("src/anime/ui/hud.js");
  test("it is the LAST item of the toolbar (the ☰ menu keeps every item where it was; the wide toolbar is right-anchored, so an in-flow item at the end would push the others: it is absolute there)", () => {
    const tools = hud.slice(hud.indexOf('<div class="tools" id="klc-menu">'), hud.indexOf("</div>", hud.indexOf('data-act="hide"')) + 6);
    const acts = [...tools.matchAll(/data-act="(\w+)"/g)].map((m) => m[1]); expect(acts).toEqual(["jpyc", "lang", "season", "sound", "planet", "credits", "labels", "hide", "multi", "report"]);   // [integration] みんなであそぶ joined before 修正を報告 so the phone ☰ keeps every item where it was (ship-pad.e2e taps by position)   // ([play] みんなであそぶ then [jpyc] sit on the left of the right-anchored toolbar, so the older items stay; labels is a .cbtn ☰-menu item like credits)
    expect(tools).toContain('aria-haspopup="dialog"'); expect(tools).toContain('class="round glass rep"');
    expect(CSS).toMatch(/#klc-ui \.tools \.rep \{ position: absolute; top: 0; right: calc\(100% \+ 8px\);/);
    expect(CSS).toMatch(/@media \(max-width: 720px\) \{ #klc-ui \.tools \.rep \{ position: static; width: 44px; height: 44px; \} \}/);
  });
  test("721-839 px: the toolbar fills the width up to the wordmark, so the button drops under the search row (still out of the toolbar's flow); the pad's 44 px variant keeps its offset", () => {
    expect(CSS).toMatch(/@media \(min-width: 721px\) and \(max-width: 839px\) \{ #klc-ui \.tools \.rep \{ top: 94px; right: 0; \} body\.klc-pad #klc-ui \.tools \.rep \{ top: 92px; \} \}/);
    expect(CSS.indexOf("(max-width: 839px)")).toBeGreaterThan(CSS.indexOf("body.klc-pad #klc-ui .tools .rep { top: -3px"));   // (declared after the rules it overrides)
  });
  test("the rules the HUD already had are untouched (the phone-hud tests pin them) and the pad's CSS has no knowledge of the sheet", () => {
    expect(CSS).toMatch(/#klc-ui \.mbtn, #klc-ui \.pbar, #klc-ui \.mhead, #klc-ui \.tools \.lbl \{ display: none; \}/);
    expect(PAD_CSS).not.toMatch(/klc-contrib|\.rep\b|kc-/);
    expect(CSS).toMatch(/@media \(min-width: 721px\) \{ body\.klc-pad #klc-ui \.tools \.rep/);   // (the 44 px override is not in the portrait menu, where the pad's own item rules apply)
  });
  test("a click closes the ☰ menu and opens the sheet with its opener; B opens it from the keyboard; the HUD's own keys stand down while it is open", () => {
    expect(hud).toContain("else if (act === 'report') { ui.menu = false; syncSheets(); contrib?.open({ opener: b }); }");
    expect(hud).toMatch(/e\.code === 'KeyB' && !e\.repeat && !e\.metaKey && !e\.ctrlKey && !e\.altKey\) contrib\?\.open\(/);
    expect(hud).toContain("if (document.body.classList.contains('klc-contrib-open')) return;");
    expect(hud.indexOf("const contrib = mountContrib(")).toBeLessThan(hud.indexOf("addEventListener('keydown'"));   // its capture listener is registered first
    expect(hud).toMatch(/return \{ el, i18n: I, photo, render, contrib, jpyc, get view\(\) \{ return ui\.view; \}/);   // ([jpyc] the shop sheet is published beside it)
  });
  test("the strings of the sheet live in their own file (data/i18n.json and the pad's file are not touched)", () => {
    expect(Object.keys(JSON.parse(read("data/i18n.json")).ja).some((k) => k.startsWith("contrib."))).toBe(false);
    expect(Object.keys(JSON.parse(read("data/ui-touch-i18n.json")).ja).some((k) => k.startsWith("contrib."))).toBe(false);
    expect(read("src/anime/ui/contrib-lib.js")).toContain("ui-contrib-i18n.json");
  });
  test("the sheet asks for every contrib.* key it needs (a static scan of the view and the controller) and they all exist", () => {
    const need = new Set();
    for (const f of ["contrib.js", "contrib-view.js", "contrib-lib.js", "contrib-api.js", "contrib-shot.js"]) for (const m of read("src/anime/ui/" + f).matchAll(/['"`](contrib\.[\w.]+)['"`]/g)) need.add(m[1]);
    expect(need.size).toBeGreaterThan(40);
    expect([...need].filter((k) => !(k in STRINGS.ja) && !k.endsWith("."))).toEqual([]);
  });
});

describe("focus helpers", () => {
  const el = (n, o = {}) => ({ n, disabled: false, tabIndex: 0, closest: () => null, getClientRects: () => [{}], ...o });
  test("nextFocus wraps at the ends and leaves the middle to the browser", () => {
    const a = el("a"), b = el("b"), c = el("c"), list = [a, b, c];
    expect(nextFocus(list, c, false)).toBe(a); expect(nextFocus(list, a, true)).toBe(c);
    expect(nextFocus(list, a, false)).toBeNull(); expect(nextFocus(list, b, false)).toBeNull(); expect(nextFocus(list, b, true)).toBeNull(); expect(nextFocus(list, c, true)).toBeNull();
    expect(nextFocus(list, null, false)).toBe(a); expect(nextFocus(list, null, true)).toBe(c); expect(nextFocus(list, el("outside"), false)).toBe(a);
    expect(nextFocus([], a, false)).toBeNull(); expect(nextFocus([a], a, false)).toBe(a); expect(nextFocus([a], a, true)).toBe(a);
  });
  test("focusables keeps what a keyboard can reach: not disabled, tabIndex >= 0, not inside [hidden], displayed", () => {
    const keep = el("keep"), dis = el("dis", { disabled: true }), neg = el("neg", { tabIndex: -1 }), hid = el("hid", { closest: (s) => (s === "[hidden]" ? {} : null) }), none = el("none", { getClientRects: () => [] });
    const root = { querySelectorAll: (s) => (s === FOCUSABLE ? [keep, dis, neg, hid, none] : []) };
    expect(focusables(root)).toEqual([keep]);
    expect(FOCUSABLE).toContain("button"); expect(FOCUSABLE).toContain("textarea"); expect(BACKGROUND).toContain("#klc-ui"); expect(BACKGROUND).toContain("#klc-pad"); expect(BACKGROUND).toContain("#scene");
  });
});

// ------------------------------------------------------------------ the controller, with a fake DOM
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const classList = () => { const s = new Set(); return { _s: s, add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c), toggle: (c, on) => { const v = on ?? !s.has(c); if (v) s.add(c); else s.delete(c); return v; } }; };

/** A stand-in backend. Production's CONTRIB_API is empty; these tests opt in with ?contribApi= unless `api` is ''. */
const TEST_API = "http://127.0.0.1:8988";
/** A page that has just what the sheet touches: elements are found by exact selector (the test registers them), innerHTML is just stored. */
async function world({ search = "", api = TEST_API, playing = true, force = false, fetch: fetchImpl, lang = "ja", planet = false, locked = false, config = false } = {}) {   // (config: the sheet asks GET /health for the limits; off by default so the other tests count only their own requests)
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (api && !params.has("contribApi")) params.set("contribApi", api);
  const qs = params.toString();
  search = qs ? "?" + qs : "";
  const registry = new Map(), log = [], canvases = [], urls = new Set();
  const jpeg = new Uint8Array(await sharp({ create: { width: 64, height: 36, channels: 3, background: "#6fa8dc" } }).jpeg().toBuffer());
  let doc, win;
  const el = (tag = "div", props = {}) => {
    const attrs = new Map(), listeners = {};
    const e = {
      tagName: tag.toUpperCase(), id: "", dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } }, classList: classList(), hidden: false, disabled: false, tabIndex: 0, value: "", checked: false,
      textContent: "", innerHTML: "", outerHTML: "", isConnected: true, children: [], files: [], scrollTop: 0, listeners,
      setAttribute(k, v) { attrs.set(k, String(v)); }, getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; }, hasAttribute(k) { return attrs.has(k); }, removeAttribute(k) { attrs.delete(k); },
      addEventListener(t, f) { (listeners[t] ||= []).push(f); }, removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
      appendChild(c) { e.children.push(c); return c; }, insertBefore(c) { e.children.push(c); return c; }, remove() { e.isConnected = false; }, contains(o) { return o === e || e.children.includes(o); },
      closest: () => null, matches: () => false, querySelector: (s) => registry.get(s)?.[0] ?? null, querySelectorAll: (s) => registry.get(s) ?? [], getClientRects: () => [{ width: 1 }], scrollIntoView() {},
      focus() { doc.activeElement = e; log.push("focus:" + (e.id || e.tagName)); }, blur() {}, ...props,
    };
    if (tag === "canvas") {
      e.width = 0; e.height = 0; canvases.push(e);
      e.getContext = () => ({ drawImage() {}, imageSmoothingEnabled: true, imageSmoothingQuality: "low" });
      e.toBlob = (cb, type) => queueMicrotask(() => cb(new Blob([jpeg], { type })));
    }
    return e;
  };
  const reg = (sel, ...els) => { registry.set(sel, els); return els[0]; };
  const opener = el("button", { id: "opener" });
  const body = el("body"); body.classList.add(...(playing ? ["playing"] : []));
  doc = { body, head: el("head"), activeElement: opener, pointerLockElement: locked ? {} : null, createElement: (t) => el(t), getElementById: () => null, querySelectorAll: (s) => registry.get(s) ?? [], querySelector: (s) => registry.get(s)?.[0] ?? null,
    exitPointerLock() { log.push("exitPointerLock"); }, createRange: () => ({ selectNodeContents() {} }), execCommand: () => true };
  const vv = { height: 844, offsetTop: 0, listeners: {}, addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); } };
  win = { location: { search, href: "https://app.example/index.html" + search }, history: { replaceState: (...a) => log.push(["replaceState", ...a]) }, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2, listeners: {}, visualViewport: vv,
    addEventListener(t, f, c) { (this.listeners[t] ||= []).push({ f, c }); }, removeEventListener(t, f, c) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x.f !== f || x.c !== c); },
    requestAnimationFrame: (f) => { f(); return 1; }, navigator: { clipboard: { writeText: async (s) => { win.copied = s; } } }, getSelection: () => ({ removeAllRanges() {}, addRange() {} }) };
  const realCreate = URL.createObjectURL, realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (b) => { const u = realCreate.call(URL, b); urls.add(u); return u; }; URL.revokeObjectURL = (u) => { urls.delete(u); return realRevoke.call(URL, u); };
  const pad = { suppress: (r, on) => log.push(["suppress", r, on]) };
  const ctx = {
    renderer: { domElement: { width: 1440, height: 900, clientWidth: 1440, clientHeight: 900 } }, pipeline: { render: () => log.push("render") }, camera: { position: { x: 120.5, y: 30.25, z: -60.126 }, quaternion: quaternionFromYawPitch(33, -12), fov: 55 }, scene: {}, sunDir: {}, time: 0,
    playerObj: { fly: false }, pad, planet: { active: planet }, services: { time: { preset: "yugata", clock: () => "16:30" }, season: { id: "autumn" }, life: { hud: { view: "drone" }, tour: {} } },
  };
  const I = { lang, set(l) { this.lang = l; }, t: (k) => ({ "v3.time.yugata": lang === "en" ? "Afternoon" : "夕方", "v3.season.autumn": lang === "en" ? "Autumn" : "秋", "v3.lang": lang === "en" ? "JA" : "EN", "lang.toggle": "言語を切り替え" }[k] ?? k) };
  const ls = mem(), notes = [], calls = [];
  const fetch = fetchImpl || (async (url, init) => { calls.push({ url, ...init }); return json({}, 404); });
  const wrapped = async (url, init) => { calls.push({ url, ...init }); return fetchImpl ? fetchImpl(url, init, calls.length - 1) : json({ error: "no route" }, 404); };
  void fetch;
  const sheet = reg("#kc-sheet", el("section", { id: "kc-sheet" }));
  const c = mountContrib(ctx, { hud: { render() { log.push("hud.render"); } } }, { doc, win, i18n: I, store: safeStorage({ localStorage: ls }), fetch: wrapped, note: (m) => notes.push(m), force, loadConfig: config });
  const key = (k, o = {}) => { const ev = { key: k, shiftKey: false, isComposing: false, target: doc.activeElement, calls: [], preventDefault() { this.calls.push("preventDefault"); }, stopImmediatePropagation() { this.calls.push("stop"); }, ...o }; for (const l of win.listeners.keydown || []) l.f(ev); return ev; };
  const root = () => c.root();
  const submit = (id = "kc-form") => { const ev = { preventDefault() {}, target: { id } }; root().listeners.submit[0](ev); };
  const click = (act, data = {}, detail = 1) => { const b = el("button", { dataset: { act, ...data } }); root().children.push(b); const ev = { target: { closest: () => b }, detail }; root().listeners.click[0](ev); return b; };
  const change = (target) => root().listeners.change[0]({ target });
  const input = (target) => root().listeners.input[0]({ target });
  const done = async () => { for (let i = 0; i < 40 && c.state.sending; i++) await Bun.sleep(5); await Bun.sleep(5); };
  const cleanup = () => { URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke; c.destroy(); };
  return { c, ctx, doc, win, log, canvases, urls, el, reg, opener, sheet, notes, calls, ls, key, submit, click, change, input, done, root, vv, I, jpeg, cleanup, store: safeStorage({ localStorage: ls }) };
}
/** Register the form controls the controller reads, with the values a visitor would have given. */
function form(w, o = {}) {
  const v = { note: "看板が1メートルほど右にずれています。", nickname: "さくら", crewNo: "", consent: true, kind: "issue", category: "sign", ...o };
  const r = {
    note: w.reg("#kc-note", w.el("textarea", { value: v.note })), nick: w.reg("#kc-nick", w.el("input", { value: v.nickname })), crew: w.reg("#kc-crew", w.el("input", { value: v.crewNo })),
    consent: w.reg('input[name="consent"]', w.el("input", { checked: v.consent })), kind: w.reg('input[name="kind"]:checked', w.el("input", { value: v.kind })), cat: w.reg('input[name="category"]:checked', v.category ? w.el("input", { value: v.category }) : undefined),
    alert: w.reg("#kc-alert", w.el("div", { hidden: true })), send: w.reg('[data-act="send"]', w.el("button")), sendT: w.reg('[data-f="send-t"]', w.el("span", { textContent: "送る" })), cancel: w.reg('[data-act="cancel"]', w.el("button", { hidden: true })),
    form: w.reg("#kc-form", w.el("form")), prog: w.reg(".kc-prog", w.el("div", { hidden: true })), tiles: w.reg("#kc-tiles", w.el("ul")), live: w.reg(".kc-live", w.el("div")), photosN: w.reg('[data-f="photos-n"]', w.el("p")),
  };
  if (!v.category) w.reg('input[name="category"]:checked');
  r.prog.querySelector = (s) => (s === "progress" ? (r.bar ||= w.el("progress")) : s === '[data-f="prog-t"]' ? (r.progT ||= w.el("span")) : null);
  for (const f of ["category", "note", "photos", "crew", "nick", "consent"]) r["e_" + f] = w.reg(`#kc-e-${f}`, w.el("p", { hidden: true }));
  r.form.querySelectorAll = () => [r.note, r.nick, r.send];
  return r;
}
const photo = (name = "IMG_0001.JPG", type = "image/jpeg", size = 4) => new File([new Uint8Array(size).fill(7)], name, { type });

describe("the controller: opening", () => {
  test("not in the town yet: nothing opens; in the tiny planet: a friendly note; otherwise it opens", async () => {
    const a = await world({ playing: false }); expect(a.c.open()).toBe(false); expect(a.c.isOpen).toBe(false); a.cleanup();
    const b = await world({ planet: true }); expect(b.c.open()).toBe(false); expect(b.notes).toEqual(["小さな惑星をとじてから、町のなかで報告してね"]); b.cleanup();
    const c = await world(); expect(c.c.open({ opener: c.opener })).toBe(true); expect(c.c.isOpen).toBe(true); c.cleanup();
  });
  test("it is modal: the town's pad steps aside, the page behind is inert, pointer lock is released, the body says so, focus goes to the dialog", async () => {
    const w = await world({ locked: true }), ui = w.reg("#klc-ui", w.el("div")), pad = w.reg("#klc-pad", w.el("div")), canvas = w.reg("#scene", w.el("canvas"));
    w.c.open({ opener: w.opener });
    expect(w.log).toContainEqual(["suppress", "contrib", true]); expect(w.log).toContain("exitPointerLock");
    for (const e of [ui, pad, canvas]) expect(e.hasAttribute("inert")).toBe(true);
    expect(w.doc.body.classList.contains("klc-contrib-open")).toBe(true); expect(w.root().dataset.open).toBe("1"); expect(w.doc.activeElement).toBe(w.sheet);
    expect(w.root().innerHTML).toContain('role="dialog"'); expect(w.root().getAttribute("lang")).toBe("ja");
    w.c.close();
    for (const e of [ui, pad, canvas]) expect(e.hasAttribute("inert")).toBe(false);
    expect(w.log).toContainEqual(["suppress", "contrib", false]); expect(w.doc.body.classList.contains("klc-contrib-open")).toBe(false); expect(w.root().dataset.open).toBe("0");
    w.cleanup();
  });
  test("the sheet is made visible BEFORE it takes the focus (focus() does nothing on something under visibility: hidden), and the closed look is flushed first so the slide-in still animates", async () => {
    const w = await world(); const seen = []; w.sheet.focus = function () { seen.push(w.root().dataset.open); w.doc.activeElement = w.sheet; };
    w.c.open({ opener: w.opener }); expect(seen).toEqual(["1"]); expect(w.doc.activeElement).toBe(w.sheet);
    const src = read("src/anime/ui/contrib.js"); expect(src).not.toMatch(/raf\(\(\) => \{ if \(S\.open\) root\.dataset\.open = '1'; \}\)/);
    expect(src.indexOf("void root.offsetWidth;")).toBeLessThan(src.indexOf("root.dataset.open = '1';")); expect(src.indexOf("root.dataset.open = '1';")).toBeLessThan(src.indexOf("focusEl(sheet);   // (it is visible now"));
    w.cleanup();
  });
  test("something that was already inert stays inert when the sheet closes", async () => {
    const w = await world(), ui = w.reg("#klc-ui", w.el("div")); ui.setAttribute("inert", "");
    w.c.open(); w.c.close(); expect(ui.hasAttribute("inert")).toBe(true); w.cleanup();
  });
  test("the view is captured first: one more frame is drawn before the sheet's DOM exists, and the pose has the camera, the mode, the time and the season", async () => {
    const w = await world();
    w.c.open({ opener: w.opener });
    expect(w.log[0]).toBe("render");
    const p = w.c.state.pose;
    expect(p.enu).toEqual([120.5, 30.25, -60.13]); expect(p.heading).toBe(327); expect(p.pitch).toBe(-12); expect(p.fov).toBe(55); expect(p.mode).toBe("walk"); expect(p.timePreset).toBe("yugata"); expect(p.season).toBe("autumn"); expect(p.viewport).toEqual({ w: 1440, h: 900, dpr: 2 });
    expect(w.c.state.meta).toEqual(["歩く", "夕方", "秋"]);
    w.cleanup();
  });
  test("the screenshot arrives as a JPEG blob at most 1600 wide; every canvas that made it is shrunk to 0 x 0; closing frees the blob and revokes the preview", async () => {
    const w = await world(); const shotEl = w.reg("#kc-shot", w.el("section"));
    w.c.open({ opener: w.opener }); await Bun.sleep(30);
    const s = w.c.state; expect(s.shotState).toBe("ok"); expect(s.shot.w).toBe(1600); expect(s.shot.h).toBe(1000); expect(s.shot.blob.type).toBe("image/jpeg"); expect(s.shot.bytes).toBe(w.jpeg.length);
    expect(w.canvases.length).toBe(2); for (const c of w.canvases) expect([c.width, c.height]).toEqual([0, 0]);
    expect(w.urls.size).toBe(1); expect(shotEl.outerHTML).toContain('data-state="ok"'); expect(shotEl.outerHTML).toContain("<img");
    w.c.close(); expect(w.c.state.shot).toBeNull(); expect(w.urls.size).toBe(0); w.cleanup();
  });
  test("a screenshot that finishes after the sheet was closed is released at once (no leaked blob or URL)", async () => {
    const w = await world(); w.c.open(); w.c.close(); await Bun.sleep(30);
    expect(w.c.state.shot).toBeNull(); expect(w.urls.size).toBe(0); for (const c of w.canvases) expect(c.width).toBe(0); w.cleanup();
  });
  test("a view that cannot be captured still opens the sheet (the report can go without a screenshot)", async () => {
    const w = await world(); w.ctx.pipeline.render = () => { throw new Error("context lost"); };
    w.c.open(); await Bun.sleep(20); expect(w.c.isOpen).toBe(true); expect(w.c.state.shotState).toBe("fail"); expect(w.c.state.shot).toBeNull(); w.cleanup();
  });
  test("a second open while it is open just goes to the tab asked for", async () => {
    const w = await world(); w.c.open(); const n = w.log.filter((x) => x === "render").length; w.c.open(); expect(w.log.filter((x) => x === "render").length).toBe(n); w.cleanup();
  });
  test("the on-screen keyboard: the card is lifted by what the keyboard covers, and put back", async () => {
    const w = await world(); w.c.open();
    expect(w.vv.listeners.resize).toHaveLength(1); w.vv.height = 520; w.vv.listeners.resize[0](); expect(w.root().style.props["--kc-kb"]).toBe("380px");
    w.c.close(); expect(w.vv.listeners.resize).toHaveLength(0); expect(w.root().style.props["--kc-kb"]).toBeUndefined(); w.cleanup();
  });
  test("the test-server banner shows for a remote ?contribApi= only; the token store is per backend", async () => {
    const remote = await world({ search: "?contribApi=https://api.example.com" }); remote.c.open(); expect(remote.root().innerHTML).toContain("テスト用の送信先：api.example.com"); remote.cleanup();
    const local = await world({ search: "?contribApi=http://127.0.0.1:8988" }); local.c.open(); expect(local.root().innerHTML).not.toContain("kc-warn"); expect(local.c.target.base).toBe("http://127.0.0.1:8988"); local.cleanup();
    const none = await world({ api: "" }); expect(none.c.target).toMatchObject({ base: "", custom: false }); none.cleanup();
  });
});

describe("the controller: keys", () => {
  test("Esc closes (and the key goes no further); focus returns to the opener", async () => {
    const w = await world(); w.c.open({ opener: w.opener });
    const ev = w.key("Escape"); expect(w.c.isOpen).toBe(false); expect(ev.calls).toEqual(["preventDefault", "stop"]); expect(w.doc.activeElement).toBe(w.opener); w.cleanup();
  });
  test("Esc steps back first: the privacy notice to the form, a transfer code to the list", async () => {
    const w = await world(); w.reg('[data-act="privacy"]', w.el("button", { id: "privacy-link" })); w.c.open(); w.click("privacy"); expect(w.c.state.sub).toBe("privacy");
    w.key("Escape"); expect(w.c.isOpen).toBe(true); expect(w.c.state.sub).toBe("form"); expect(w.doc.activeElement.id).toBe("privacy-link"); w.key("Escape"); expect(w.c.isOpen).toBe(false);
    expect(read("src/anime/ui/contrib.js")).toContain("setSub('form', { focus: false }); focusEl($('[data-act=\"privacy\"]'))");   // (setSub's own focus runs in the next frame and would take the focus off the link)
    w.cleanup();
  });
  test("every other key is the sheet's: the town's shortcuts (WASD, F, H, M, 1-9) are stopped before they run, typing itself is not prevented", async () => {
    const w = await world(); w.c.open();
    for (const k of ["w", "a", "f", "h", "m", "1", "b", "Enter", " "]) { const ev = w.key(k); expect([k, ev.calls]).toEqual([k, ["stop"]]); }
    w.c.close(); const after = w.key("w"); expect(after.calls).toEqual([]); w.cleanup();
  });
  test("Tab is trapped: at the last control it goes to the first, Shift+Tab at the first goes to the last, focus outside comes in", async () => {
    const w = await world(); const a = w.el("button", { id: "a" }), b = w.el("input", { id: "b" }), c2 = w.el("button", { id: "c" });
    w.sheet.contains = (e) => [a, b, c2, w.sheet].includes(e); w.reg(FOCUSABLE, a, b, c2); w.c.open();
    w.doc.activeElement = c2; let ev = w.key("Tab", { target: c2 }); expect(w.doc.activeElement).toBe(a); expect(ev.calls).toEqual(["preventDefault", "stop"]);
    w.doc.activeElement = a; ev = w.key("Tab", { shiftKey: true, target: a }); expect(w.doc.activeElement).toBe(c2);
    w.doc.activeElement = b; ev = w.key("Tab", { target: b }); expect(ev.calls).toEqual(["stop"]);   // in the middle: the browser's own order
    w.doc.activeElement = w.opener; ev = w.key("Tab", { target: w.opener }); expect(w.doc.activeElement).toBe(a);   // focus got out: back in at the first control
    w.cleanup();
  });
  test("composing text (an IME) is left alone; arrow keys on a tab move between tabs", async () => {
    const w = await world(); w.c.open(); expect(w.key("Escape", { isComposing: true }).calls).toEqual([]); expect(w.c.isOpen).toBe(true); w.cleanup();
  });
  test("while a report is being sent Esc does not close it (it points at the cancel button)", async () => {
    const w = await world(); w.c.open(); const cancel = w.reg('[data-act="cancel"]', w.el("button", { id: "cancel" })); w.c.state.sending = true;
    w.key("Escape"); expect(w.c.isOpen).toBe(true); expect(w.doc.activeElement).toBe(cancel); w.c.state.sending = false; w.cleanup();
  });
  test("destroy takes the key handler off the window", async () => {
    const w = await world(); expect(w.win.listeners.keydown).toHaveLength(1); const c = w.c; c.destroy(); expect(w.win.listeners.keydown).toHaveLength(0);
    URL.createObjectURL = URL.createObjectURL; w.cleanup();
  });
});

describe("the controller: checking the form before anything is sent", () => {
  test("no category, no consent: the messages are under the fields, one alert sums it up, focus goes to the first problem, nothing is sent", async () => {
    const w = await world(); const f = form(w, { category: "", consent: false }); const firstCat = w.reg('input[name="category"]', w.el("input", { id: "cat1" })); w.c.open(); w.submit();
    expect(f.e_category.hidden).toBe(false); expect(f.e_category.textContent).toBe("どんなことか、ひとつえらんでください"); expect(f.e_consent.hidden).toBe(false); expect(f.e_consent.textContent).toBe("送るには、同意にチェックしてください");
    expect(f.alert.hidden).toBe(false); expect(f.alert.textContent).toBe("入力をたしかめてください"); expect(w.doc.activeElement).toBe(firstCat); expect(w.calls).toHaveLength(0); expect(w.c.state.sending).toBe(false);
    w.cleanup();
  });
  test("a fix needs at least one photo; a クルーNo. that is not 14 digits says how many it has", async () => {
    const w = await world(); const f = form(w, { kind: "fix", crewNo: "1234-5678" }); w.reg("#kc-file", w.el("input", { id: "file" })); w.c.open(); w.submit();
    expect(f.e_photos.textContent).toBe("現地で撮った写真を1枚以上えらんでください"); expect(f.e_crew.textContent).toBe("14けたの数字を入れてください（いまは8けた）"); expect(f.crew.getAttribute("aria-invalid")).toBe("true");
    f.crew.value = "1234-5678-9012-3A"; w.submit(); expect(f.e_crew.textContent).toBe("数字だけで入れてください（ハイフンはあってもOK）"); expect(w.calls).toHaveLength(0); w.cleanup();
  });
  test("a valid クルーNo. is shown back as plain digits once the field is left", async () => {
    const w = await world(); const f = form(w); w.c.open(); f.crew.value = "１２３４-5678-9012-34"; w.change({ id: "kc-crew", value: f.crew.value, name: "crewNo", dataset: {} }); w.cleanup();
    expect(w.reg).toBeDefined();
  });
});

const okFetch2 = () => async (url, init) => (url.endsWith("/contributors") ? json({ contributorId: "u1", token: "u1.secret" }, 201) : json({ id: "sub_1", status: "new" }, 201));

describe("the controller: sending", () => {
  const okFetch = (log = []) => async (url, init, i) => {
    log.push([init.method, url.split("/api/contrib/v1")[1]]);
    if (url.endsWith("/contributors")) return json({ contributorId: "u1", token: "u1.secret" }, 201);
    if (url.endsWith("/submissions")) return json({ id: "sub_1", status: "new" }, 201);
    return json({}, 404);
  };
  test("the whole send: a login is made, then the multipart report goes with the pose, the screenshot and the photos; the sheet says thank you and forgets the report", async () => {
    const seq = []; const w = await world({ fetch: okFetch(seq) }); const f = form(w, { crewNo: "1234-5678-9012-34" }); w.reg('[data-sub="done"]', w.el("div")); w.reg("#kc-shot", w.el("section")); w.reg('[data-act="goto"]', w.el("button"));
    const radios = [w.el("input", { value: "sign", checked: true }), w.el("input", { value: "road", checked: false })], issue = w.reg('input[name="kind"][value="issue"]', w.el("input", { value: "issue", checked: false })); w.reg('input[name="category"]', ...radios);
    const noteN = w.reg('[data-f="note-n"]', w.el("span", { textContent: "19" }));
    w.c.open({ opener: w.opener }); await Bun.sleep(30);
    w.change({ dataset: { f: "file" }, files: [photo("IMG_0001.JPG"), photo("two.png", "image/png")], value: "x", name: "" }); await Bun.sleep(10);
    expect(w.c.state.photos.map((p) => p.name)).toEqual(["IMG_0001.JPG", "two.png"]);
    w.submit(); await w.done();
    expect(seq).toEqual([["POST", "/contributors"], ["POST", "/submissions"]]);
    const fd = w.calls[1].body; expect(fd).toBeInstanceOf(FormData);
    expect([...fd.keys()]).toEqual(["pose", "kind", "category", "note", "lang", "consent", "screenshot", "photos", "photos"]);
    expect(JSON.parse(fd.get("pose"))).toEqual(w.c.state.pose ?? JSON.parse(fd.get("pose"))); expect(JSON.parse(fd.get("pose")).enu).toEqual([120.5, 30.25, -60.13]);
    expect([fd.get("kind"), fd.get("category"), fd.get("note"), fd.get("lang"), fd.get("consent")]).toEqual(["issue", "sign", "看板が1メートルほど右にずれています。", "ja", "1"]);
    expect(fd.get("screenshot").type).toBe("image/jpeg"); expect(fd.getAll("photos").map((p) => p.name)).toEqual(["IMG_0001.JPG", "two.png"]);
    expect(JSON.parse(w.calls[0].body)).toEqual({ nickname: "さくら", crewNo: "12345678901234" }); expect(w.calls[1].headers.authorization).toBe("Bearer u1.secret");
    expect(w.c.state.sub).toBe("done"); expect(w.c.state.photos).toHaveLength(0); expect(w.c.state.shot).toBeNull(); expect(w.c.state.note).toBe(""); expect(w.c.state.category).toBe(""); expect(w.c.state.consent).toBe(false);
    expect(loadDraft(w.store)).toBeNull(); expect(loadProfile(w.store)).toEqual({ nickname: "さくら", crewNo: "12345678901234" }); expect(w.urls.size).toBe(0);
    // the fields are blank again (no stale default from the first draw), the nickname and the クルーNo. stay
    expect(radios.map((r) => r.checked)).toEqual([false, false]); expect(issue.checked).toBe(true); expect(f.note.value).toBe(""); expect(f.consent.checked).toBe(false); expect(noteN.textContent).toBe("0"); expect(w.root().dataset.kind).toBe("issue");
    expect(f.nick.value).toBe("さくら"); expect(f.crew.value).toBe("1234-5678-9012-34");
    expect(w.root().innerHTML).toContain("kc-sheet"); w.cleanup();
  });
  test("a returning contributor is not made again; a changed nickname is PATCHed first", async () => {
    const seq = []; const fetch = async (url, init) => { seq.push([init.method, url.split("/api/contrib/v1")[1]]); return url.endsWith("/me") ? json({ contributorId: "u1", nickname: "ひろ", points: 0, submissions: [] }) : json({ id: "s2", status: "new" }, 201); };
    const w = await world({ fetch }); createAccounts(w.store, TEST_API).set({ id: "u1", token: "u1.secret" });
    form(w, { nickname: "ひろ" }); w.reg('[data-sub="done"]', w.el("div")); w.c.open(); w.submit(); await w.done();
    expect(seq).toEqual([["PATCH", "/me"], ["POST", "/submissions"]]); expect(JSON.parse(w.calls[0].body)).toEqual({ nickname: "ひろ", crewNo: null }); expect(w.c.state.sub).toBe("done"); w.cleanup();
  });
  test("the progress bar follows the upload; the send button and the form are locked while it runs; the cancel button shows", async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const w = await world({ fetch: async (url) => { if (url.endsWith("/contributors")) return json({ contributorId: "u1", token: "u1.s" }, 201); await gate; return json({ id: "s", status: "new" }, 201); } });
    const f = form(w); w.reg('[data-sub="done"]', w.el("div")); w.c.open(); w.submit(); await Bun.sleep(15);
    expect(w.c.state.sending).toBe(true); expect(f.send.disabled).toBe(true); expect(f.cancel.hidden).toBe(false); expect(f.prog.hidden).toBe(false); expect(f.progT.textContent).toBe("送っています… 0%");
    w.submit(); await Bun.sleep(5); expect(w.calls.filter((c) => c.url.endsWith("/submissions"))).toHaveLength(1);   // a second tap sends nothing more
    release(); await w.done(); expect(w.c.state.sending).toBe(false); expect(f.prog.hidden).toBe(true); expect(w.c.state.sub).toBe("done"); w.cleanup();
  });
  test("a failure keeps everything, says why in plain words, and offers 「もういちど送る」: the network, a full day (daily_limit, with when to come back), the server", async () => {
    for (const [fetch, want] of [[async () => { throw new TypeError("offline"); }, "サーバーにつながりませんでした"],
      [async (url) => (url.endsWith("/contributors") ? json({ contributorId: "u", token: "u.s" }, 201) : json({ error: "daily_limit", message: "x" }, 429, { "retry-after": "5400" })), "今日はたくさん送ってくれてありがとう！ 約2時間あとに、また送れます。"],
      [async (url) => (url.endsWith("/contributors") ? json({ contributorId: "u", token: "u.s" }, 201) : json({ error: "internal", message: "x" }, 503)), "サーバーのぐあい"]]) {
      const w = await world({ fetch }); const f = form(w); w.c.open(); w.c.state.photos.push({ id: "p1", file: photo(), name: "a.jpg", thumb: "", tried: true });
      w.submit(); await w.done();
      expect(f.alert.hidden).toBe(false); expect(f.alert.innerHTML).toContain("送れませんでした"); expect(f.alert.innerHTML).toContain(want); expect(f.sendT.textContent).toBe("もういちど送る");
      expect(w.c.state.sending).toBe(false); expect(f.send.disabled).toBe(false); expect(w.c.state.sub).toBe("form"); expect(w.c.state.photos).toHaveLength(1); expect(w.doc.activeElement).toBe(f.send);
      // (nothing reached the server when the network was down; once the login was made the server knows the profile, so a retry does not make a second contributor)
      if (want.includes("つながりませんでした")) expect(w.c.accounts.get()).toBeNull(); else expect(w.c.accounts.get().profile).toEqual({ nickname: "さくら", crewNo: "" });
      w.cleanup();
    }
  });
  test("the backend's own refusals are explained in the visitor's words: no empty report, no link in a nickname, 14 digits, a busy server", async () => {
    for (const [status, error, want] of [[400, "empty_submission", "メモを書くか、写真を1枚そえてください。"], [400, "invalid_nickname", "ニックネームに、リンクやメールアドレスは使えません。"], [400, "invalid_crew_no", "クルーNo.は14けたの数字で入れてください。"],
      [503, "server_busy", "いま、たくさんの人が使っています。"], [415, "invalid_image", "対応していない形式の写真があります。"], [413, "photo_too_large", "写真が大きすぎるようです。"], [400, "fix_needs_photos", "現地で撮った写真を1枚以上えらんでください。"]]) {
      const w = await world({ fetch: async (url) => (url.endsWith("/contributors") ? json({ contributorId: "u", token: "u.s" }, 201) : json({ error, message: "x" }, status)) }); const f = form(w); w.c.open(); w.submit(); await w.done();
      expect([error, f.alert.innerHTML.includes(want)]).toEqual([error, true]); w.cleanup();
    }
  });
  test("one report, one Idempotency-Key: a retry after a failure carries the same key (a lost answer cannot make two reports), changing the report makes a new key, a sent report spends it", async () => {
    let fail = 2; const keys = [];
    const w = await world({ fetch: async (url, init) => { if (url.endsWith("/contributors")) return json({ contributorId: "u", token: "u.s" }, 201); keys.push(init.headers["idempotency-key"]); if (fail-- > 0) throw new TypeError("offline"); return json({ id: "s", status: "new" }, 201); } });
    const f = form(w); w.reg('[data-sub="done"]', w.el("div")); w.c.open(); await Bun.sleep(20);
    w.submit(); await w.done(); w.submit(); await w.done();   // two failed attempts of the same report
    expect(keys).toHaveLength(2); expect(keys[0]).toMatch(/^[A-Za-z0-9._:-]{8,80}$/); expect(keys[1]).toBe(keys[0]);
    f.note.value = "もうひとこと足しました"; w.submit(); await w.done();   // edited: another report, another key (the third attempt goes through)
    expect(keys).toHaveLength(3); expect(keys[2]).not.toBe(keys[0]); expect(w.c.state.sub).toBe("done");
    expect(w.c.state.sendKey).toBeNull();   // spent
    w.c.state.sub = "form"; f.note.value = "次の報告"; f.consent.checked = true; w.reg('input[name="category"]:checked', w.el("input", { value: "sign" })); w.submit(); await w.done();
    expect(keys).toHaveLength(4); expect(new Set(keys).size).toBe(3); w.cleanup();
  });
  test("sending waits for a screenshot that is still being taken (a quick tap must not lose it), and without any screenshot, note or photo there is nothing to send", async () => {
    const w = await world({ fetch: okFetch2() }); const f = form(w, { note: "" }); w.reg('[data-sub="done"]', w.el("div")); w.reg("#kc-shot", w.el("section"));
    const ce = w.doc.createElement; w.doc.createElement = (t) => { const c = ce(t); if (t === "canvas") { const tb = c.toBlob; c.toBlob = (cb, type, q) => setTimeout(() => tb(cb, type, q), 60); } return c; };   // a slow encoder
    w.c.open(); expect(w.c.state.shotState).toBe("wait"); f.note.value = "x"; w.submit(); await w.done();
    expect(w.c.state.sub).toBe("done"); expect(w.calls.at(-1).body.get("screenshot")?.type).toBe("image/jpeg"); w.cleanup();
    const v = await world({ fetch: okFetch2() }); const g = form(v, { note: "  " }); v.ctx.pipeline.render = () => { throw new Error("context lost"); };
    v.c.open(); await Bun.sleep(20); expect(v.c.state.shotState).toBe("fail"); v.submit(); await v.done();
    expect(g.e_note.hidden).toBe(false); expect(g.e_note.textContent).toBe("画面を取り込めなかったので、メモを書くか、写真を1枚そえてください"); expect(v.calls).toHaveLength(0); expect(v.c.state.sub).toBe("form");
    g.note.value = "メモがあれば送れます"; v.submit(); await v.done(); expect(v.calls.at(-1).body.get("screenshot")).toBeNull(); expect(v.c.state.sub).toBe("done"); v.cleanup();
  });
  test("a nickname with a link is refused where it is typed (under the field), is not remembered, and blocks the send", async () => {
    const w = await world({ fetch: okFetch2() }); const f = form(w, { nickname: "http://spam.example.com" }); w.c.open();
    f.nick.value = "http://spam.example.com"; w.change({ id: "kc-nick", value: f.nick.value, name: "nickname", dataset: {} });
    expect(f.e_nick.hidden).toBe(false); expect(f.e_nick.textContent).toBe("リンクやメールアドレスは、ニックネームに使えません"); expect(f.nick.getAttribute("aria-invalid")).toBe("true"); expect(loadProfile(w.store).nickname).toBe("");
    w.submit(); await w.done(); expect(w.calls).toHaveLength(0); expect(f.e_nick.hidden).toBe(false); expect(w.doc.activeElement).toBe(f.nick); expect(f.alert.textContent).toBe("入力をたしかめてください");
    f.nick.value = "そら"; w.input({ id: "kc-nick", value: "そら", dataset: {} }); expect(f.e_nick.hidden).toBe(true); w.change({ id: "kc-nick", value: "そら", name: "nickname", dataset: {} }); expect(loadProfile(w.store).nickname).toBe("そら"); w.cleanup();
  });
  test("then it can be sent again (the same form, a working network)", async () => {
    let up = false; const w = await world({ fetch: async (url) => { if (!up) throw new TypeError("offline"); return url.endsWith("/contributors") ? json({ contributorId: "u", token: "u.s" }, 201) : json({ id: "s", status: "new" }, 201); } });
    form(w); w.reg('[data-sub="done"]', w.el("div")); w.c.open(); w.submit(); await w.done(); expect(w.c.state.sub).toBe("form"); up = true; w.submit(); await w.done(); expect(w.c.state.sub).toBe("done"); w.cleanup();
  });
  test("a token the server no longer knows (401) is replaced once, then the report goes", async () => {
    const seq = []; let first = true;
    const w = await world({ fetch: async (url, init) => { seq.push([init.method, url.split("/api/contrib/v1")[1]]); if (url.endsWith("/contributors")) return json({ contributorId: "new", token: "new.s" }, 201); if (first) { first = false; return json({ error: "unknown token" }, 401); } return json({ id: "s", status: "new" }, 201); } });
    const oldLogin = createAccounts(w.store, TEST_API); oldLogin.set({ id: "old", token: "old.dead" }); oldLogin.setProfile({ nickname: "さくら", crewNo: "" });
    form(w); w.reg('[data-sub="done"]', w.el("div")); w.c.open(); w.submit(); await w.done();
    expect(seq).toEqual([["POST", "/submissions"], ["POST", "/contributors"], ["POST", "/submissions"]]); expect(w.c.state.sub).toBe("done"); expect(w.c.accounts.get().token).toBe("new.s"); w.cleanup();
    // the same when the token dies on the profile update that comes first
    first = true; seq.length = 0;
    const v = await world({ fetch: async (url, init) => { seq.push([init.method, url.split("/api/contrib/v1")[1]]); if (url.endsWith("/contributors")) return json({ contributorId: "new", token: "new.s" }, 201); if (first) { first = false; return json({ error: "unknown token" }, 401); } return json({ id: "s", status: "new" }, 201); } });
    createAccounts(v.store, TEST_API).set({ id: "old", token: "old.dead" }); form(v); v.reg('[data-sub="done"]', v.el("div")); v.c.open(); v.submit(); await v.done();
    expect(seq).toEqual([["PATCH", "/me"], ["POST", "/contributors"], ["POST", "/submissions"]]); expect(v.c.state.sub).toBe("done"); v.cleanup();
  });
  test("cancel aborts the upload and leaves the form as it was", async () => {
    const w = await world({ fetch: async (url, init) => (url.endsWith("/contributors") ? json({ contributorId: "u", token: "u.s" }, 201) : new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new DOMException("a", "AbortError"))))) });
    const f = form(w); w.c.open(); w.submit(); await Bun.sleep(20); w.click("cancel"); await w.done();
    expect(w.c.state.sending).toBe(false); expect(w.c.state.sub).toBe("form"); expect(f.alert.hidden).toBe(true); expect(w.doc.activeElement).toBe(f.send); w.cleanup();
  });
  test("a pose that cannot be read is an error, not a broken request", async () => {
    const w = await world(); form(w); w.ctx.camera = {}; w.c.open(); w.c.state.pose = null; w.submit(); await w.done();
    expect(w.calls).toHaveLength(0); expect(w.reg).toBeDefined(); w.cleanup();
  });
});

describe("the controller: photos", () => {
  test("up to six; the rest are refused with a reason; unsupported types, too big and empty files are refused; the same file twice counts once", async () => {
    const w = await world(); const f = form(w); w.c.open();
    const many = Array.from({ length: 8 }, (_, i) => photo(`p${i}.jpg`)); w.change({ dataset: { f: "file" }, files: many, value: "x" }); await Bun.sleep(5);
    expect(w.c.state.photos).toHaveLength(6); expect(f.e_photos.textContent).toBe("写真は6枚までです"); expect(f.photosN.textContent).toBe("6 / 6枚"); expect(f.tiles.innerHTML.match(/class="kc-tile"/g)).toHaveLength(6);
    const w2 = await world(); const f2 = form(w2); w2.c.open();
    const fake = (name, type, size, lastModified = 1) => ({ name, type, size, lastModified });
    w2.change({ dataset: { f: "file" }, files: [fake("a.gif", "image/gif", 10), fake("big.jpg", "image/jpeg", 15 * 1048576 + 1), fake("empty.jpg", "image/jpeg", 0), fake("ok.jpg", "image/jpeg", 4), fake("ok.jpg", "image/jpeg", 4)], value: "x" }); await Bun.sleep(5);
    expect(w2.c.state.photos.map((p) => p.name)).toEqual(["ok.jpg"]);
    expect(f2.e_photos.textContent).toContain("a.gif は対応していない形式です"); expect(f2.e_photos.textContent).toContain("big.jpg は大きすぎます（15MBまで）"); expect(f2.e_photos.textContent).toContain("empty.jpg を読み込めませんでした");
    w.cleanup(); w2.cleanup();
  });
  test("a photo can be removed from its tile; the counter and the live region follow", async () => {
    const w = await world(); const f = form(w); w.c.open(); w.change({ dataset: { f: "cam" }, files: [photo("a.jpg"), photo("b.jpg")], value: "x" }); await Bun.sleep(5);
    const id = w.c.state.photos[0].id; w.reg(".kc-rm", w.el("button", { id: "rm-left" })); w.click("rm", { id });   // (one tile is left after the redraw)
    expect(w.c.state.photos.map((p) => p.name)).toEqual(["b.jpg"]); expect(f.photosN.textContent).toBe("1 / 6枚"); expect(w.doc.activeElement.id).toBe("rm-left"); w.cleanup();
  });
  test("thumbnails are made by decoding at thumbnail size, one photo at a time, and each decoded bitmap is closed", async () => {
    const w = await world(); form(w); const closed = [], sizes = [];
    w.win.createImageBitmap = async (f, o) => { sizes.push(o.resizeWidth); return { width: 160, height: 90, close() { closed.push(f.name); } }; };
    w.c.open(); w.change({ dataset: { f: "file" }, files: [photo("a.jpg"), photo("b.jpg")], value: "x" }); await Bun.sleep(30);
    expect(sizes).toEqual([160, 160]); expect(closed).toEqual(["a.jpg", "b.jpg"]); expect(w.c.state.photos.every((p) => p.thumb.startsWith("blob:"))).toBe(true);
    for (const c of w.canvases) expect(c.width).toBe(0);
    w.c.state.photos.splice(0); w.cleanup();
  });
});

describe("the controller: the draft, the profile, the kind", () => {
  test("typing saves the text (not the photos, not the consent) after a pause, closing saves at once, and a fresh page gets it back", async () => {
    const w = await world(); const f = form(w, { note: "", nickname: "", category: "road" }); w.c.open();
    f.note.value = "道が一本ちがう"; w.input({ id: "kc-note", value: f.note.value }); expect(loadDraft(w.store)).toBeNull(); await Bun.sleep(450);
    expect(loadDraft(w.store)).toMatchObject({ note: "道が一本ちがう", category: "road", kind: "issue" });
    f.note.value = "道が一本ちがう。橋もです"; w.c.close(); expect(loadDraft(w.store).note).toBe("道が一本ちがう。橋もです");
    const raw = JSON.parse(w.ls.getItem(KEYS.draft)); expect(Object.keys(raw).sort()).toEqual(["at", "category", "crewNo", "kind", "note", "v"]);
    const again = await world(); again.ls._m.set(KEYS.draft, w.ls.getItem(KEYS.draft)); again.c.open(); expect(again.c.state).toMatchObject({ note: "道が一本ちがう。橋もです", category: "road", kind: "issue", consent: false });
    w.cleanup(); again.cleanup();
  });
  test("the nickname and the クルーNo. are remembered as soon as the field is left, and the kind switch is a data attribute (no re-render) that goes into the draft", async () => {
    const w = await world(); const f = form(w, { nickname: "ひろ" }); w.c.open();
    w.change({ id: "kc-nick", value: "  ひろ  ", name: "nickname", dataset: {} }); expect(loadProfile(w.store)).toEqual({ nickname: "ひろ", crewNo: "" });
    w.change({ id: "kc-crew", value: "1234-5678-9012-34", name: "crewNo", dataset: {} }); expect(loadProfile(w.store)).toEqual({ nickname: "ひろ", crewNo: "12345678901234" });
    f.kind.value = "fix"; w.change({ name: "kind", value: "fix", dataset: {} }); expect(w.root().dataset.kind).toBe("fix"); expect(w.c.state.kind).toBe("fix"); expect(loadDraft(w.store).kind).toBe("fix");
    w.cleanup(); expect(f.nick).toBeDefined();
  });
  test("a changed nickname is sent once: the second report does not PATCH again, a third with a new nickname does", async () => {
    const seq = []; const w = await world({ fetch: async (url, init) => { seq.push(init.method + " " + url.split("/api/contrib/v1")[1]); return url.endsWith("/contributors") ? json({ contributorId: "u", token: "u.s" }, 201) : url.endsWith("/me") ? json({ contributorId: "u", nickname: "x", points: 0, submissions: [] }) : json({ id: "s", status: "new" }, 201); } });
    const f = form(w, { nickname: "さくら" }); w.reg('[data-sub="done"]', w.el("div"));
    for (const nick of ["さくら", "さくら", "ひろ"]) { f.nick.value = nick; f.cat = null; w.reg('input[name="category"]:checked', w.el("input", { value: "sign" })); f.consent.checked = true; w.c.open(); w.submit(); await w.done(); w.c.state.sub = "form"; w.c.close(); }
    expect(seq).toEqual(["POST /contributors", "POST /submissions", "POST /submissions", "PATCH /me", "POST /submissions"]); w.cleanup();
  });
});

describe("the controller: my reports, the leaderboard, the transfer", () => {
  const me = { contributorId: "u1", nickname: "さくら", crewNo: "12345678901234", points: 25, submissions: [{ id: "a", createdAt: "2026-10-05T01:00:00Z", status: "accepted", kind: "issue", category: "sign", note: "", points: 5 }] };
  test("マイ投稿 loads /me; with no login on this device it asks nothing; an error shows a retry", async () => {
    const w = await world({ fetch: async () => json(me) }); createAccounts(w.store, TEST_API).set({ id: "u1", token: "u1.s" }); const panel = w.reg("#kc-p-mine", w.el("section")); w.c.open(); w.click("tab", { tab: "mine" });
    await Bun.sleep(20); expect(w.c.state.mine.state).toBe("ok"); expect(panel.innerHTML).toContain("合計 25 ポイント"); expect(panel.innerHTML).toContain("採用"); expect(w.calls.map((c) => c.url.split("/api/contrib/v1")[1])).toEqual(["/me"]); w.cleanup();
    const anon = await world(); const p2 = anon.reg("#kc-p-mine", anon.el("section")); anon.c.open(); anon.click("tab", { tab: "mine" }); await Bun.sleep(10); expect(anon.c.state.mine.state).toBe("anon"); expect(anon.calls).toHaveLength(0); expect(p2.innerHTML).toContain("まだ投稿がありません"); anon.cleanup();
    const bad = await world({ fetch: async () => { throw new TypeError("x"); } }); createAccounts(bad.store, TEST_API).set({ id: "u1", token: "u1.s" }); const p3 = bad.reg("#kc-p-mine", bad.el("section")); bad.c.open(); bad.click("tab", { tab: "mine" }); await Bun.sleep(20);
    expect(bad.c.state.mine.state).toBe("error"); expect(p3.innerHTML).toContain("reload-mine"); bad.cleanup();
  });
  test("the leaderboard loads without a login", async () => {
    const w = await world({ fetch: async () => json([{ nickname: "さくら", accepted: 3, points: 35 }]) }); const p = w.reg("#kc-p-board", w.el("section")); w.c.open(); w.click("tab", { tab: "board" }); await Bun.sleep(20);
    expect(w.c.state.board.state).toBe("ok"); expect(p.innerHTML).toContain("さくら"); expect(p.innerHTML).toContain("35pt"); expect(w.calls[0].headers.authorization).toBeUndefined(); expect(p.innerHTML).not.toContain("data-me"); w.cleanup();
  });
  test("with a login the token goes along and the row the server marks (me) is \"you\"", async () => {
    const w = await world({ fetch: async () => json([{ nickname: "ひろ", accepted: 2, points: 40 }, { nickname: "さくら", accepted: 3, points: 35, me: true }]) }); createAccounts(w.store, TEST_API).set({ id: "u1", token: "u1.s" });
    const p = w.reg("#kc-p-board", w.el("section")); w.c.open(); w.click("tab", { tab: "board" }); await Bun.sleep(20);
    expect(w.calls[0].headers.authorization).toBe("Bearer u1.s"); expect(p.innerHTML.match(/data-me="1"/g)).toHaveLength(1); expect(p.innerHTML).toMatch(/data-rank="2" data-me="1"/); expect(p.innerHTML).toContain("あなた"); w.cleanup();
  });
  test("a transfer code: shown grouped with its countdown and a QR code of the link; copy puts the plain code on the clipboard; the card can be closed", async () => {
    const w = await world({ fetch: async (url) => (url.endsWith("/me/transfer-code") ? json({ code: "K7M2X-9QP4A", expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), expiresInSeconds: 900 }) : json(me)) });   // (the backend's spelling, with the dash)
    createAccounts(w.store, TEST_API).set({ id: "u1", token: "u1.s" }); const card = w.reg('[data-f="xfer-card"]', w.el("div")); w.reg('[data-act="xfer"]', w.el("button")); w.reg("#kc-p-mine", w.el("section"));
    w.c.open(); w.click("tab", { tab: "mine" }); await Bun.sleep(10); w.click("xfer"); await Bun.sleep(20);
    expect(w.c.state.xfer.phase).toBe("ready"); expect(card.innerHTML).toContain("K7M2X-9QP4A"); expect(card.innerHTML).toContain("<svg");
    expect(w.c.state.xfer.svg).toBe(qrToSvg(qrEncode("https://app.example/index.html?claim=K7M2X9QP4A&contribApi=http%3A%2F%2F127.0.0.1%3A8988", { ecl: "M" }), { title: "引き継ぎ用のQRコード" }));
    await Bun.sleep(10); w.click("copy"); await Bun.sleep(10); expect(w.win.copied).toBe("K7M2X9QP4A");
    w.key("Escape"); expect(w.c.state.xfer.phase).toBe("idle"); expect(w.c.isOpen).toBe(true); w.c.close(); w.cleanup();
  });
  test("too many codes in an hour (429) is explained as such, not as \"too many reports\"", async () => {
    const w = await world({ fetch: async (url) => (url.endsWith("/me/transfer-code") ? json({ error: "rate_limited", message: "x" }, 429, { "retry-after": "3000" }) : json(me)) });
    createAccounts(w.store, TEST_API).set({ id: "u1", token: "u1.s" }); const card = w.reg('[data-f="xfer-card"]', w.el("div")); w.reg("#kc-p-mine", w.el("section"));
    w.c.open(); w.click("tab", { tab: "mine" }); await Bun.sleep(10); w.click("xfer"); await Bun.sleep(20);
    expect(w.c.state.xfer.phase).toBe("error"); expect(card.innerHTML).toContain("コードを作る回数が多すぎます"); expect(card.innerHTML).not.toContain("たくさん送ってくれて"); w.cleanup();
  });
  test("a code for a test backend carries ?contribApi= in its QR link", async () => {
    const w = await world({ search: "?contribApi=http://127.0.0.1:8988", fetch: async (url) => (url.endsWith("/me/transfer-code") ? json({ code: "K7M2X9QP4A", expiresAt: Date.now() + 900000 }) : json(me)) });
    createAccounts(w.store, "http://127.0.0.1:8988").set({ id: "u1", token: "u1.s" }); w.reg('[data-f="xfer-card"]', w.el("div")); w.reg("#kc-p-mine", w.el("section"));
    w.c.open(); w.click("tab", { tab: "mine" }); await Bun.sleep(10); w.click("xfer"); await Bun.sleep(20);
    expect(w.c.state.xfer.svg).toBe(qrToSvg(qrEncode("https://app.example/index.html?claim=K7M2X9QP4A&contribApi=http%3A%2F%2F127.0.0.1%3A8988", { ecl: "M" }), { title: "引き継ぎ用のQRコード" }));
    w.c.close(); w.cleanup();
  });
  test("entering a code on the second device: a good code replaces the login, shows the earlier reports AND fills the form's nickname and クルーNo. (a blank field would erase them at the next report); a bad one says why under the field", async () => {
    let ok = true, fail = [404, "code_not_found"]; const w = await world({ fetch: async (url) => (url.endsWith("/contributors/claim") ? (ok ? json({ contributorId: "u1", token: "u1.s", nickname: "さくら" }) : json({ error: fail[1], message: "x" }, fail[0])) : json(me)) });
    const f = form(w, { nickname: "", crewNo: "" });
    const claimIn = w.reg("#kc-claim-in", w.el("input", { id: "kc-claim-in", value: "" })), claimErr = w.reg("#kc-claim-e", w.el("p", { hidden: true })); w.reg("#kc-claimform", w.el("form")); w.reg('[data-act="claim"]', w.el("button")); const minePanel = w.reg("#kc-p-mine", w.el("section")); w.reg(".kc-body", w.el("div", { scrollTop: 0 }));
    const go = async (v, ms = 20) => { claimIn.value = v; w.input(claimIn); w.root().listeners.submit[0]({ preventDefault() {}, target: { id: "kc-claimform" } }); await Bun.sleep(ms); };
    w.c.open(); w.click("tab", { tab: "mine" }); await Bun.sleep(10);
    await go("ab", 10); expect(claimErr.textContent).toBe("コードは10文字です。まちがいがないか、もういちど見てください。"); expect(claimErr.hidden).toBe(false); expect(w.calls).toHaveLength(0);
    await go("UUUUUUUUUU", 10); expect(claimErr.textContent).toBe("コードは10文字です。まちがいがないか、もういちど見てください。"); expect(w.calls).toHaveLength(0);   // (U is not a code character: no try is wasted, the backend lets 5 through an hour)
    ok = false; await go("ABCDE-FGHJK"); expect(claimErr.textContent).toBe("このコードは使えません。期限切れか、まちがっているかもしれません。"); expect(JSON.parse(w.calls[0].body)).toEqual({ code: "ABCDEFGHJK" }); expect(w.c.accounts.get()).toBeNull();
    fail = [429, "rate_limited"]; await go("ABCDE-FGHJK"); expect(claimErr.textContent).toBe("コードを入れた回数が多すぎます。1時間ほどあけてから、もういちど試してください。");
    fail = [409, "too_many_devices"]; await go("ABCDE-FGHJK"); expect(claimErr.textContent).toBe("この登録で使える端末の数がいっぱいです。");
    ok = true; await go("k7qm2-xhd9p", 30);
    expect(JSON.parse(w.calls.at(-2).body)).toEqual({ code: "K7QM2XHD9P" });
    expect(w.c.accounts.get()).toMatchObject({ id: "u1", token: "u1.s" }); expect(w.c.state.mine.state).toBe("ok"); expect(loadProfile(w.store)).toEqual({ nickname: "さくら", crewNo: "12345678901234" }); expect(w.c.state.nickname).toBe("さくら");
    expect([f.nick.value, f.crew.value]).toEqual(["さくら", "12345678901234"]); expect(w.c.accounts.get().profile).toEqual({ nickname: "さくら", crewNo: "12345678901234" });   // (and the server is not told anything different at the next report)
    expect(minePanel.innerHTML).toContain("引き継ぎました。これまでの投稿が表示されます。"); expect(minePanel.innerHTML).toContain('role="status"');   // (a line at the top, where the scroll goes: the claim form is at the bottom)
    w.cleanup();
  });
  test("a link from the QR code (?claim=CODE) opens マイ投稿 with the code filled in once the visitor is in the town, and takes the code out of the address", async () => {
    const w = await world({ search: "?claim=k7m2-x9qp4a", force: true }); await Bun.sleep(450);
    expect(w.c.isOpen).toBe(true); expect(w.c.state.tab).toBe("mine"); expect(w.c.state.claim).toMatchObject({ value: "K7M2X9QP4A", open: true }); expect(w.c.state.claim.hint).toBe("別の端末のコードが入っています。「引き継ぐ」を押してください。");
    expect(w.log.some((x) => Array.isArray(x) && x[0] === "replaceState" && !String(x[3]).includes("claim"))).toBe(true); w.cleanup();
  });
  test("「この端末の情報を消す」 takes two presses; then the login, the profile and the draft are gone from this device (the server is not touched) and a line says so", async () => {
    const w = await world({ fetch: async () => json(me) }); createAccounts(w.store, TEST_API).set({ id: "u1", token: "u1.s" }); form(w); const panel = w.reg("#kc-p-mine", w.el("section")); const fb = w.reg('[data-act="forget"]', w.el("button", { textContent: "この端末の情報を消す" }));
    w.c.open(); w.click("tab", { tab: "mine" }); await Bun.sleep(10); const before = w.calls.length; w.click("forget"); expect(w.c.accounts.get()).not.toBeNull(); expect(fb.textContent).toBe("もういちど押すと消えます");
    w.click("forget"); expect(w.c.accounts.get()).toBeNull(); expect(loadProfile(w.store)).toEqual({ nickname: "", crewNo: "" }); expect(loadDraft(w.store)).toBeNull(); expect(w.c.state.mine.state).toBe("anon");
    expect(w.calls.length).toBe(before); expect(panel.innerHTML).toContain("この端末の情報を消しました"); expect(panel.innerHTML).toContain('role="status"'); w.cleanup();
  });
  describe("「送ったデータをすべて削除」", () => {
    const setup = async (fetch) => {
      const w = await world({ fetch }); createAccounts(w.store, TEST_API).set({ id: "u1", token: "u1.s" }); const f = form(w); const panel = w.reg("#kc-p-mine", w.el("section"));
      const card = w.reg('[data-f="erase-card"]', w.el("div")), no = w.reg('[data-act="erase-no"]', w.el("button", { id: "erase-no" })), start = w.reg('[data-act="erase"]', w.el("button", { id: "erase" })), scroller = w.reg(".kc-body", w.el("div", { scrollTop: 0 }));
      w.c.open(); w.click("tab", { tab: "mine" }); await Bun.sleep(15); return { w, f, panel, card, no, start, scroller };
    };
    test("the mine panel offers it (the device has a login); one press only asks, with the safe answer focused; やめる puts it back and the focus returns to the button", async () => {
      const { w, panel, card, no, start } = await setup(async () => json(me));
      expect(panel.innerHTML).toContain("kc-erase"); expect(panel.innerHTML).toContain('data-act="erase"');
      w.click("erase"); expect(w.c.state.erase.phase).toBe("confirm"); expect(card.innerHTML).toContain("本当に削除しますか？"); expect(card.innerHTML).toContain('data-act="erase-yes"'); expect(w.doc.activeElement).toBe(no); expect(w.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
      expect(w.reg).toBeDefined(); w.click("erase-no"); expect(w.c.state.erase.phase).toBe("idle"); expect(card.innerHTML).toContain('data-act="erase"'); expect(w.doc.activeElement).toBe(start); expect(w.c.accounts.get()).not.toBeNull(); w.cleanup();
    });
    test("yes: DELETE /me?confirm=1 with the token; then this device forgets the login, the profile and the draft, the fields are blank, and the panel says it is deleted", async () => {
      const { w, f, panel, scroller } = await setup(async (url, init) => (init.method === "DELETE" ? json({ ok: true, deletedFiles: 6 }) : json(me)));
      f.nick.value = "さくら"; scroller.scrollTop = 600;   // (the delete button is at the bottom of the panel) w.change({ id: "kc-nick", value: "さくら", name: "nickname", dataset: {} }); expect(loadProfile(w.store).nickname).toBe("さくら");
      w.click("erase"); w.click("erase-yes"); await Bun.sleep(30);
      const del = w.calls.find((c) => c.method === "DELETE"); expect(del.url).toBe(TEST_API + "/api/contrib/v1/me?confirm=1"); expect(del.headers.authorization).toBe("Bearer u1.s");
      expect(w.c.accounts.get()).toBeNull(); expect(loadProfile(w.store)).toEqual({ nickname: "", crewNo: "" }); expect(loadDraft(w.store)).toBeNull(); expect(w.c.state.mine.state).toBe("anon"); expect(w.c.state.erase.phase).toBe("idle");
      expect(f.nick.value).toBe(""); expect(f.crew.value).toBe(""); expect(panel.innerHTML).toContain("削除しました。この端末の情報も消しました。"); expect(panel.innerHTML).not.toContain('data-act="erase"');   // (no login left: nothing more to delete)
      expect(scroller.scrollTop).toBe(0);   // (the confirmation is at the top: the panel scrolls there)
      w.cleanup();
    });
    test("a failure keeps the login (nothing was erased), says why under the button and lets the visitor try again", async () => {
      const { w, panel, card, start } = await setup(async (url, init) => (init.method === "DELETE" ? json({ error: "internal", message: "x" }, 500) : json(me)));
      w.click("erase"); w.click("erase-yes"); await Bun.sleep(30);
      expect(w.c.accounts.get()).not.toBeNull(); expect(w.c.state.erase.phase).toBe("error"); expect(card.innerHTML).toContain("サーバーのぐあいが悪いようです"); expect(card.innerHTML).toContain('data-act="erase"'); expect(w.doc.activeElement).toBe(start); expect(panel.innerHTML).not.toContain("削除しました");
      w.cleanup();
    });
  });
});

describe("the controller: the limits and points the backend announces in GET /health", () => {
  const announced = (o = {}) => ({ ok: true, limits: { maxPhotos: 3, maxPhotoBytes: 5 * 1048576, maxScreenshotBytes: 8388608, maxNoteChars: 500, dailyLimit: 20 }, points: { issue: 7, fix: 30 }, ...o });
  const health = (body, log) => async (url) => { log?.push(url.split("/api/contrib/v1")[1]); return url.endsWith("/health") ? (body === null ? new Response("down", { status: 503 }) : json(body)) : json({}, 404); };
  /** Register the elements applyConfig touches. */
  const regs = (w) => ({ points: w.reg('[data-f="points"]', w.el("p", { textContent: "採用されると、問題の報告は約5ポイント、現地の写真で直すと約20ポイント。確認が終わるまでは「確認待ち」です。" })), done: w.reg('[data-f="points-done"]', w.el("p")),
    max: w.reg('[data-f="note-max"]', w.el("span", { textContent: "2000" })), hint: w.reg('[data-f="photos-hint"]', w.el("p", { textContent: "1枚15MBまで。" })), counter: w.reg('[data-f="photos-n"]', w.el("p")), tiles: w.reg("#kc-tiles", w.el("ul")) });
  test("it asks once when the sheet opens (GET /health, no login), not again within ten minutes, and never blocks the sheet", async () => {
    const log = []; const w = await world({ config: true, fetch: health(announced(), log) }); regs(w); w.c.open(); expect(w.c.isOpen).toBe(true);
    await Bun.sleep(20); expect(log).toEqual(["/health"]); expect(w.calls[0].headers.authorization).toBeUndefined(); w.c.close(); w.c.open(); await Bun.sleep(20); expect(log).toEqual(["/health"]); w.cleanup();
  });
  test("what is on screen follows the numbers: the points copy, the note's maximum, the photo size hint, the photo counter; the visitor's own text is untouched", async () => {
    const w = await world({ config: true, fetch: health(announced()) }); const f = form(w, { note: "keep this" }), e = regs(w); w.c.open(); await Bun.sleep(30);
    expect(e.points.textContent).toBe("採用されると、問題の報告は約7ポイント、現地の写真で直すと約30ポイント。確認が終わるまでは「確認待ち」です。"); expect(e.done.textContent).toBe("採用されると、問題の報告は約7ポイント、現地の写真で直すと約30ポイントです。");
    expect(e.max.textContent).toBe("500"); expect(f.note.maxLength).toBe(500); expect(e.hint.textContent).toBe("1枚5MBまで。JPEG・PNG・WebP・HEICに対応しています。"); expect(e.counter.textContent).toBe("0 / 3枚");
    expect(f.note.value).toBe("keep this"); w.cleanup();
  });
  test("the checks use them: a fourth photo is refused (only 3 allowed), a 6 MB photo is too big (5 MB at most), a 600-character note is too long", async () => {
    const w = await world({ config: true, fetch: health(announced()) }); const f = form(w, { note: "x".repeat(600) }); regs(w); w.c.open(); await Bun.sleep(30);
    w.change({ dataset: { f: "file" }, files: [photo("a.jpg"), photo("b.jpg"), photo("c.jpg"), photo("d.jpg")], value: "x" }); await Bun.sleep(5);
    expect(w.c.state.photos).toHaveLength(3); expect(f.e_photos.textContent).toBe("写真は3枚までです");
    w.c.state.photos.splice(0); w.change({ dataset: { f: "file" }, files: [{ name: "big.jpg", type: "image/jpeg", size: 6 * 1048576, lastModified: 1 }], value: "x" }); await Bun.sleep(5);
    expect(f.e_photos.textContent).toBe("big.jpg は大きすぎます（5MBまで）");
    w.submit(); await w.done(); expect(f.e_note.hidden).toBe(false); expect(f.e_note.textContent).toBe("メモは500文字までです"); expect(w.calls.filter((c) => c.url.endsWith("/submissions"))).toHaveLength(0); w.cleanup();
  });
  test("the report goes with the limits in force (a form built with 3 photos at most)", async () => {
    let body; const w = await world({ config: true, fetch: async (url, init) => { if (url.endsWith("/health")) return json(announced()); if (url.endsWith("/contributors")) return json({ contributorId: "u", token: "u.s" }, 201); body = init.body; return json({ id: "s", status: "new" }, 201); } });
    regs(w); form(w); w.reg('[data-sub="done"]', w.el("div")); w.c.open(); await Bun.sleep(30);
    for (let i = 0; i < 3; i++) w.c.state.photos.push({ id: "p" + i, file: photo(`${i}.jpg`), name: `${i}.jpg`, thumb: "", tried: true });
    w.submit(); await w.done(); expect(body.getAll("photos")).toHaveLength(3); expect(w.c.state.sub).toBe("done"); w.cleanup();
  });
  test("a backend that does not say (an older one, or down) leaves the built-in numbers and no error anywhere", async () => {
    for (const body of [null, { ok: true }, { ok: true, limits: { maxPhotos: 0 }, points: { issue: 0 } }]) {
      const w = await world({ config: true, fetch: health(body) }); const f = form(w); const e = regs(w); w.c.open(); await Bun.sleep(30);
      expect(e.points.textContent).toContain("約5ポイント"); expect(e.max.textContent).toBe("2000"); expect(f.alert.hidden).toBe(true); expect(w.c.isOpen).toBe(true); w.cleanup();
    }
    const throwing = await world({ config: true, fetch: async () => { throw new TypeError("offline"); } }); regs(throwing); throwing.c.open(); await Bun.sleep(20); expect(throwing.c.isOpen).toBe(true); throwing.cleanup();
  });
  test("the second language: the same numbers in English", async () => {
    const w = await world({ config: true, lang: "en", fetch: health(announced()) }); form(w); const e = regs(w); w.c.open(); await Bun.sleep(30);
    expect(e.points.textContent).toContain("about 7 points"); expect(e.points.textContent).toContain("about 30"); expect(e.hint.textContent).toBe("Up to 5 MB each. JPEG, PNG, WebP or HEIC."); expect(e.counter.textContent).toBe("0 / 3 photos"); w.cleanup();
  });
});

describe("the controller: language", () => {
  test("the language button switches the HUD's language and redraws the sheet in it without losing what was typed", async () => {
    const w = await world(); const f = form(w, { note: "keep me" }); w.c.open(); expect(w.root().innerHTML).toContain("修正を報告");
    w.click("lang"); expect(w.I.lang).toBe("en"); expect(w.root().innerHTML).toContain("Report a correction"); expect(w.root().getAttribute("lang")).toBe("en"); expect(w.c.state.note).toBe("keep me"); expect(w.log).toContain("hud.render");
    w.cleanup(); expect(f.note).toBeDefined();
  });
});

describe("no backend configured", () => {
  test("the sheet still opens, shows that reports are not open yet, in Japanese and English, and fetch is not called", async () => {
    const w = await world({ api: "", search: "?contrib=1" });
    expect(w.c.target).toMatchObject({ base: "", custom: false });
    w.c.open();
    expect(w.c.isOpen).toBe(true);
    expect(w.root().innerHTML).toContain("報告の受付は準備中です");
    expect(w.root().innerHTML).not.toContain('id="kc-form"');
    expect(w.calls).toHaveLength(0);
    w.click("lang");
    expect(w.root().innerHTML).toContain("Reports are not open yet");
    expect(w.calls).toHaveLength(0);
    w.cleanup();
  });
  test("submit, the leaderboard, a transfer code and DELETE /me make no request and do not throw", async () => {
    const w = await world({ api: "" });
    form(w);
    createAccounts(w.store, "").set({ id: "u1", token: "u1.s" });
    const mine = w.reg("#kc-p-mine", w.el("section"));
    const board = w.reg("#kc-p-board", w.el("section"));
    w.reg('[data-f="xfer-card"]', w.el("div"));
    w.reg('[data-f="erase-card"]', w.el("div"));
    w.reg(".kc-live", w.el("div"));
    w.c.open();
    expect(() => w.submit()).not.toThrow();
    await w.done();
    expect(w.c.state.sending).toBe(false);
    expect(w.c.state.sub).toBe("form");
    expect(() => w.click("tab", { tab: "board" })).not.toThrow();
    expect(board.innerHTML).toContain("報告の受付は準備中です");
    expect(() => w.click("tab", { tab: "mine" })).not.toThrow();
    expect(mine.innerHTML).toContain("報告の受付は準備中です");
    expect(() => w.click("xfer")).not.toThrow();
    expect(() => { w.click("erase"); w.click("erase-yes"); }).not.toThrow();
    await Bun.sleep(30);
    expect(w.calls).toHaveLength(0);
    expect(w.c.accounts.get().token).toBe("u1.s");
    w.cleanup();
  });
  test("?contribApi= is still used when it is given", async () => {
    const seq = [];
    const w = await world({
      search: "?contribApi=https://api.example.com",
      fetch: async (url) => {
        seq.push(String(url));
        return url.endsWith("/contributors") ? json({ contributorId: "u", token: "u.s" }, 201) : json({ id: "s", status: "new" }, 201);
      },
    });
    expect(w.c.target).toMatchObject({ base: "https://api.example.com", custom: true, host: "api.example.com" });
    form(w); w.reg('[data-sub="done"]', w.el("div"));
    w.c.open();
    expect(w.root().innerHTML).toContain("テスト用の送信先：api.example.com");
    expect(w.root().innerHTML).not.toContain("報告の受付は準備中です");
    w.submit(); await w.done();
    expect(seq[0]).toBe("https://api.example.com/api/contrib/v1/contributors");
    expect(seq.some((u) => u.startsWith("/"))).toBe(false);
    expect(w.c.state.sub).toBe("done");
    w.cleanup();
  });
  test("GET /health is not called when nothing is configured", async () => {
    const w = await world({ api: "", config: true, fetch: async () => { throw new Error("should not fetch"); } });
    w.c.open(); await Bun.sleep(20);
    expect(w.calls).toHaveLength(0);
    expect(w.c.isOpen).toBe(true);
    w.cleanup();
  });
});

describe("the sources: what ui/contrib.js promises", () => {
  const src = read("src/anime/ui/contrib.js");
  test("a modal dialog's duties are all there", () => {
    for (const s of ["win.addEventListener('keydown', onKey, true)", "ctx.pad?.suppress?.('contrib', on)", "doc.exitPointerLock", "setAttribute('inert', '')", "classList.toggle('klc-contrib-open', on)", "e.key === 'Escape'", "e.key === 'Tab'", "e.stopImmediatePropagation()", "visualViewport", "doc.querySelector('[data-act=\"report\"]')"]) expect([s, src.includes(s)]).toEqual([s, true]);
  });
  test("the screenshot is taken before the DOM is built (it must be a synchronous part of the click)", () => {
    expect(src.indexOf("startCapture();")).toBeLessThan(src.indexOf("root.innerHTML = shellHtml(model(), t)"));   // (the first call is the one in open(); startCapture() is what draws and reads the frame)
    expect(src.indexOf("S.shotP = captureView(ctx, { doc, win })")).toBeGreaterThan(src.indexOf("function startCapture()")); expect(src.match(/captureView\(ctx, \{ doc, win \}\)/g)).toHaveLength(1);   // one place takes the screenshot
  });
  test("no Math.random, no eval, no innerHTML with unescaped user text in the controller", () => {
    expect(src).not.toMatch(/Math\.random|eval\(|new Function/);
    for (const m of src.matchAll(/innerHTML = `([^`]*)`/g)) expect(m[1]).not.toMatch(/\$\{(?!esc\()/);
  });
});
