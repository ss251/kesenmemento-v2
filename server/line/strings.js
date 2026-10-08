// Conversation copy. Japanese sentences from the spec are used word for word.
// An English line follows where it matters. Typing English switches the whole reply to English.

/** @typedef {"ja" | "en"} Lang */

export const FOLLOW_JA = [
  "ケセンメメントの公式LINEです。",
  "3Dの気仙沼で見つけた「おかしいところ」、町の写真、アイデアを送ってください。下のメニューから選べます。",
  "・名前や住所など、自分のことは書かないでください。",
  "・人の顔がうつった写真は使いません。",
  "This is KesenMemento. Send bugs, map fixes, photos and ideas from the menu below.",
].join("\n");

export const FOLLOW_EN = [
  "This is KesenMemento.",
  "Send what looks wrong in the 3D town, photos of the town, and ideas. Use the menu below.",
  "- Don't write your name, your address, or anything about yourself.",
  "- We don't use photos that show people's faces.",
].join("\n");

export const CONSENT_JA = [
  "写真を送る前に、三つ確認してください。",
  "① 自分で撮った写真ですか？",
  "② 人の顔や車のナンバーがうつっていませんか？",
  "③ お店の中は、お店の人にOKをもらいましたか？",
].join("\n");

export const CONSENT_EN = [
  "Before you send a photo, please check three things.",
  "1. Did you take this photo yourself?",
  "2. Are there any faces or car license plates in it?",
  "3. If it is inside a shop, did the shop say yes?",
].join("\n");

export const PROMPTS = Object.freeze({
  device: ["どれで遊んでいましたか？", "What were you playing on?"],
  mode: ["何をしていましたか？", "What were you doing?"],
  bugDetail: ["何が起きたか教えてください。スクリーンショットもあると助かります。", "Tell us what happened. A screenshot helps."],
  place: ["場所を教えてください。", "Where is it?"],
  placeName: ["場所の名前を書いてください。", "Please type the place name."],
  fixWhat: ["何がちがいますか？", "What is different?"],
  fixDetail: ["くわしく教えてください。写真もOKです（人の顔はうつさないでね）。", "Tell us more. A photo is fine (no faces)."],
  photoCollect: ["写真を送ってください（10枚まで）。場所もわかると助かります。", "Send photos (up to 10). A location helps too."],
  idea: ["アイデアやほしい機能を、自由に書いてください。", "Write your idea, or a feature you want."],
  free: ["メッセージありがとうございます。どれに近いですか？", "Thanks for the message. Which is closest?"],
});

export const KIND_JA = Object.freeze({
  bug: "バグ", fix: "町の間違い", photo: "写真", idea: "アイデア", other: "そのほか",
});
export const KIND_EN = Object.freeze({
  bug: "Bug", fix: "Map fix", photo: "Photo", idea: "Idea", other: "Something else",
});

export const STATUS_JA = Object.freeze({
  new: "新しい", seen: "確認しました", accepted: "受け付けました",
  fixed: "直りました", rejected: "見送りました", deleted: "削除しました",
});
export const STATUS_EN = Object.freeze({
  new: "new", seen: "seen", accepted: "accepted",
  fixed: "fixed", rejected: "not used", deleted: "deleted",
});

export const DEVICES = Object.freeze([
  { id: "phone", ja: "スマホ", en: "Phone" },
  { id: "tablet", ja: "タブレット", en: "Tablet" },
  { id: "pc", ja: "パソコン", en: "Computer" },
]);

export const MODES = Object.freeze([
  { id: "walk", ja: "歩く", en: "Walk" },
  { id: "fly", ja: "飛ぶ", en: "Fly" },
  { id: "car", ja: "車", en: "Car" },
  { id: "ship", ja: "船", en: "Boat" },
  { id: "sea", ja: "海の中", en: "Under the sea" },
  { id: "gull", ja: "ウミネコ", en: "Seagull" },
  { id: "fish", ja: "一本釣り", en: "Fishing" },
  { id: "race", ja: "レース", en: "Race" },
  { id: "other", ja: "その他", en: "Other" },
]);

export const FIXES = Object.freeze([
  { id: "missing", ja: "建物がない", en: "A building is missing" },
  { id: "extra", ja: "建物があるはず", en: "An extra building" },
  { id: "name", ja: "名前", en: "Name" },
  { id: "look", ja: "色・形", en: "Colour or shape" },
  { id: "road", ja: "道・橋", en: "Road or bridge" },
  { id: "other", ja: "その他", en: "Other" },
]);

