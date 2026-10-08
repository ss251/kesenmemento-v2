# Partner rewards

A quest can name a real-world thank-you from a shop. the author has confirmed there is no partner yet, so `data/play/partners.json` is an empty list. Every quest that asks for a voucher shows 「協力店募集中」 / "Partner shops coming soon", and the in-game stamp still applies.

The card is the whole reward. There is no account, no purchase, and no draw.

## When a card shows a real voucher

All of these have to be true. Otherwise the card stays on 「協力店募集中」 and no code is minted.

- `active` is `true`
- `consent.kind` is `"written"`
- the completion time is inside `validFrom` and `validTo`, when those are set

The same device sees the same code if the card is opened again. The code is `QUEST-DDDD-MMMMMM-C`: a short quest code, a hash of the device id, the UTC minute, and a check character. It is not stored on a server.

A shop may open this, itself, in a browser:

`GET /api/play/voucher/check?c=CODE`

The reply is `{ ok, quest, minute }` when the check character matches, and `{ ok: false }` when it does not. The route writes nothing and looks nothing up. The game does not call it.

## How a shop joins

Someone from the shop says yes in writing. The note names the shop, the offer, the terms, the dates, and how many times one device may show it (`perDevice`). That note is the `consent.ref`, with `consent.kind: "written"` and `consent.date`.

Then one object is added to `partners`:

```json
{
  "id": "example",
  "shop": "（店の名）",
  "place": "（まちの場所）",
  "offer": { "ja": "（何を渡すか）", "en": "(what they hand over)" },
  "terms": { "ja": "（誰でも、買わなくてよい、いつまで）", "en": "(who, no purchase, until when)" },
  "validFrom": "2026-10-01",
  "validTo": "2026-12-31",
  "perDevice": 1,
  "consent": { "kind": "written", "date": "2026-10-01", "ref": "（同意の記録）" },
  "active": false
}
```

`active` stays `false` until the written yes is in hand. An example in this file is not a shop. Do not invent a partner.

A quest points at that id with `"voucher": "example"`, or uses `"voucher": true` and is shown as recruiting until a partner is wired to it. Today the three voucher quests (`morning-catch`, `cape-trees`, `ebisu-photo`) use `true`, so they recruit.

## The shape of the offer

This is the shape the author asked for, so a shop's own reading of the 景品表示法 can sit on the card. It is not a legal opinion.

- Anyone who plays the quest can receive it. It is not a lottery, and it is not given by rank or by a score.
- The person does not have to buy anything.
- The shop is the issuer. The offer and the terms are on the card, with the time the quest was completed.
- The card says 「お店でこの画面を見せてください」. Staff compare the code if they want, with the check URL above.

The 消費者庁 publishes the fair-labeling guidance at <https://www.caa.go.jp/policies/policy/representation/fair_labeling/>. A shop should read that, and their own counsel, before `active` is turned on.
