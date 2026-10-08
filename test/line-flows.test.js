// Every conversation path. The machine does no I/O.
import { describe, expect, test } from "bun:test";
import { step, freshSession, SESSION_TTL_MS, normalizeText } from "../server/line/flows.js";
import { CONSENT_JA, FOLLOW_EN, FOLLOW_JA } from "../server/line/strings.js";

const T = 1_700_000_000_000;
const user = { type: "user", userId: "U" + "a".repeat(32) };

function ev(over, dt = 0) {
  return { timestamp: T + dt, source: user, ...over };
}

function run(events, session = freshSession()) {
  const replies = [];
  const actions = [];
  let current = session;
  events.forEach((event, i) => {
    const out = step(current, { ...event, timestamp: event.timestamp ?? T + i });
    current = out.session;
    for (const m of out.replies) replies.push(m);
    actions.push(...out.actions);
  });
  return { session: current, replies, actions };
}

function texts(replies) {
  return replies.map((m) => m.text).join("\n");
}

describe("flows", () => {
  test("follow uses the spec text, and English mode uses the English welcome", () => {
    const ja = step(null, ev({ type: "follow" }));
    expect(ja.replies[0].text).toBe(FOLLOW_JA);
    expect(ja.session.flow).toBe(null);
    const en = step({ ...freshSession(), lang: "en" }, ev({ type: "follow" }));
    expect(en.replies[0].text).toBe(FOLLOW_EN);
  });

  test("collecting says what arrived instead of asking again, and keeps 送り終わった", () => {
    const start = [
      ev({ type: "postback", postback: { data: "flow=bug" } }),
      ev({ type: "postback", postback: { data: "bug.device=phone" } }, 1),
      ev({ type: "postback", postback: { data: "bug.mode=walk" } }, 2),
    ];
    const afterText = run([...start, ev({ type: "message", message: { type: "text", text: "地面にめり込みます" } }, 3)]);
    const t = afterText.replies.at(-1);
    expect(t.text).toContain("受け取りました（文字9字）");
    expect(t.text).not.toContain("何が起きたか教えてください");
    expect(JSON.stringify(t.quickReply)).toContain("送り終わった");
    const afterShot = run([ev({ type: "message", message: { type: "image", id: "shot1" } }, 4)], afterText.session);
    expect(afterShot.replies.at(-1).text).toContain("受け取りました（文字9字・写真1枚）");
    const en = run([...start.slice(0, 1), ev({ type: "message", message: { type: "text", text: "English" } }, 1)]);
    const enOut = run([
      ev({ type: "postback", postback: { data: "flow=bug" } }, 2),
      ev({ type: "postback", postback: { data: "bug.device=pc" } }, 3),
      ev({ type: "postback", postback: { data: "bug.mode=fly" } }, 4),
      ev({ type: "message", message: { type: "image", id: "s" } }, 5),
    ], en.session);
    expect(enOut.replies.at(-1).text).toBe("Got it (1 photo). Send more if you like, then tap “Done”.");
  });

  test("bug: device, mode, text, screenshot, confirm, ack", () => {
    const out = run([
      ev({ type: "postback", postback: { data: "flow=bug" } }),
      ev({ type: "postback", postback: { data: "bug.device=phone" } }, 1),
      ev({ type: "postback", postback: { data: "bug.mode=walk" } }, 2),
      ev({ type: "message", message: { type: "text", text: "地面にめり込みます" } }, 3),
      ev({ type: "message", message: { type: "image", id: "shot1" } }, 4),
      ev({ type: "postback", postback: { data: "action=done" } }, 5),
      ev({ type: "postback", postback: { data: "action=send" } }, 6),
    ]);
    expect(out.replies[0].text).toContain("どれで遊んでいましたか？");
    expect(out.replies[0].text).toContain("What were you playing on?");
    expect(out.replies[0].quickReply.items.map((i) => i.action.data)).toEqual(["bug.device=phone", "bug.device=tablet", "bug.device=pc"]);
    expect(out.replies[1].quickReply.items).toHaveLength(9);
    expect(texts(out.replies)).toContain("何が起きたか教えてください。スクリーンショットもあると助かります。");
    expect(texts(out.replies)).toContain("この内容で送りますか？");
    expect(texts(out.replies)).toContain("バグ・スマホ・歩く");
    expect(texts(out.replies)).toContain("写真1枚、文字9字");
    const commit = out.actions.find((a) => a.type === "commit");
    expect(commit.draft).toMatchObject({ kind: "bug", device: "phone", mode: "walk", photoConsent: 0, text: "地面にめり込みます" });
    expect(commit.draft.media).toEqual([{ messageId: "shot1" }]);
    const ack = step(out.session, ev({ type: "committed", code: "KM-0042", kind: "bug" }, 7));
    expect(ack.replies[0].text).toBe([
      "ありがとうございます！ 受付番号は KM-0042 です。",
      "直ったら、お知らせすることがあります。",
      "Thank you! Your receipt number is KM-0042.",
      "We may tell you when it is fixed.",
    ].join("\n"));
    expect(ack.session.flow).toBe(null);
  });

  test("bug can be cancelled, and a typed device label is accepted", () => {
    const cancelled = run([
      ev({ type: "postback", postback: { data: "flow=bug" } }),
      ev({ type: "message", message: { type: "text", text: "やめる" } }, 1),
    ]);
    expect(texts(cancelled.replies)).toContain("やめました。下のメニューから、また選べます。");
    expect(cancelled.session.flow).toBe(null);
    const typed = run([
      ev({ type: "postback", postback: { data: "flow=bug" } }),
      ev({ type: "message", message: { type: "text", text: "パソコン" } }, 1),
    ]);
    expect(typed.session.draft.device).toBe("pc");
    expect(typed.session.step).toBe("mode");
  });

  test("fix with a location, and fix by typing a place name", () => {
    const loc = run([
      ev({ type: "postback", postback: { data: "flow=fix" } }),
      ev({ type: "message", message: { type: "location", latitude: 38.9, longitude: 141.57, address: "secret street" } }, 1),
      ev({ type: "postback", postback: { data: "fix.what=road" } }, 2),
      ev({ type: "message", message: { type: "text", text: "橋がずれています" } }, 3),
      ev({ type: "postback", postback: { data: "action=done" } }, 4),
    ]);
    expect(loc.replies[0].text).toContain("場所を教えてください。");
    expect(loc.replies[0].quickReply.items.map((i) => i.action.label)).toEqual(["位置情報を送る", "名前で書く"]);
    expect(loc.session.draft.lat).toBe(38.9);
    expect(loc.session.draft.placeName).toBe(null);
    expect(JSON.stringify(loc.session)).not.toContain("secret street");
    expect(texts(loc.replies)).toContain("何がちがいますか？");
    expect(texts(loc.replies)).toContain("くわしく教えてください。写真もOKです（人の顔はうつさないでね）。");
    expect(texts(loc.replies)).toContain("町の間違い・道・橋・位置情報");
    const named = run([
      ev({ type: "postback", postback: { data: "flow=fix" } }),
      ev({ type: "postback", postback: { data: "fix.place=name" } }, 1),
      ev({ type: "message", message: { type: "text", text: "魚市場" } }, 2),
      ev({ type: "message", message: { type: "text", text: "名前" } }, 3),
    ]);
    expect(named.replies[1].text).toContain("場所の名前を書いてください。");
    expect(named.session.draft.placeName).toBe("魚市場");
    expect(named.session.draft.fixWhat).toBe("name");
    expect(named.session.step).toBe("detail");
  });

  test("photo consent comes first and blocks a photo until yes", () => {
    const blocked = run([
      ev({ type: "postback", postback: { data: "flow=photo" } }),
      ev({ type: "message", message: { type: "image", id: "early" } }, 1),
    ]);
    expect(blocked.replies[0].text).toContain(CONSENT_JA);
    expect(blocked.replies[0].text).toContain("Before you send a photo, please check three things.");
    expect(blocked.session.step).toBe("consent");
    expect(blocked.session.draft.media).toEqual([]);
    const yes = run([
      ev({ type: "postback", postback: { data: "flow=photo" } }),
      ev({ type: "postback", postback: { data: "consent=yes" } }, 1),
      ev({ type: "message", message: { type: "image", id: "p1" } }, 2),
      ev({ type: "message", message: { type: "location", latitude: 38.9, longitude: 141.5 } }, 3),
      ev({ type: "postback", postback: { data: "action=done" } }, 4),
      ev({ type: "postback", postback: { data: "action=send" } }, 5),
    ]);
    expect(yes.replies[1].text).toContain("写真を送ってください（10枚まで）。場所もわかると助かります。");
    expect(yes.replies[1].quickReply.items.map((i) => i.action.type || i.action.label)).toContain("camera");
    const commit = yes.actions.find((a) => a.type === "commit");
    expect(commit.draft.photoConsent).toBe(1);
    expect(commit.draft.kind).toBe("photo");
    expect(commit.draft.media).toHaveLength(1);
    expect(commit.draft.lat).toBe(38.9);
    const ack = step(yes.session, ev({ type: "committed", code: "KM-0003", kind: "photo" }, 6));
    expect(ack.replies[0].text).toContain("ありがとうございます！ 受付番号は KM-0003 です。");
    expect(ack.replies[0].text).not.toContain("直ったら、お知らせすることがあります。");
  });

  test("the eleventh photo is refused", () => {
    const events = [
      ev({ type: "postback", postback: { data: "flow=photo" } }),
      ev({ type: "postback", postback: { data: "consent=yes" } }, 1),
    ];
    for (let i = 0; i < 11; i++) events.push(ev({ type: "message", message: { type: "image", id: `p${i}` } }, 2 + i));
    const out = run(events);
    expect(out.session.draft.media).toHaveLength(10);
    expect(texts(out.replies)).toContain("写真は10枚までです。");
  });

  test("idea goes from one text to confirm", () => {
    const out = run([
      ev({ type: "postback", postback: { data: "flow=idea" } }),
      ev({ type: "message", message: { type: "text", text: "夜の港を歩くコースがほしいです。" } }, 1),
      ev({ type: "message", message: { type: "text", text: "送る" } }, 2),
    ]);
    expect(out.replies[0].text).toContain("アイデアやほしい機能を、自由に書いてください。");
    expect(out.actions[0].draft.kind).toBe("idea");
    expect(out.actions[0].draft.text).toBe("夜の港を歩くコースがほしいです。");
  });

  test("free text is filed as the chosen kind and confirms", () => {
    const out = run([
      ev({ type: "message", message: { type: "text", text: "朝の市場の看板が読みにくいです。" } }),
      ev({ type: "postback", postback: { data: "free.kind=other" } }, 1),
    ]);
    expect(out.replies[0].text).toContain("メッセージありがとうございます。どれに近いですか？");
    expect(out.replies[0].quickReply.items.map((i) => i.action.label)).toEqual(["バグ", "町の間違い", "アイデア", "そのほか"]);
    expect(out.session.step).toBe("confirm");
    expect(out.session.draft.kind).toBe("other");
    expect(texts(out.replies)).toContain("そのほか");
  });

  test("commands: help, status, delete, English, 日本語, full-width", () => {
    const help = step(null, ev({ type: "message", message: { type: "text", text: "ヘルプ" } }));
    expect(help.replies[0].text).toContain("ケセンメメントの使い方です。");
    expect(step(null, ev({ type: "message", message: { type: "text", text: "help" } })).replies[0].text).toContain("How to use KesenMemento.");
    const status = step(null, ev({ type: "message", message: { type: "text", text: "状況　ＫＭ－００４２" } }));
    expect(status.actions).toEqual([{ type: "status", code: "KM-0042" }]);
    const looked = step(status.session, ev({ type: "status_result", found: true, code: "KM-0042", status: "new" }, 1));
    expect(looked.replies[0].text).toContain("受付番号 KM-0042 の状況は「新しい」です。");
    const missing = step(status.session, ev({ type: "status_result", found: false, code: "KM-9999", status: null }, 1));
    expect(missing.replies[0].text).toContain("その受付番号は見当たりません。");
    const ask = step(null, ev({ type: "message", message: { type: "text", text: "削除" } }));
    expect(ask.replies[0].text).toContain("送ったデータをすべて消しますか？");
    expect(ask.replies[0].quickReply.items.map((i) => i.action.label)).toEqual(["消す", "やめる"]);
    const erase = step(ask.session, ev({ type: "postback", postback: { data: "action=erase" } }, 1));
    expect(erase.actions).toEqual([{ type: "erase" }]);
    const gone = step(erase.session, ev({ type: "erased", count: 3 }, 2));
    expect(gone.replies[0].text).toContain("消しました。3件のデータを削除しました。");
    expect(gone.session.flow).toBe(null);
    const en = step(null, ev({ type: "message", message: { type: "text", text: "Ｅｎｇｌｉｓｈ" } }));
    expect(en.session.lang).toBe("en");
    expect(en.replies[0].text).toBe("I'll reply in English.");
    const ja = step(en.session, ev({ type: "message", message: { type: "text", text: "日本語" } }, 1));
    expect(ja.session.lang).toBe("ja");
    expect(ja.replies[0].text).toContain("日本語でお返事します。");
    expect(normalizeText("ｈｅｌｐ")).toBe("help");
  });

  test("stickers, video, audio and files are declined", () => {
    for (const type of ["sticker", "video", "audio", "file"]) {
      const out = step(null, ev({ type: "message", message: { type } }));
      expect(out.replies[0].text).toContain("ごめんなさい、文字・写真・位置情報だけ受け取れます。");
      expect(out.actions).toEqual([]);
    }
  });

  test("groups and rooms are left", () => {
    const group = step(null, ev({ type: "message", source: { type: "group", groupId: "Cabc" }, message: { type: "text", text: "hi" } }));
    expect(group.replies[0].text).toContain("このLINEは1対1のトークだけで使えます。このトークからは退出します。");
    expect(group.actions[0]).toMatchObject({ type: "leave", sourceType: "group", sourceId: "Cabc" });
    const room = step(null, ev({ type: "join", source: { type: "room", roomId: "R1" } }));
    expect(room.actions[0]).toMatchObject({ type: "leave", sourceType: "room", sourceId: "R1" });
  });

  test("a quiet flow is dropped after 30 minutes", () => {
    const started = step(null, ev({ type: "postback", postback: { data: "flow=bug" } }));
    const kept = step(started.session, ev({ type: "message", message: { type: "text", text: "スマホ" } }, SESSION_TTL_MS - 1));
    expect(kept.session.flow).toBe("bug");
    expect(kept.session.draft.device).toBe("phone");
    const dropped = step(started.session, ev({ type: "message", message: { type: "text", text: "まだいますか" } }, SESSION_TTL_MS));
    expect(dropped.session.flow).toBe("free");
    expect(dropped.session.draft.device).toBe(null);
  });

  test("an empty collection does not confirm, and the daily refusal keeps the draft", () => {
    const empty = run([
      ev({ type: "postback", postback: { data: "flow=bug" } }),
      ev({ type: "postback", postback: { data: "bug.device=phone" } }, 1),
      ev({ type: "postback", postback: { data: "bug.mode=walk" } }, 2),
      ev({ type: "postback", postback: { data: "action=done" } }, 3),
    ]);
    expect(empty.session.step).toBe("detail");
    expect(texts(empty.replies)).toContain("まだ届いていません。");
    expect(empty.actions).toEqual([]);
    const refused = step(empty.session, ev({ type: "commit_refused" }, 4));
    expect(refused.replies[0].text).toContain("たくさん届いています。少し時間をおいて、もう一度送ってください。");
    expect(refused.session.flow).toBe("bug");
  });

  test("starting another flow drops the draft, and unfollow clears the session", () => {
    const bug = step(null, ev({ type: "postback", postback: { data: "flow=bug" } }));
    const idea = step(bug.session, ev({ type: "postback", postback: { data: "flow=idea" } }, 1));
    expect(idea.session.flow).toBe("idea");
    expect(idea.session.draft.device).toBe(null);
    const gone = step(idea.session, ev({ type: "unfollow" }, 2));
    expect(gone.session.flow).toBe(null);
    expect(gone.replies).toEqual([]);
    expect(gone.session.lang).toBe("ja");
  });

  test("English mode rewrites the current step", () => {
    const bug = step(null, ev({ type: "postback", postback: { data: "flow=bug" } }));
    const en = step(bug.session, ev({ type: "message", message: { type: "text", text: "English" } }, 1));
    expect(en.replies.at(-1).quickReply.items[0].action.label).toBe("Phone");
    expect(en.replies.at(-1).text).toContain("What were you playing on?");
    expect(en.replies.at(-1).text).not.toContain("どれで遊んでいましたか？");
  });

  test("a location outside a flow starts a map fix", () => {
    const out = step(null, ev({ type: "message", message: { type: "location", latitude: 38.9, longitude: 141.5 } }));
    expect(out.session.flow).toBe("fix");
    expect(out.session.step).toBe("what");
    expect(out.session.draft.lat).toBe(38.9);
  });

  test("けしき V07 starts a photo and keeps the view id off the caption", () => {
    const idle = step(null, ev({ type: "message", message: { type: "text", text: "けしき Ｖ０７" } }));
    expect(idle.session.flow).toBe("photo");
    expect(idle.session.step).toBe("consent");
    expect(idle.session.draft.viewId).toBe("V07");
    expect(idle.session.draft.texts).toEqual([]);
    const yes = step(idle.session, ev({ type: "message", message: { type: "text", text: "はい、だいじょうぶ" } }, 1));
    expect(yes.session.step).toBe("collect");
    expect(yes.session.draft.viewId).toBe("V07");
    const again = step(yes.session, ev({ type: "message", message: { type: "text", text: "けしき V08" } }, 2));
    expect(again.session.draft.viewId).toBe("V08");
    expect(again.session.draft.texts || []).toEqual([]);
    const post = step(freshSession(), ev({ type: "postback", postback: { data: "view=V03" } }));
    expect(post.session.flow).toBe("photo");
    expect(post.session.draft.viewId).toBe("V03");
  });

  test("an image outside a flow asks for consent and does not keep the image", () => {
    const out = step(null, ev({ type: "message", message: { type: "image", id: "x" } }));
    expect(out.session.flow).toBe("photo");
    expect(out.session.step).toBe("consent");
    expect(out.session.draft.media).toEqual([]);
  });
});