export const FREE_KINDS = Object.freeze([
  { id: "bug", ja: "バグ", en: "Bug" },
  { id: "fix", ja: "町の間違い", en: "Map fix" },
  { id: "idea", ja: "アイデア", en: "Idea" },
  { id: "other", ja: "そのほか", en: "Something else" },
]);

/**
 * Japanese, then the English line. English mode is the English line only.
 * @param {Lang} lang
 * @param {string} ja
 * @param {string} en
 */
export function bilingual(lang, ja, en) {
  return lang === "en" ? en : `${ja}\n${en}`;
}

/** @param {Lang} lang */
export function follow(lang) {
  return lang === "en" ? FOLLOW_EN : FOLLOW_JA;
}

/** @param {Lang} lang */
export function consent(lang) {
  return bilingual(lang, CONSENT_JA, CONSENT_EN);
}

/** @param {Lang} lang @param {keyof typeof PROMPTS} key */
export function prompt(lang, key) {
  const pair = PROMPTS[key];
  return bilingual(lang, pair[0], pair[1]);
}

/** @param {Lang} lang @param {string} code @param {string} kind */
export function ackText(lang, code, kind) {
  const ja = [`ありがとうございます！ 受付番号は ${code} です。`];
  const en = [`Thank you! Your receipt number is ${code}.`];
  if (kind === "bug" || kind === "fix") {
    ja.push("直ったら、お知らせすることがあります。");
    en.push("We may tell you when it is fixed.");
  }
  return lang === "en" ? en.join("\n") : ja.concat(en).join("\n");
}

/** @param {Lang} lang @param {string} code */
export function fixedText(lang, code) {
  const ja = `受付番号 ${code} は直りました。ありがとうございました！`;
  const en = `Receipt ${code} is fixed. Thank you!`;
  return bilingual(lang, ja, en);
}

/** @param {Lang} lang */
export function unsupported(lang) {
  return bilingual(lang, "ごめんなさい、文字・写真・位置情報だけ受け取れます。", "Sorry, we can only receive text, photos and locations.");
}

/** @param {Lang} lang */
export function leaveText(lang) {
  return bilingual(lang, "このLINEは1対1のトークだけで使えます。このトークからは退出します。", "This account is for one-to-one chats only. It will leave this chat.");
}

/** @param {Lang} lang */
export function deleteAsk(lang) {
  return bilingual(lang, "送ったデータをすべて消しますか？", "Delete everything you sent?");
}

/** @param {Lang} lang @param {number} n */
export function erasedText(lang, n) {
  const ja = `消しました。${n}件のデータを削除しました。`;
  const en = n === 1 ? "Deleted. 1 report was removed." : `Deleted. ${n} reports were removed.`;
  return bilingual(lang, ja, en);
}

/** @param {Lang} lang @param {string} code @param {string} status */
export function statusText(lang, code, status) {
  const ja = `受付番号 ${code} の状況は「${STATUS_JA[status] || status}」です。`;
  const en = `Receipt ${code} is ${STATUS_EN[status] || status}.`;
  return bilingual(lang, ja, en);
}

/** @param {Lang} lang */
export function notFound(lang) {
  return bilingual(lang, "その受付番号は見当たりません。", "That receipt number was not found.");
}

/** @param {Lang} lang */
export function rateText(lang) {
  return bilingual(lang, "たくさん届いています。少し時間をおいて、もう一度送ってください。", "That's a lot at once. Please wait a little, then try again.");
}

/** @param {Lang} lang */
export function helpText(lang) {
  const ja = [
    "ケセンメメントの使い方です。",
    "下のメニューから選べます。",
    "・バグを知らせる",
    "・町の間違い",
    "・写真を送る",
    "・アイデア",
    "「やめる」で、途中でやめられます。",
    "名前や住所など、自分のことは書かないでください。",
    "人の顔がうつった写真は使いません。",
    "「状況 KM-0001」で、送った報告の状態を見られます。",
    "「削除」で、送ったデータを消せます。",
    "「English」で、英語に切り替えられます。",
  ].join("\n");
  const en = [
    "How to use KesenMemento.",
    "Choose from the menu: a bug, a map fix, a photo, or an idea.",
    "Type やめる to stop. Don't send your name or a photo of a face.",
    "Type 状況 KM-0001 to see a report you sent. Type 削除 to delete what you sent.",
    "Type 日本語 to switch back to Japanese.",
  ].join("\n");
  return bilingual(lang, ja, en);
}

