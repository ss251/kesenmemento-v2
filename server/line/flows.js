// The conversation, as a pure state machine. No fetch, no disk, no clock of its own.
// step(session, event) → { session, replies, actions }
// event.timestamp (epoch ms) is the clock. A quiet flow is dropped after 30 minutes.

import {
  DEVICES, FIXES, FREE_KINDS, KIND_EN, KIND_JA, MODES,
  ackText, bilingual, cancelled, consent, deleteAsk, emptyYet, erasedText, follow, helpText,
  idle, langSwitched, leaveText, notFound, photoCap, prompt, rateText, received, statusText, textCap, unsupported,
} from "./strings.js";

export const SESSION_TTL_MS = 30 * 60 * 1000;
export const MAX_PHOTOS = 10;
export const MAX_TEXT = 4000;

export function freshSession() {
  return { lang: "ja", flow: null, step: null, draft: null, updatedAt: 0 };
}

/** NFKC, ideographic spaces, and collapsed whitespace. Full-width Latin and digits fold here. */
export function normalizeText(s) {
  return String(s ?? "").normalize("NFKC").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

function cloneSession(input) {
  const s = input && typeof input === "object" ? input : freshSession();
  return {
    lang: s.lang === "en" ? "en" : "ja",
    flow: s.flow || null,
    step: s.step || null,
    draft: s.draft ? structuredClone(s.draft) : null,
    updatedAt: Number(s.updatedAt) || 0,
  };
}

function emptyDraft(kind) {
  return {
    kind, device: null, mode: null, fixWhat: null, placeName: null,
    lat: null, lon: null, texts: [], media: [], photoConsent: 0,
  };
}

function joined(draft) {
  return (draft?.texts || []).join("\n").slice(0, MAX_TEXT);
}

function appendText(draft, raw) {
  const t = String(raw ?? "").replace(/\u0000/g, "").trim();
  if (!t) return { added: false, truncated: false };
  const next = joined(draft) ? `${joined(draft)}\n${t}` : t;
  const truncated = next.length > MAX_TEXT;
  const cut = next.slice(0, MAX_TEXT);
  draft.texts = cut ? [cut] : [];
  return { added: true, truncated };
}

function msg(text, items) {
  const m = { type: "text", text };
  if (items?.length) m.quickReply = { items: items.slice(0, 13) };
  return m;
}

function postback(lang, data, ja, en) {
  const label = lang === "en" ? en : ja;
  return { type: "action", action: { type: "postback", label, data, displayText: label } };
}

function tap(lang, type, ja, en) {
  const label = lang === "en" ? en : ja;
  return { type: "action", action: { type, label } };
}

function choiceItems(lang, list, dataKey) {
  return list.map((item) => postback(lang, `${dataKey}=${item.id}`, item.ja, item.en));
}

function matchChoice(value, list) {
  const v = normalizeText(value);
  return list.find((item) => item.id === value || item.ja === v || item.en.toLowerCase() === v.toLowerCase()) || null;
}

function labelOf(list, id, lang) {
  const item = list.find((x) => x.id === id);
  if (!item) return id;
  return lang === "en" ? item.en : item.ja;
}

function done(session, now, replies, actions = []) {
  return { session: { ...session, updatedAt: now }, replies, actions };
}

function expire(session, now) {
  if (!session.flow || !session.updatedAt) return session;
  if (now < session.updatedAt) return session;
  if (now - session.updatedAt >= SESSION_TTL_MS) {
    return { ...session, flow: null, step: null, draft: null };
  }
  return session;
}

function promptFor(session) {
  const lang = session.lang;
  const { flow, step } = session;
  if (flow === "bug" && step === "device") return msg(prompt(lang, "device"), choiceItems(lang, DEVICES, "bug.device"));
  if (flow === "bug" && step === "mode") return msg(prompt(lang, "mode"), choiceItems(lang, MODES, "bug.mode"));
  if (flow === "bug" && step === "detail") {
    return msg(prompt(lang, "bugDetail"), [
      tap(lang, "cameraRoll", "写真を選ぶ", "Choose a photo"),
      postback(lang, "action=done", "送り終わった", "Done"),
    ]);
  }
  if (flow === "fix" && step === "place") {
    return msg(prompt(lang, "place"), [
      tap(lang, "location", "位置情報を送る", "Send location"),
      postback(lang, "fix.place=name", "名前で書く", "Type a name"),
    ]);
  }
  if (flow === "fix" && step === "place_name") return msg(prompt(lang, "placeName"));
  if (flow === "fix" && step === "what") return msg(prompt(lang, "fixWhat"), choiceItems(lang, FIXES, "fix.what"));
  if (flow === "fix" && step === "detail") {
    return msg(prompt(lang, "fixDetail"), [
      tap(lang, "cameraRoll", "写真を選ぶ", "Choose a photo"),
      postback(lang, "action=done", "送り終わった", "Done"),
    ]);
  }
  if (flow === "photo" && step === "consent") {
    return msg(consent(lang), [
      postback(lang, "consent=yes", "はい、だいじょうぶ", "Yes, that's fine"),
      postback(lang, "action=cancel", "やめる", "Cancel"),
    ]);
  }
  if (flow === "photo" && step === "collect") {
    return msg(prompt(lang, "photoCollect"), [
      tap(lang, "cameraRoll", "写真を選ぶ", "Choose a photo"),
      tap(lang, "camera", "カメラ", "Camera"),
      tap(lang, "location", "位置情報", "Location"),
      postback(lang, "action=done", "送り終わった", "Done"),
    ]);
  }
  if (flow === "idea" && step === "text") return msg(prompt(lang, "idea"));
  if (flow === "free" && step === "kind") return msg(prompt(lang, "free"), choiceItems(lang, FREE_KINDS, "free.kind"));
  if (flow === "delete" && step === "confirm") {
    return msg(deleteAsk(lang), [
      postback(lang, "action=erase", "消す", "Delete"),
      postback(lang, "action=cancel", "やめる", "Cancel"),
    ]);
  }
  if (step === "confirm") return msg(confirmBody(session), confirmItems(lang));
  return msg(idle(lang));
}

function confirmItems(lang) {
  return [
    postback(lang, "action=send", "送る", "Send"),
    postback(lang, "action=cancel", "やめる", "Cancel"),
  ];
}

function summaryPair(draft, lang) {
  const kind = lang === "en" ? (KIND_EN[draft.kind] || draft.kind) : (KIND_JA[draft.kind] || draft.kind);
  const bits = [kind];
  if (draft.device) bits.push(labelOf(DEVICES, draft.device, lang));
  if (draft.mode) bits.push(labelOf(MODES, draft.mode, lang));
  if (draft.fixWhat) bits.push(labelOf(FIXES, draft.fixWhat, lang));
  if (draft.placeName) bits.push(String(draft.placeName).replace(/\s+/g, " ").slice(0, 40));
  else if (draft.lat != null && draft.lon != null) bits.push(lang === "en" ? "a location" : "位置情報");
  const photos = (draft.media || []).length;
  const chars = joined(draft).length;
  const line2 = lang === "en"
    ? `${photos === 1 ? "1 photo" : `${photos} photos`}, ${chars === 1 ? "1 character" : `${chars} characters`}`
    : `写真${photos}枚、文字${chars}字`;
  return [bits.join(lang === "en" ? " · " : "・"), line2];
}

function confirmBody(session) {
  const ja = summaryPair(session.draft, "ja");
  const en = summaryPair(session.draft, "en");
  if (session.lang === "en") return ["Send this?", en[0], en[1]].join("\n");
  return ["この内容で送りますか？", ja[0], ja[1], "Send this?", en[0], en[1]].join("\n");
}

function reask(session, now, extra = []) {
  return done(session, now, [...extra, promptFor(session)]);
}

/** While collecting (a bug's or a fix's detail, the photo flow): say what arrived, keep the step's quick replies. */
function got(session, now, extra = []) {
  const p = promptFor(session);
  const d = session.draft;
  return done(session, now, [...extra, { ...p, text: received(session.lang, joined(d).length, d.media.length) }]);
}

function contentOk(session) {
  const d = session.draft;
  const text = joined(d);
  const photos = d.media.length;
  if (d.kind === "photo") return photos > 0;
  if (d.kind === "idea") return text.length > 0;
  return text.length > 0 || photos > 0;
}

function toConfirm(session, now, extra = []) {
  if (!contentOk(session)) return reask(session, now, [msg(emptyYet(session.lang)), ...extra]);
  session.step = "confirm";
  return done(session, now, [...extra, promptFor(session)]);
}

function commitAction(session) {
  const d = session.draft;
  return {
    type: "commit",
    draft: {
      kind: d.kind,
      device: d.device,
      mode: d.mode,
      fixWhat: d.fixWhat,
      placeName: d.placeName ? String(d.placeName).slice(0, 200) : null,
      lat: d.lat,
      lon: d.lon,
      text: joined(d),
      lang: session.lang,
      photoConsent: d.photoConsent ? 1 : 0,
      media: (d.media || []).map((m) => ({ ...m })),
    },
  };
}

function cancel(session, now) {
  if (!session.flow) return done(session, now, [msg(idle(session.lang))]);
  const lang = session.lang;
  return done({ lang, flow: null, step: null, draft: null, updatedAt: now }, now, [msg(cancelled(lang))]);
}

function setLang(session, lang, now) {
  session.lang = lang;
  const note = msg(langSwitched(lang));
  if (!session.flow) return done(session, now, [note]);
  return done(session, now, [note, promptFor(session)]);
}

function showHelp(session, now) {
  const note = msg(helpText(session.lang));
  if (!session.flow) return done(session, now, [note]);
  return done(session, now, [note, promptFor(session)]);
}

function askDelete(session, now) {
  session.flow = "delete";
  session.step = "confirm";
  session.draft = null;
  return done(session, now, [promptFor(session)]);
}

function command(session, text, now) {
  const n = normalizeText(text);
  if (n === "English") return setLang(session, "en", now);
  if (n === "日本語") return setLang(session, "ja", now);
  if (n === "使い方" || n === "ヘルプ" || n === "help") return showHelp(session, now);
  if (n === "削除") return askDelete(session, now);
  if (n === "やめる") return cancel(session, now);
  const st = /^状況\s+(KM-\d+)$/i.exec(n);
  if (st) return done(session, now, [], [{ type: "status", code: st[1].toUpperCase() }]);
  return null;
}

function startBug(session, now) {
  session.flow = "bug";
  session.step = "device";
  session.draft = emptyDraft("bug");
  return done(session, now, [promptFor(session)]);
}

function startFix(session, now) {
  session.flow = "fix";
  session.step = "place";
  session.draft = emptyDraft("fix");
  return done(session, now, [promptFor(session)]);
}

function startPhoto(session, now) {
  session.flow = "photo";
  session.step = "consent";
  session.draft = emptyDraft("photo");
  return done(session, now, [promptFor(session)]);
}

function startIdea(session, now) {
  session.flow = "idea";
  session.step = "text";
  session.draft = emptyDraft("idea");
  return done(session, now, [promptFor(session)]);
}

function startFree(session, text, now) {
  session.flow = "free";
  session.step = "kind";
  session.draft = emptyDraft("other");
  const extra = [];
  const res = appendText(session.draft, text);
  if (res.truncated) extra.push(msg(textCap(session.lang)));
  return reask(session, now, extra);
}

function parseData(data) {
  const s = String(data ?? "");
  const i = s.indexOf("=");
  if (i < 0) return { key: s, value: "" };
  return { key: s.slice(0, i), value: s.slice(i + 1) };
}

function takeLocation(draft, message) {
  const lat = Number(message?.latitude);
  const lon = Number(message?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  draft.lat = lat;
  draft.lon = lon;
  return true;
}

function addImage(session, message, now) {
  const id = String(message?.id || "");
  if (!id) return reask(session, now);
  if (session.draft.media.length >= MAX_PHOTOS) {
    return reask(session, now, [msg(photoCap(session.lang))]);
  }
  session.draft.media.push({ messageId: id });
  if (session.step === "confirm") return done(session, now, [promptFor(session)]);
  if (session.step === "detail" || session.step === "collect") return got(session, now);
  return reask(session, now);
}

function onPostback(session, data, now) {
  const { key, value } = parseData(data);
  if (key === "flow" && value === "bug") return startBug(session, now);
  if (key === "flow" && value === "fix") return startFix(session, now);
  if (key === "flow" && value === "photo") return startPhoto(session, now);
  if (key === "flow" && value === "idea") return startIdea(session, now);
  if (key === "flow" && value === "help") return showHelp(session, now);
  if (key === "action" && value === "cancel") return cancel(session, now);
  if (key === "action" && value === "erase" && session.flow === "delete") {
    return done(session, now, [], [{ type: "erase" }]);
  }
  if (key === "action" && value === "send" && session.step === "confirm") {
    if (!contentOk(session)) return reask(session, now, [msg(emptyYet(session.lang))]);
    return done(session, now, [], [commitAction(session)]);
  }
  if (key === "action" && value === "done") return toConfirm(session, now);
  if (key === "bug.device" && session.flow === "bug" && session.step === "device") {
    const item = matchChoice(value, DEVICES);
    if (!item) return reask(session, now);
    session.draft.device = item.id;
    session.step = "mode";
    return done(session, now, [promptFor(session)]);
  }
  if (key === "bug.mode" && session.flow === "bug" && session.step === "mode") {
    const item = matchChoice(value, MODES);
    if (!item) return reask(session, now);
    session.draft.mode = item.id;
    session.step = "detail";
    return done(session, now, [promptFor(session)]);
  }
  if (key === "fix.place" && value === "name" && session.flow === "fix" && (session.step === "place" || session.step === "place_name")) {
    session.step = "place_name";
    return done(session, now, [promptFor(session)]);
  }
  if (key === "fix.what" && session.flow === "fix" && session.step === "what") {
    const item = matchChoice(value, FIXES);
    if (!item) return reask(session, now);
    session.draft.fixWhat = item.id;
    session.step = "detail";
    return done(session, now, [promptFor(session)]);
  }
  if (key === "consent" && value === "yes" && session.flow === "photo" && session.step === "consent") {
    session.draft.photoConsent = 1;
    session.step = "collect";
    return done(session, now, [promptFor(session)]);
  }
  if (key === "free.kind" && session.flow === "free" && session.step === "kind") {
    const item = matchChoice(value, FREE_KINDS);
    if (!item) return reask(session, now);
    session.draft.kind = item.id;
    return toConfirm(session, now);
  }
  if (session.flow) return reask(session, now);
  return done(session, now, [msg(idle(session.lang))]);
}

function onText(session, text, now) {
  const cmd = command(session, text, now);
  if (cmd) return cmd;
  const n = normalizeText(text);
  if (!session.flow) return startFree(session, text, now);
  if (session.flow === "delete") {
    if (n === "消す" || n.toLowerCase() === "delete") return done(session, now, [], [{ type: "erase" }]);
    return reask(session, now);
  }
  if (session.step === "confirm") {
    if (n === "送る" || n.toLowerCase() === "send") {
      if (!contentOk(session)) return reask(session, now, [msg(emptyYet(session.lang))]);
      return done(session, now, [], [commitAction(session)]);
    }
    const extra = [];
    if (appendText(session.draft, text).truncated) extra.push(msg(textCap(session.lang)));
    return reask(session, now, extra);
  }
  if (session.flow === "bug" && session.step === "device") {
    const item = matchChoice(n, DEVICES);
    if (!item) return reask(session, now);
    session.draft.device = item.id;
    session.step = "mode";
    return done(session, now, [promptFor(session)]);
  }
  if (session.flow === "bug" && session.step === "mode") {
    const item = matchChoice(n, MODES);
    if (!item) return reask(session, now);
    session.draft.mode = item.id;
    session.step = "detail";
    return done(session, now, [promptFor(session)]);
  }
  if (session.flow === "bug" && session.step === "detail") {
    if (n === "送り終わった" || n.toLowerCase() === "done") return toConfirm(session, now);
    const extra = [];
    if (appendText(session.draft, text).truncated) extra.push(msg(textCap(session.lang)));
    return got(session, now, extra);
  }
  if (session.flow === "fix" && session.step === "place") {
    session.draft.placeName = n.slice(0, 200);
    session.step = "what";
    return done(session, now, [promptFor(session)]);
  }
  if (session.flow === "fix" && session.step === "place_name") {
    if (!n) return reask(session, now);
    session.draft.placeName = n.slice(0, 200);
    session.step = "what";
    return done(session, now, [promptFor(session)]);
  }
  if (session.flow === "fix" && session.step === "what") {
    const item = matchChoice(n, FIXES);
    if (!item) return reask(session, now);
    session.draft.fixWhat = item.id;
    session.step = "detail";
    return done(session, now, [promptFor(session)]);
  }
  if (session.flow === "fix" && session.step === "detail") {
    if (n === "送り終わった" || n.toLowerCase() === "done") return toConfirm(session, now);
    const extra = [];
    if (appendText(session.draft, text).truncated) extra.push(msg(textCap(session.lang)));
    return got(session, now, extra);
  }
  if (session.flow === "photo" && session.step === "consent") {
    if (n === "はい、だいじょうぶ" || n.toLowerCase() === "yes, that's fine" || n.toLowerCase() === "yes") {
      session.draft.photoConsent = 1;
      session.step = "collect";
      return done(session, now, [promptFor(session)]);
    }
    return reask(session, now);
  }
  if (session.flow === "photo" && session.step === "collect") {
    if (n === "送り終わった" || n.toLowerCase() === "done") return toConfirm(session, now);
    const extra = [];
    if (appendText(session.draft, text).truncated) extra.push(msg(textCap(session.lang)));
    return got(session, now, extra);
  }
  if (session.flow === "idea" && session.step === "text") {
    const extra = [];
    const res = appendText(session.draft, text);
    if (!res.added) return reask(session, now);
    if (res.truncated) extra.push(msg(textCap(session.lang)));
    return toConfirm(session, now, extra);
  }
  if (session.flow === "free" && session.step === "kind") {
    const item = matchChoice(n, FREE_KINDS);
    if (!item) {
      const extra = [];
      if (appendText(session.draft, text).truncated) extra.push(msg(textCap(session.lang)));
      return reask(session, now, extra);
    }
    session.draft.kind = item.id;
    return toConfirm(session, now);
  }
  return reask(session, now);
}

function onImage(session, message, now) {
  if (!session.flow) return startPhoto(session, now);
  if (session.flow === "photo" && session.step === "consent") return reask(session, now);
  if (session.flow === "delete") return reask(session, now);
  const collecting = session.step === "detail" || session.step === "collect" || session.step === "confirm" || (session.flow === "idea" && session.step === "text") || (session.flow === "free" && session.step === "kind");
  if (!collecting || !session.draft) return reask(session, now);
  return addImage(session, message, now);
}

function onLocation(session, message, now) {
  if (session.flow === "photo" && session.step === "consent") return reask(session, now);
  if (!session.flow) {
    startFix(session, now);
    if (!takeLocation(session.draft, message)) return reask(session, now);
    session.step = "what";
    return done(session, now, [promptFor(session)]);
  }
  if (!session.draft) return reask(session, now);
  if (session.flow === "delete") return reask(session, now);
  if (!takeLocation(session.draft, message)) return reask(session, now);
  if (session.flow === "fix" && (session.step === "place" || session.step === "place_name")) {
    session.step = "what";
    return done(session, now, [promptFor(session)]);
  }
  if (session.step === "confirm") return done(session, now, [promptFor(session)]);
  return reask(session, now);
}

function refuse(session, now) {
  const extra = [msg(unsupported(session.lang))];
  if (session.flow) return reask(session, now, extra);
  return done(session, now, extra);
}

function onSynthetic(session, event, now) {
  if (event.type === "committed") {
    const lang = session.lang;
    const kind = event.kind || session.draft?.kind;
    return done({ lang, flow: null, step: null, draft: null, updatedAt: now }, now, [msg(ackText(lang, event.code, kind))]);
  }
  if (event.type === "commit_refused") return done(session, now, [msg(rateText(session.lang))]);
  if (event.type === "erased") {
    const lang = session.lang;
    return done({ lang, flow: null, step: null, draft: null, updatedAt: now }, now, [msg(erasedText(lang, Number(event.count) || 0))]);
  }
  if (event.type === "status_result") {
    const text = event.found ? statusText(session.lang, event.code, event.status) : notFound(session.lang);
    return done(session, now, [msg(text)]);
  }
  return null;
}

/**
 * @param {object | null | undefined} inputSession
 * @param {object} event a LINE event, plus timestamp, or a synthetic result event
 * @returns {{ session: object, replies: object[], actions: object[] }}
 */
export function step(inputSession, event) {
  const now = Number(event?.timestamp);
  if (!Number.isFinite(now)) throw new Error("event.timestamp is required");
  let session = expire(cloneSession(inputSession), now);
  const synthetic = onSynthetic(session, event, now);
  if (synthetic) return synthetic;

  const source = event?.source || {};
  if (source.type === "group" || source.type === "room" || event?.type === "join" || event?.type === "memberJoined") {
    const sourceType = source.type === "room" ? "room" : "group";
    return {
      session,
      replies: [msg(leaveText(session.lang))],
      actions: [{ type: "leave", sourceType, sourceId: source.groupId || source.roomId || "" }],
    };
  }
  if (event?.type === "unfollow") {
    return done({ lang: session.lang, flow: null, step: null, draft: null, updatedAt: now }, now, []);
  }
  if (event?.type === "follow") {
    const lang = session.lang;
    return done({ lang, flow: null, step: null, draft: null, updatedAt: now }, now, [msg(follow(lang))]);
  }
  if (event?.type === "postback") return onPostback(session, event.postback?.data || "", now);
  if (event?.type === "message") {
    const message = event.message || {};
    if (message.type === "text") return onText(session, message.text || "", now);
    if (message.type === "image") return onImage(session, message, now);
    if (message.type === "location") return onLocation(session, message, now);
    if (message.type === "sticker" || message.type === "video" || message.type === "audio" || message.type === "file") {
      return refuse(session, now);
    }
    return refuse(session, now);
  }
  return done(session, now, []);
}

/** The prompt for the current step, after a download changes the draft. */
export function currentPrompt(session) {
  const s = cloneSession(session);
  if (!s.flow) return null;
  return promptFor(s);
}

/** The paths currently held in a draft, so the server can delete files the flow dropped. */
export function draftPaths(session) {
  const media = session?.draft?.media || [];
  return media.map((m) => m?.path).filter((p) => typeof p === "string" && p);
}
