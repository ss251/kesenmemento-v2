// The default rich menu: 2500×1686, six tiles, chat bar 「メニュー」.
// Bounds are integers. 833 + 833 + 834 = 2500. 843 + 843 = 1686.

export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 1686;
export const RICH_MENU_NAME = "kesenmemento";
export const PLAY_URL = "https://kesenmemento.com/?src=line";

const COLS = [833, 833, 834];
const ROW_H = 843;

/**
 * The rich menu object sent to POST /v2/bot/richmenu.
 * Chat bar text is 「メニュー」 (4 characters; the API allows 14).
 */
export function richMenuRequest() {
  const tiles = [
    { data: "flow=bug", displayText: "バグを知らせる" },
    { data: "flow=fix", displayText: "町の間違い" },
    { data: "flow=photo", displayText: "写真を送る" },
    { data: "flow=idea", displayText: "アイデア" },
    { uri: PLAY_URL, label: "あそぶ" },
    { data: "flow=help", displayText: "使い方" },
  ];
  const areas = tiles.map((tile, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = COLS.slice(0, col).reduce((s, n) => s + n, 0);
    const action = tile.uri
      ? { type: "uri", label: tile.label, uri: tile.uri }
      : { type: "postback", label: tile.displayText, data: tile.data, displayText: tile.displayText };
    return {
      bounds: { x, y: row * ROW_H, width: COLS[col], height: ROW_H },
      action,
    };
  });
  return {
    size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT },
    selected: true,
    name: RICH_MENU_NAME,
    chatBarText: "メニュー",
    areas,
  };
}