/** @param {Lang} lang */
export function cancelled(lang) {
  return bilingual(lang, "やめました。下のメニューから、また選べます。", "Cancelled. You can choose again from the menu.");
}

/** @param {Lang} lang */
export function idle(lang) {
  return bilingual(lang, "今は途中ではありません。下のメニューから選べます。", "Nothing is in progress. Choose from the menu below.");
}

/** @param {Lang} lang */
export function emptyYet(lang) {
  return bilingual(lang, "まだ届いていません。", "Nothing has arrived yet.");
}

/**
 * The answer while a report is being collected: what has arrived so far, and how to finish. It replaces re-asking the question.
 * @param {Lang} lang @param {number} chars @param {number} photos
 */
export function received(lang, chars, photos) {
  const ja = [chars > 0 ? `文字${chars}字` : null, photos > 0 ? `写真${photos}枚` : null].filter(Boolean).join("・");
  const en = [chars > 0 ? `${chars} characters` : null, photos > 0 ? `${photos} photo${photos === 1 ? "" : "s"}` : null].filter(Boolean).join(", ");
  return bilingual(lang,
    `受け取りました（${ja}）。ほかにもあれば送ってください。終わったら「送り終わった」を押してね。`,
    `Got it (${en}). Send more if you like, then tap “Done”.`);
}

/** @param {Lang} lang */
export function photoCap(lang) {
  return bilingual(lang, "写真は10枚までです。", "You can send up to 10 photos.");
}

/** @param {Lang} lang */
export function textCap(lang) {
  return bilingual(lang, "文章は4,000字までです。", "Text can be up to 4,000 characters.");
}

/** @param {Lang} lang */
export function photoFail(lang) {
  return bilingual(lang, "写真を受け取れませんでした。もう一度送ってください。", "That photo did not come through. Please send it again.");
}

/** @param {Lang} lang */
export function tooBig(lang) {
  return bilingual(lang, "写真が大きすぎます。10MBまでにしてください。", "That photo is too big. Please send one up to 10 MB.");
}

/** @param {Lang} lang */
export function langSwitched(lang) {
  return lang === "en" ? "I'll reply in English." : "日本語でお返事します。\nI'll reply in Japanese.";
}

/**
 * @param {Array<{code: string, kind: string}>} rows
 * @param {string} [adminUrl]
 */
export function digestText(rows, adminUrl) {
  const lines = [`今日の新しい報告は${rows.length}件です。`];
  const shown = rows.slice(0, 15);
  for (const r of shown) lines.push(`${r.code} ${KIND_JA[r.kind] || r.kind}`);
  if (rows.length > shown.length) lines.push(`ほか${rows.length - shown.length}件`);
  if (adminUrl) lines.push(adminUrl);
  return lines.join("\n");
}

/** Privacy page body. The follow text, then the data rules, in Japanese and English. */
export function privacyParts() {
  const ja = [
    FOLLOW_JA,
    "",
    "集めるもの",
    "報告の文章、写真、選んで送られた位置（緯度と経度）、使っている言語です。",
    "",
    "集めないもの",
    "名前、住所、LINEの表示名、プロフィール写真、ステータスメッセージは集めません。プロフィールのAPIは呼びません。",
    "",
    "保存のしかた",
    "LINEのユーザーIDは暗号化して保存します。画面には出ません。",
    "",
    "残す期間",
    "報告は、チームが閉じたあと180日で消します。",
    "見送りにした報告の写真は、30日で消します。",
    "「削除」と送ると、その人の報告と写真と連絡先は、すぐに消します。",
    "",
    "子どもへ",
    "名前や住所など、自分のことは書かないでください。人の顔がうつった写真は使いません。",
  ].join("\n");
  const en = [
    FOLLOW_EN,
    "",
    "What we keep",
    "The words you send, your photos, a location you choose (latitude and longitude), and your language.",
    "",
    "What we do not keep",
    "We do not keep your name, your address, your LINE display name, your profile photo, or your status message. We never call the profile API.",
    "",
    "How it is stored",
    "Your LINE user id is encrypted. It is not shown on the page.",
    "",
    "How long",
    "A report stays until the team closes it, then for 180 days.",
    "Photos on a report we do not use are removed after 30 days.",
    "If you send 削除, your reports, photos, and contact are deleted at once.",
    "",
    "For children",
    "Do not write your name or anything about yourself. We do not use photos that show people's faces.",
  ].join("\n");
  return { ja, en };
}
