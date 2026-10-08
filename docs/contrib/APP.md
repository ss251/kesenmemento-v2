# 修正を報告 / Report a correction: the in-app flow

Residents and visitors tell us what is wrong in the Living City from inside the app. A report carries the view they were looking at (an automatic
screenshot and the exact camera pose), what is wrong, and optionally photos taken on the spot. Accepted reports earn points on a public leaderboard.
The backend that receives the reports is `server/contrib` (branch `feat/contrib-api`, see its `docs/contrib/API.md` and `PRIVACY.md`); this document is the
**app** side: the sheet, the pose, the `?cam=` link, the API client, the mock backend used for the e2e, and the tests. Nothing here calls Crewship.

The client is checked against the real backend, not only against a mock: `tools/anime/contrib-contract.mjs` runs one scenario (40 steps: login, reports with an
Idempotency-Key, the moderator's side, the leaderboard, the transfer code, CORS, deleting everything) through the app's own client against the in-memory mock **and**
against the real service's throwaway dev server, and both pass (see [Contract](#contract)).

| Desktop 1440 × 900 | Phone upright 390 × 844 | Phone on its side 844 × 390 |
|---|---|---|
| ![open](../shots/contrib/desktop_open.png) | ![open](../shots/contrib/portrait_open.png) | ![open](../shots/contrib/landscape_open.png) |

- [How to report (日本語)](#日本語-使い方) · [How to report (English)](#english-how-to-report)
- [For developers](#for-developers) · [Contract](#contract) · [Pointing the app at a backend](#pointing-the-app-at-a-backend)
- [Tests and the e2e](#tests-and-the-e2e) · [Screenshots](#screenshots) · [Not done](#not-done)

## 日本語: 使い方

1. 町のなかで、おかしいところが見えるところまで歩く（または飛ぶ）。
2. **「修正を報告」** ボタンを押す。パソコンでは右上のツールバー（旗のボタン）かキーボードの **B**、スマホでは **☰ → 修正を報告**。
3. **どちらにするか選ぶ**（はじめは「問題を報告」）。
   - **問題を報告**: へんなところを見つけたら教えてください。いま見ている画面は、自動でいっしょに送ります（何もしなくて大丈夫です）。
   - **現地の写真で直す**: その場で撮った写真には場所の情報がついていて、直す位置を決めるのに役立ちます。写真は1枚以上。
4. **どんなことか**を選ぶ（たてもの、道、お店、看板、名所・施設、そのほか）。それぞれ例が書いてあります（浮いている建物 / 道がちがう / 看板の位置がちがう ...）。
5. **くわしく教えてください**（なくてもOK）。「どこが、どうちがうか」を書く。
6. **写真**をそえる（問題の報告ではなくてもOK）。スマホは「カメラで撮る」もできます。1枚15MBまで、6枚まで。
7. **ニックネーム**（ランキングに出ます。本名は書かないでね。リンクやメールアドレスは使えません）と、**クルーNo.**（なくてもOK。14けたの数字。ハイフンはあってもOK）。
   クルーNo.は、記録のためと、今後のクルーのポイントプレゼントのために使います。
8. 「写真と撮影場所は公開されません」の一行を読んで、**同意にチェック**して**「送る」**。くわしくは「取り扱いの詳細」に書いてあります。
9. 送れたら「確認待ち」。スタッフが見て**採用**されると、問題の報告は約5ポイント、現地の写真で直すと約20ポイント。
   町に反映されたら「**反映済み（v…）**」になり、「この修正は、みんなが見る町に反映されています」と表示されます。
10. **マイ投稿**で自分の報告と状態、ポイントの合計とランキングの順位が見られます。**貢献ランキング**はニックネームと採用数・ポイントだけを表示します（あなたの行には「あなた」のしるし）。
11. **別の端末に引き継ぐ**: マイ投稿の「引き継ぎコードを作る」で10文字のコード（`XXXXX-XXXXX`、15分だけ使えます）とQRコードが出ます。もう1台でQRコードを読み取るか、
    「引き継ぎコードを入力」にコードを入れると、これまでの投稿とポイントが引き継がれます（もとの端末もそのまま使えます）。みんなで使う端末では、使い終わったあとに
    「この端末の情報を消す」を押してください（消す前にコードを作っておくと、あとで戻せます）。
12. **送ったデータをすべて削除**: マイ投稿の一番下の「データを削除する」を押すと確認が出ます（「やめる」がはじめから選ばれています）。「削除する」で、投稿・写真・ニックネーム・クルーNo.が
    サーバーからすべて消え、この端末の情報も消えます。取り消せません（すでに町のモデルに使われた内容は元に戻せない場合があります）。

通信できないときは「送れませんでした」と理由が出て、書いた内容と写真はそのまま残ります（「もういちど送る」）。送ったかどうか分からなくなっても、同じ報告を2回送ってしまうことはありません。
書きかけの文字は自動で保存されます（写真は保存されません）。

## English: how to report

1. Walk (or fly) to where you can see the mistake.
2. Press **Report a correction**: the flag button in the toolbar on a desktop, the key **B**, or **☰ → Report a correction** on a phone.
3. **Choose what to do** (it starts on "Report a problem").
   - **Report a problem**: spotted something odd? Tell us. We attach the view you are looking at, automatically.
   - **Fix it with photos from the spot**: photos taken on the spot carry their location, which helps us place the fix. At least one photo.
4. **Pick what it is about**: building, road, shop, sign, landmark, something else. Each has an example (a building that floats, the road is different, a sign is in the wrong spot ...).
5. **Tell us more** (optional): what is different, and where.
6. **Add photos** (optional for a problem; photos are kept exactly as taken, so their location stays). On a phone you can also take one with the camera. Up to 6, 15 MB each.
7. A **nickname** (shown on the leaderboard; please do not use your real name; no links or e-mail addresses) and an optional **Crew No.** (14 digits, dashes are fine). The Crew No. is used to keep
   track of your reports and for future Crew point gifts.
8. Read the one-line summary ("Photos and locations are never made public"), **tick the box** and **Send**. The details are under "How your report is handled".
9. It is "Pending review" until our team looks at it. If **accepted**, a problem report earns about 5 points and a fix with photos from the spot about 20. When the fix is in the app it
   reads **"Live in the app (v…)"** with "This fix is now live for everyone".
10. **My reports** shows your reports, their state, your total and your rank; the **Leaderboard** shows nicknames, accepted counts and points only (your row is marked "You").
11. **Move to another device**: in My reports, "Get a transfer code" shows a 10-character code (`XXXXX-XXXXX`, good for 15 minutes) and a QR code. On the other device scan the QR code or use
    "Enter a transfer code"; the first device keeps working. On a shared device use "Forget me on this device" when you are done (make a transfer code first if you want to come back to your points).
12. **Delete everything I sent**: at the bottom of My reports, "Delete my data" asks first ("Cancel" is focused). "Delete" removes your reports, photos, nickname and Crew No. from the server and clears this
    device. It cannot be undone (changes already made to the 3D town from your reports may not be reversible).

If the network is down you get a plain-words reason and nothing you wrote is lost ("Send again"); sending the same report again after a lost answer never makes two. Your unsent text is kept as a draft (photos are not).

## For developers

### The pieces

| File | What it is |
|---|---|
| `src/anime/core/pose.js` | The camera pose of a report: ENU position, lat/lon, compass heading, pitch, vertical fov, mode, time preset, season, build stamp, viewport; `poseToQuery` / `queryToPose` / `poseToUrl` (the `?cam=` link). No DOM, no three.js. |
| `src/anime/core/buildinfo.js` + `scripts/anime/buildinfo.js` | The build stamp (`appVersion` = package version + commit, `layoutVersion` = layout data version + short hash) injected as Bun `define` constants by `scripts/build-web.js` and `tools/anime/cdp.mjs`. `'dev'` outside a stamped build. |
| `src/anime/ui/pngmeta.js` | A small CRC32 PNG chunk writer / reader. Photo mode (`ui/photo.js`) writes the pose as a `tEXt` chunk with key `klc-pose`; the reader is for tools and the round-trip test. |
| `src/anime/ui/contrib.js` | The sheet's controller: a modal dialog (focus trap, Esc, inert page, pad suppress, key shielding), the form, sending (one Idempotency-Key per report, waits for the screenshot), my reports, the transfer code, deleting my data, the draft. |
| `src/anime/ui/contrib-view.js` | The markup, as pure functions from a model to HTML (so it is tested with `HTMLRewriter`). |
| `src/anime/ui/contrib-shot.js` | The screenshot capture and the photo thumbnails (memory-careful, see below). |
| `src/anime/ui/contrib-api.js` | The API client (fetch, `XMLHttpRequest` for the upload only), `ContribError` (a coarse `code` plus the backend's own `reason`), `messageKey` / `explainError`, `config()` (GET /health), `resolveApiBase`, the response normalisers. |
| `src/anime/ui/contrib-lib.js` | Pure helpers: limits, `CONTRIB_API`, `CONTRIB_CONTACT`, クルーNo. / claim-code / nickname validation (the backend's own rules), photo checks, the draft, the login store, status and points copy, `newIdempotencyKey`, `waitText`, `effectiveLimits` / `effectivePoints` (the built-in numbers with the backend's on top), screenshot sizing, the keyboard inset, the transfer link. |
| `src/anime/ui/qr.js` | A tiny QR encoder (byte mode, versions 1-10, levels L-H) for the transfer link. No network, no library. |
| `src/anime/ui/style.js` | `CONTRIB_CSS` (the sheet) and the HUD button's rules at the end of `CSS`. |
| `data/ui-contrib-i18n.json` | Japanese and English strings (`contrib.*`); the privacy text (`contrib.consent`, `contrib.privacy.*`, nine items) is the backend's `docs/contrib/PRIVACY.md`, version 2026-10-05, word for word. |
| `src/anime/ui/hud.js` | The toolbar / ☰ button (`data-act="report"`), key **B**, and `mountContrib`. |
| `tools/anime/contrib-mock-api.mjs` | An in-memory backend (port 8988 by default) with the real service's routes, shapes, error codes, limits and CORS, for the e2e and for demos. |
| `tools/anime/contrib-contract.mjs` | The contract scenario: the app's client against the mock, or against the real backend (`--backend <checkout>`) or a running service (`--api`). |
| `tools/anime/contrib-shots.mjs` | The headless-Chrome e2e and the screenshots in `docs/shots/contrib/`. |

### How a report is made

```
HUD button / key B ──► contrib.open()  (a synchronous part of the click)
                         ├─ capturePose(ctx)        camera, mode, time preset, season, viewport, build stamp
                         ├─ captureView(ctx)        one more frame drawn and read back in this same task -> 2D canvas -> JPEG (<= 1600 px wide)
                         └─ build the dialog        make it visible, focus it, inert the page, pad.suppress('contrib'), exit pointer lock
visitor fills the form ──► send():  wait for the screenshot if it is still being taken; Idempotency-Key = a UUID per report (reused by a retry of the same report)
                                    ensureLogin()  POST /contributors (or PATCH /me when the nickname / クルーNo. changed)
                                    api.submit()   POST /submissions  multipart: pose, kind, category, note, lang, consent=1, screenshot, photos x 0..6
                         ◄── { id, status: 'new' } ─► thank-you screen; draft, photos and the screenshot blob are released
```

The screenshot is taken **before** the sheet covers anything, in the click's own task (the WebGL drawing buffer is not preserved across frames, exactly as photo mode reads
its canvas). It draws the frame at the canvas's own size (no render-target resize, no new texture), scales it in a 2D canvas to at most 1600 px wide (never beyond the
screen's own pixels: a 390 px phone canvas is not blown up to 1600), encodes a JPEG (q 0.86) and a ~480 px preview, and **shrinks every canvas to 0 × 0** as soon as it is
encoded. The preview is a separate small JPEG, so a second large image is never decoded for display. Closing or sending drops the blob and revokes the preview URL. Photo
thumbnails are decoded at 160 px (`createImageBitmap` with `resizeWidth`), one at a time; the original `File` is uploaded untouched so its **EXIF GPS stays** (the backend needs
it to place a fix).

**The operator's numbers.** The first time the sheet opens (and at most every ten minutes) it asks `GET /health` (no login, a simple request, never blocking, silent on failure) for the limits and points the operator
configured: `limits {maxPhotos, maxPhotoBytes, maxScreenshotBytes, maxNoteChars}` and `points {issue, fix}`. The checks before an upload (photo count and size, note length), the "up to N photos, M MB each" copy and the
"about 5 / 20 points" copy then use them (a number outside a sane range, or an older backend that says nothing, keeps the built-in one, which are the documented defaults). A body above the backend's whole-body cap is a bare
`413` a browser cannot read, which is why the sizes are checked up front.

**One report, one key.** The key is made when the visitor presses 「送る」 and reused as long as the report is the same (words, photos, screenshot, pose time): a retry after a timeout or a lost
answer gets the first report back (`200`, `replayed: true`) instead of making a second. Editing the report makes a new key; a sent report spends its key.

### The pose and the `?cam=` link

```
frame     metres, x east, y up (T.P.), z SOUTH; origin 38.9060 N 141.5750 E   (src/anime/world/layout.js)
          lon = x / 86744 + 141.5750      lat = 38.9060 - z / 111014
heading   compass degrees, clockwise from north, [0, 360)   - the EXIF GPSImgDirection convention
          (the engine's yaw is its negative: yaw 0 = north, +90 = west; tools/anime/photo-pairs.mjs does the same)
pitch     degrees, + up          fov   the camera's VERTICAL field of view, degrees
pose      { enu: [x, y, z], latlon: [lat, lon], heading, pitch, fov, mode, at, appVersion, layoutVersion, timePreset, season, viewport: { w, h, dpr } }
mode      walk | drive | fly | drone | sail          at   ISO 8601 UTC
timePreset  asa | hiru | yugata | yuyake | yoru, or the JST clock "HH:MM" when the time is off a preset      season  spring | summer | autumn | winter | early
```

`?cam=x,y,z,heading,pitch,fov` (six numbers) opens the app with a free camera at exactly that eye position, and pins the vertical fov (`resize()` no longer picks one). The
older `?cam=` forms keep their meaning: `x,z,yaw,pitch` (4), `x,y,z,yaw,pitch` (5, **yaw**), `x,y,z>lx,ly,lz`, `hero`, `walk`, `tour:<id>`. `poseToUrl(pose, base)` also appends
`&preset=` (or `&hours=` for an off-preset clock) and `&season=`, so the light and the season of the screenshot come back too. **The admin UI should link
`<app URL>?cam=<enu x>,<enu y>,<enu z>,<heading>,<pitch>,<fov>` using `pose.heading` as it is stored** (the backend stores the pose as sent, `heading` wrapped into [0, 360)).
Restoring is exact to a centimetre and 0.01° (the e2e checks it); when the moderator's window has another aspect ratio the same vertical fov shows more or less at the sides.
The backend refuses an empty `season` / `timePreset` string (it accepts `null`), so `capturePose` never sends one.

Photo mode (`P`, the 写真 button) writes the same pose into the PNG as `tEXt` / `klc-pose` (ASCII JSON, CRC-checked, inserted right after IHDR; the 10 MB of pixels are wrapped with
`Blob.slice`, not copied). `readPngPose(bytes)` reads it back.

### Keyboard, focus and accessibility

- A modal built from `role="dialog"`, `aria-modal`, `aria-labelledby`; everything behind it (`BACKGROUND` in `contrib.js`) is `inert`. The dialog is made visible **before** it takes the focus
  (`focus()` does nothing under `visibility: hidden`) and the closed look is flushed first so the slide-in still animates.
- **Tab / Shift+Tab are trapped** (`nextFocus`), **Esc** steps back (privacy notice, transfer code) and then closes; focus returns to the button that opened it (on a phone the item lived in the
  ☰ menu, so it falls back to the ☰ button). The town's keys (WASD, F, H, M, R, 1-9, N, /) do **not** run while it is open: a capture-phase handler on `window`, registered before the HUD's, the
  car's and the ship's, stops them (typing and clicking are untouched). `keyup` is never stopped, so a key held when the sheet opened is still released.
- Native radios (kind, category), checkbox (consent), file inputs, `textarea`, `<progress>`; every control has a visible `<label>`; errors are `role="alert"` under the field, a status line
  announces progress and results (`aria-live="polite"`); tabs are `role="tablist"` with a roving `tabindex` and arrow keys. The delete question is a labelled group and the safe answer has the focus.
- Targets are **44 px** on phones, with a touch screen and with the pad on (40 px with a mouse); text fields are 16 px so iOS does not zoom.
- Reduced motion switches every transition off. The scroller carries `data-scroll`, so the touch pad's `touchmove` guard lets it scroll.

### Layout (no shift, no moved controls)

- Three layouts by size, not by the pad: a panel docked right (desktop), a rounded card at the bottom inside the safe area (a narrow window, a phone upright) and a wide two-column card with a
  one-row header for a phone on its side. `--kc-kb` lifts the card above the on-screen keyboard (`visualViewport`).
- Only `opacity` and `transform` animate. The screenshot box has the screen's own aspect ratio from the first paint and three lines of text are always reserved, the two kind explanations share one grid
  cell (the taller sets the height), photo tiles are fixed-size: nothing below moves when the picture arrives or the kind changes (the e2e measures it, and the layout shift from the first opening on).
- The HUD button is the **last** item of the toolbar. On a wide screen it is out of the toolbar's flow (`position: absolute; right: calc(100% + 8px)`), so the right-anchored toolbar's other controls do
  not move; in the ☰ menu it is the last item; in the narrow no-pad column it is the last button. The e2e hides it and compares the rectangles of every other control. It is a pill with a label from
  1181 px up and a 38 px round button below that (44 px with the pad on). From 721 to 839 px the toolbar fills the width up to the wordmark, so the round button drops under the search / map / drive row
  (`top: 94px; right: 0`, still out of the flow); the e2e checks 1440, 1181, 1100, 900, 840, 839, 800 and 721 px in Japanese and 1181 to 721 px in English.

### Storage

| Key (`localStorage`) | Holds |
|---|---|
| `klc.contrib.acct.v1` | `{ [backend]: { id, token, profile } }`: the anonymous login per backend (a token is never sent to another server) and the nickname / クルーNo. the server last heard |
| `klc.contrib.me.v1` | `{ nickname, crewNo }` remembered for the form |
| `klc.contrib.draft.v1` | `{ v, at, kind, category, note, crewNo }`, 30 days; **no photos, no consent** (consent is asked again every time) |

All reads and writes are inside try / catch (private mode simply forgets). "Forget me on this device" and "Delete my data" remove all three.

### Phone memory

Nothing in this feature creates a texture or resizes a render target; the DOM is built when the sheet opens and emptied after it closes, the screenshot's canvases are 0 × 0 once encoded and the
photo thumbnails are decoded at 160 px. The code, styles and strings add about 129 KB to the minified bundle (2,731 → 2,860 KB over `dist/*.js` of 42 chunks, about 52 KB gzipped: 958 → 1,010 KB; the strings are 189 keys in two languages). phonemem (phone tier, 390 × 844 at DPR 3, quality low, after 「まちへ出る」) was run on main (`df15fdd`) and on this branch with the same arguments: texture memory **256 MB on both** (the same 12 big canvases, 189 MB),
geometry 202 MB on both, 449 draw calls and 3.75 M triangles on both, 255 geometries / 112 textures / 141 programs on both, 0 page errors on both (the one console line is the dev server's missing `/api/live`), JS heap after GC 137 MB on both
(peak 463 → 454 MB, settled 229 → 242 MB: run-to-run noise, nothing is retained), first frame 41 s → 54 s with the whole test suite running next to it. The 256 MB itself is main's figure (the phone-budget lane brings it down separately).

## Contract

The binding spec is not included; the real service is `server/contrib` (`docs/contrib/API.md`, `PRIVACY.md`). The app was first written against the spec and the product brief and then
**checked against the real backend** (`feat/contrib-api` at `0fbe4ca` and again at `5d90d8f`, its throwaway dev server `tools/contrib/dev-server.mjs`): the contract scenario passes 40 / 40 on the mock and on the real service,
and the mock was rewritten to follow what the real one answers. To run it again, after the merge:

```sh
env -u NODE_OPTIONS bun tools/anime/contrib-contract.mjs                     # the in-memory mock (also in `bun test`, test/contrib-mock.test.js)
env -u NODE_OPTIONS bun tools/anime/contrib-contract.mjs --backend .         # the real backend of this checkout (tools/contrib/dev-server.mjs, temp data, port 8987)
env -u NODE_OPTIONS bun tools/anime/contrib-contract.mjs --api https://host --admin-token ...   # a deployed service: one throwaway contributor, erased at the end
```

What the client relies on:

1. Base `/api/contrib/v1`, JSON, `Authorization: Bearer <id>.<secret>` (the token of `POST /contributors` or of a claim), no cookies. Errors are `{ "error": "<code>", "message": "..." }`; the client keeps the
   code as `ContribError.reason` and maps the status to a coarse `code` (`auth`, `banned`, `origin`, `validation`, `too_large`, `type`, `rate`, `daily`, `devices`, `not_found`, `server`, ...) that picks the words.
   `reason`s with words of their own: `empty_submission`, `invalid_nickname`, `invalid_crew_no`, `fix_needs_photos`, `server_busy`; a `daily_limit` says when to come back (from `Retry-After`).
2. `POST /contributors {nickname?, crewNo?}` → `201 {contributorId, token, nickname}`. `crewNo` is sent as 14 digits without dashes; a blank nickname becomes `Guest-XXXX` on the server.
3. `GET /me` → `{contributorId, nickname, crewNo, points, pointsTotal, accepted, rank, submissions: [{id, createdAt, status, kind, category, note, points, photos, reviewedAt, usedVersion, usedAt}]}`.
   `status` ∈ `new | accepted | used | rejected`; `usedVersion` is shown as 「反映済み（v…）」. The product brief spelled it `used_version`: both are read. The moderator's note is **not** sent and is not shown.
4. `PATCH /me {nickname?, crewNo?}` (`crewNo: null` removes it, a blank nickname resets it); `DELETE /me?confirm=1` erases the contributor and everything they sent (`{ok, deletedFiles}`).
5. `POST /submissions` multipart: `pose` (JSON text), `kind` (`issue | fix`), `category`, `note`, `lang`, `consent=1`, `screenshot` (a JPEG), `photos` (0 to 6 originals) → `201 {id, status, kind, photos, createdAt}`;
   with `Idempotency-Key` a retry returns `200` + `replayed: true`. A `fix` needs a photo and a report needs a note, a screenshot or a photo (the client checks both before sending).
6. `GET /leaderboard?limit=20` → `[{nickname, accepted, points, me?}]`; the client sends its token when it has one so the server marks its own row with `me: true` (a 401 on that call is retried without the token).
7. `GET /me/transfer-code` → `{code: "K7QM2-XHD9P", expiresAt, expiresInSeconds: 900}`; `POST /contributors/claim {code}` → `{contributorId, token, nickname}` (a **new** token; the old device keeps working; at most 10 devices).
   The code is Crockford base32 (no I, L, O, U): the client reads O / I / L as 0 / 1 / 1 and refuses anything else before the request, because the backend lets only **5 tries an hour per client** through (rejected ones count).
   Wrong, used and expired codes are one `404 code_not_found`.
8. CORS: the page's origin must be in the backend's `ALLOWED_ORIGINS`; any other origin is `403 origin_not_allowed` **without** CORS headers, so a browser reports it as a network error ("could not reach the server").
   The preflight allows `Authorization, Content-Type, Idempotency-Key` and `GET, POST, PATCH, DELETE`; `Retry-After` is exposed to the page.
9. Limits the client mirrors: 6 photos, 15 MB a photo, 8 MB the screenshot, 2,000 characters of note, 24 of nickname, 14 digits; the daily limit is 20 reports per contributor (`429 daily_limit`).
10. The nickname must not contain a link or an e-mail address (`https?://`, `www.`, `name.com|net|org|jp|info|xyz|ru|cn`, `a@b.c`): the field refuses it where it is typed, with the backend's own pattern.
11. The pose JSON has exactly the spec's keys and passes `parsePose` (`enu` 3 numbers, `latlon` 2, `fov` in (0, 180], `mode` a short word, strings at most 64 characters, the whole pose under 8 KB).
12. `GET /health` → `{ok, service, version, storage, time, limits {maxPhotos, maxPhotoBytes, maxScreenshotBytes, maxNoteChars, dailyLimit}, points {issue, fix}}` (the numbers were added at `3e7e425`; the contract scenario passes against the head `5d90d8f` and against `0fbe4ca`, which has none of them).
    The app reads `limits` and `points` once per ten minutes (see "The operator's numbers") and keeps the documented defaults when they are missing.

Things the team still has to decide or check (the app works without them):

- **The deletion contact.** `docs/contrib/PRIVACY.md` has a `{{CONTACT}}` for "to ask for deletion or with any question". The app does not invent one: `CONTRIB_CONTACT` in `contrib-lib.js` is empty, so the notice shows
  the self-service line instead ("delete everything yourself, any time, from My reports"). Put the address or form URL in that constant when the team has one (it is shown as the notice's last line).
- **Legal review of the privacy text** (PRIVACY.md says so: it hands the クルーNo. to 気仙沼地域戦略, a provision to a third party). If the wording changes, change `data/ui-contrib-i18n.json`
  and the backend's `PRIVACY_VERSION` together (the backend records the version with every report).
- **`ALLOWED_ORIGINS`** must list the production app origin and the public mirror if it should send reports.
- The backend refuses a `season` / `timePreset` of `""`; the app sends `null` when it does not know.

## Pointing the app at a backend

The default is `CONTRIB_API = ''` in `src/anime/ui/contrib-lib.js`: no backend is configured. The sheet can still open (`?contrib=1` on a production host) and it shows 「報告の受付は準備中です」 / "Reports are not open yet". It does not submit, and it does not call the leaderboard, the transfer-code link, `DELETE /me`, or `GET /health`. An empty value is not turned into a relative URL on this origin.

The constant stays empty until a service exists. [DEPLOY.md](DEPLOY.md) sets it to that service's real origin after `GET /api/contrib/v1/health` answers. Until then the app must not know a hostname a stranger could claim and use to receive reports, nicknames, and photos.

`?contribApi=<url>` overrides the empty default for that page load (`resolveApiBase` in `contrib-api.js`):

- `https://` anywhere, `http://` only for localhost, loopback and private-LAN addresses; no credentials in the URL; a path prefix is kept. Anything else is ignored and the empty default stays.
- A custom backend that is **not** local shows a "Test server: host" banner in the sheet, so nobody sends a report to a stranger's server without seeing where it goes.
- The login is stored per backend, so a test backend never receives the production token.

```sh
# the real backend, throwaway (temp data, loopback, fixed dev admin token; after the merge, or from the backend's checkout)
env -u NODE_OPTIONS bun tools/contrib/dev-server.mjs --port 8988 --origin http://127.0.0.1:8986 --seed
# or the in-memory mock (admin token: mock-admin-token-0123456789abcdef)
env -u NODE_OPTIONS bun tools/anime/contrib-mock-api.mjs --port 8988 --seed 1
env -u NODE_OPTIONS bun -e "import {start} from './scripts/serve.js'; await start({port: 8986, build: false})"   # the app (after bun run scripts/build-web.js)
open http://127.0.0.1:8986/index.html?contribApi=http://127.0.0.1:8988
```

The mock follows the real service (health, anonymous contributors, `/me`, multipart submissions with magic-byte and size checks, Idempotency-Key, the daily limit, the leaderboard with `me`, the transfer code and claim with
its 5-tries limit, `DELETE /me`, CORS with `origin_not_allowed`, the admin list / detail / review (`status`, `points`, `reviewerNote`, `version`) / `mark-used` / files / `crew.csv` / `submissions.json`). Accept a report by hand:

```sh
curl -s -X POST http://127.0.0.1:8988/api/contrib/v1/admin/submissions/<id> -H 'authorization: Bearer mock-admin-token-0123456789abcdef' \
  -H 'content-type: application/json' -d '{"status":"accepted","points":5}'      # status: new | accepted | used (add "version": "v0.5.0") | rejected
```

In production the app origin (and a public mirror, if one is used) must be in the backend's `ALLOWED_ORIGINS`. `scripts/public-mirror.js` is read-only and never proxies the backend; it names `/data/ui-contrib-i18n.json`.

## Tests and the e2e

Unit tests (`bun test`, in-process, no subprocess): 324 in 9 files for the feature (`test/contrib-*.test.js`); the whole suite is 1,485 pass, 75 skip, 1 fail over 91 files (the known `test/ship-integrate.test.js` "a real build of src/anime/index.html", whose child process returns nothing on this machine). `test/contrib-pose.test.js` (frame, headings, capture, the `?cam=` round trip, down to the real `Player`), `test/contrib-pngmeta.test.js` (CRC, chunk round trip
verified with sharp, photo mode), `test/contrib-buildinfo.test.js`, `test/contrib-lib.test.js` (クルーNo. / claim-code / nickname rules, drafts, the login store, the strings and the backend's privacy text), `test/contrib-api.test.js` (the client against a **mocked fetch** and a fake
`XMLHttpRequest`: both spellings of every answer, the backend's error reasons, Idempotency-Key, optional-auth leaderboard, `deleteMe`), `test/contrib-qr.test.js` (capacities, structure, golden matrices),
`test/contrib-mock.test.js` (the contract scenario and the mock's rules over real HTTP), `test/contrib-shot.test.js` (the capture frees its canvases), `test/contrib-sheet.test.js` (the markup parsed with
`HTMLRewriter`, the CSS, the HUD wiring, and the controller driven through a fake DOM and a mocked fetch). The QR encoder was also verified outside the suite: module for module against python-qrcode (28 codes) and
decoded by CoreImage (33 images).

```sh
env -u NODE_OPTIONS bun test test/contrib-*.test.js                                   # the feature's tests
tools/anime/gate.sh run env -u NODE_OPTIONS bun test                                  # everything (test/ship-integrate.test.js's spawn test fails on this machine: see the note in the report)
tools/anime/gate.sh run env -u NODE_OPTIONS bun run scripts/build-web.js              # the build
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/contrib-shots.mjs      # the e2e (ports 8986 app, 8988 mock; --only desktop,portrait,landscape; --quick 1; --nobuild 1)
```

The e2e is a plain script of 167 checks (inside `bun test` child processes return nothing on this machine, and Chrome is one; the run takes about 14 minutes with the shared Chrome lock free). Per viewport it opens the sheet through the HUD (a click; on a phone ☰ then the item with real touches),
and checks: the dialog semantics and that focus is on it, the focus trap (95 Tab / Shift+Tab presses), Esc and the focus return, the town's keys while typing, the 44 px targets of every view, the safe area, the layout (screenshot arrival,
kind switch, the HUD does not move, the toolbar at eight desktop widths and in English, layout shift), the screenshot capture (JPEG, ≤ 1600 px, canvases at 0 × 0, preview URL revoked), the upload progress over a throttled network,
what the backend received (pose, screenshot, photos byte for byte with their EXIF), マイ投稿 in four states (no private notes, my rank), the transfer code and its QR code, the leaderboard (my row, the 「あなた」 pill not clipped), the delete
question (a phone stops at the question; desktop and landscape delete and check the backend), an offline error and the retry, English, night, a view restored from its `?cam=` link, and a login moved to a second origin through the QR link
(and the claimed nickname showing in the report form).

## Screenshots

`docs/shots/contrib/`, made by `contrib-shots.mjs` (DPR 2 and iPhone safe-area insets on the phone profiles; the photos are made-up shop fronts with synthetic EXIF; the leaderboard names are made up).

| File | What it shows |
|---|---|
| `desktop_board.png` | 貢献ランキング: rank, nickname, accepted count and points; my row is marked 「あなた」 (desktop 1440 × 900) |
| `desktop_config.png` | an operator configuration other than the defaults reaches the sheet through `GET /health` (points 7 / 30, 5 MB a photo, 3 photos): four photos were picked, three were taken and the sheet says why; the points copy shows 約7 / 約30 (desktop 1440 × 900) |
| `desktop_en_open.png` | the same sheet in English (desktop 1440 × 900) |
| `desktop_erased.png` | after 「送ったデータをすべて削除」: the backend has lost this contributor; the confirmation is at the top, nothing more to delete (desktop 1440 × 900) |
| `desktop_error.png` | an offline error under the form in plain words, 「もういちど送る」; the report and its photo are kept (desktop 1440 × 900) |
| `desktop_filled.png` | the form filled in: category, note, two photos with their remove buttons (desktop 1440 × 900) |
| `desktop_filled_end.png` | the bottom of the form: nickname, クルーNo. (optional, and why), the points copy, the one-line privacy summary, the consent box, the send bar (desktop 1440 × 900) |
| `desktop_fix.png` | 「現地の写真で直す」 selected: one line says photos taken on the spot carry their location; the photos label asks for at least one (desktop 1440 × 900) |
| `desktop_mine.png` | マイ投稿: total points and rank, nickname and クルーNo., four reports in four states (確認待ち, 採用 +5pt, 反映済み（v0.2.0）+20pt with "live for everyone", 見送り), then the transfer and delete sections (desktop 1440 × 900) |
| `desktop_night_open.png` | the sheet over the night view (its screenshot is the night scene, the chip says 夜) (desktop 1440 × 900) |
| `desktop_open.png` | the form, 「問題を報告」: the automatic screenshot with where / how / when (魚町一丁目, walking, evening, autumn), six categories with one example each, the note (desktop 1440 × 900) |
| `desktop_open_waiting.png` | the form the moment it opens: the screenshot of the view is still being taken (a placeholder with the screen's own shape; nothing below it moves when it arrives) (desktop 1440 × 900) |
| `desktop_privacy.png` | 「取り扱いの詳細」: the backend's privacy text inside the sheet, with a way back (desktop 1440 × 900) |
| `desktop_restored_view.png` | the app opened from a report's ?cam= link: the camera is exactly where the contributor was (same time of day and season) |
| `desktop_submitting.png` | sending over a slow network: the progress bar, 「やめる」, the send button locked (desktop 1440 × 900) |
| `desktop_success.png` | thank-you: still pending, what it may earn, where to go next (desktop 1440 × 900) |
| `desktop_toolbar_1440.png` | the HUD toolbar with the new pill 「修正を報告」 left of the quality menu; no other control moved |
| `desktop_toolbar_721.png` | from 721 to 839 px the round button drops under the search / map / drive row (the toolbar fills the width up to the wordmark) |
| `desktop_toolbar_800.png` | at 800 px the pill is a round flag button left of the quality menu |
| `desktop_transfer.png` | 別の端末に引き継ぐ: the code XXXXX-XXXXX, the countdown, the QR code of the link, copy / close, and the field to enter a code (desktop 1440 × 900) |
| `landscape_board.png` | 貢献ランキング: rank, nickname, accepted count and points; my row is marked 「あなた」 (phone 844 × 390) |
| `landscape_en_open.png` | the same sheet in English (phone 844 × 390) |
| `landscape_erased.png` | after 「送ったデータをすべて削除」: the backend has lost this contributor; the confirmation is at the top, nothing more to delete (phone 844 × 390) |
| `landscape_error.png` | an offline error under the form in plain words, 「もういちど送る」; the report and its photo are kept (phone 844 × 390) |
| `landscape_filled.png` | the form filled in: category, note, two photos with their remove buttons (phone 844 × 390) |
| `landscape_filled_end.png` | the bottom of the form: nickname, クルーNo. (optional, and why), the points copy, the one-line privacy summary, the consent box, the send bar (phone 844 × 390) |
| `landscape_fix.png` | 「現地の写真で直す」 selected: one line says photos taken on the spot carry their location; the photos label asks for at least one (phone 844 × 390) |
| `landscape_mine.png` | マイ投稿: total points and rank, nickname and クルーNo., four reports in four states (確認待ち, 採用 +5pt, 反映済み（v0.2.0）+20pt with "live for everyone", 見送り), then the transfer and delete sections (phone 844 × 390) |
| `landscape_night_open.png` | the sheet over the night view (its screenshot is the night scene, the chip says 夜) (phone 844 × 390) |
| `landscape_open.png` | the form, 「問題を報告」: the automatic screenshot with where / how / when (魚町一丁目, walking, evening, autumn), six categories with one example each, the note (phone 844 × 390) |
| `landscape_open_waiting.png` | the form the moment it opens: the screenshot of the view is still being taken (a placeholder with the screen's own shape; nothing below it moves when it arrives) (phone 844 × 390) |
| `landscape_privacy.png` | 「取り扱いの詳細」: the backend's privacy text inside the sheet, with a way back (phone 844 × 390) |
| `landscape_submitting.png` | sending over a slow network: the progress bar, 「やめる」, the send button locked (phone 844 × 390) |
| `landscape_success.png` | thank-you: still pending, what it may earn, where to go next (phone 844 × 390) |
| `landscape_transfer.png` | 別の端末に引き継ぐ: the code XXXXX-XXXXX, the countdown, the QR code of the link, copy / close, and the field to enter a code (phone 844 × 390) |
| `portrait_board.png` | 貢献ランキング: rank, nickname, accepted count and points; my row is marked 「あなた」 (phone 390 × 844) |
| `portrait_claim_second_device.png` | a second device opened from the QR link: マイ投稿 with the code already filled in and the hint |
| `portrait_claimed.png` | after 「引き継ぐ」 on the second device: the confirmation, the earlier reports, the nickname and the points are here |
| `portrait_en_open.png` | the same sheet in English (phone 390 × 844) |
| `portrait_erase_confirm.png` | the delete question: what goes, that it cannot be undone, 「削除する」 and 「やめる」 (focused) (phone 390 × 844) |
| `portrait_error.png` | an offline error under the form in plain words, 「もういちど送る」; the report and its photo are kept (phone 390 × 844) |
| `portrait_filled.png` | the form filled in: category, note, two photos with their remove buttons (phone 390 × 844) |
| `portrait_filled_end.png` | the bottom of the form: nickname, クルーNo. (optional, and why), the points copy, the one-line privacy summary, the consent box, the send bar (phone 390 × 844) |
| `portrait_fix.png` | 「現地の写真で直す」 selected: one line says photos taken on the spot carry their location; the photos label asks for at least one (phone 390 × 844) |
| `portrait_mine.png` | マイ投稿: total points and rank, nickname and クルーNo., four reports in four states (確認待ち, 採用 +5pt, 反映済み（v0.2.0）+20pt with "live for everyone", 見送り), then the transfer and delete sections (phone 390 × 844) |
| `portrait_night_open.png` | the sheet over the night view (its screenshot is the night scene, the chip says 夜) (phone 390 × 844) |
| `portrait_open.png` | the form, 「問題を報告」: the automatic screenshot with where / how / when (魚町一丁目, walking, evening, autumn), six categories with one example each, the note (phone 390 × 844) |
| `portrait_open_waiting.png` | the form the moment it opens: the screenshot of the view is still being taken (a placeholder with the screen's own shape; nothing below it moves when it arrives) (phone 390 × 844) |
| `portrait_privacy.png` | 「取り扱いの詳細」: the backend's privacy text inside the sheet, with a way back (phone 390 × 844) |
| `portrait_submitting.png` | sending over a slow network: the progress bar, 「やめる」, the send button locked (phone 390 × 844) |
| `portrait_success.png` | thank-you: still pending, what it may earn, where to go next (phone 390 × 844) |
| `portrait_transfer.png` | 別の端末に引き継ぐ: the code XXXXX-XXXXX, the countdown, the QR code of the link, copy / close, and the field to enter a code (phone 390 × 844) |

## Not done

- **Not deployed.** `CONTRIB_API` is `''` until [DEPLOY.md](DEPLOY.md) points it at a service whose `/api/contrib/v1/health` answers. With `?contrib=1` the sheet opens and says reports are not open yet; it does not try the network.
- **The deletion contact** (`CONTRIB_CONTACT` in `contrib-lib.js`) is empty: the team has no address yet. The privacy notice's last line appears when it is set.
- **Legal review of the privacy text** (and the DMO's say on handing the クルーNo. to 気仙沼地域戦略) is the team's; the app shows the backend's text word for word.
- **Real devices.** Everything was run in headless Chrome with phone emulation (touch events, DPR 2, safe-area insets). Not tried on a real iPhone or Android phone: the on-screen keyboard lift (`visualViewport`), `capture="environment"` opening the camera, a HEIC photo's thumbnail (it shows the type instead where the browser cannot decode it), the clipboard button, a phone camera reading the QR code (the encoder was verified with CoreImage and python-qrcode; the e2e checks the code and the QR path equal the encoder's output).
- **Large uploads on a slow mobile network** go up in one request (up to 6 × 15 MB + the screenshot). A failure resends everything; the Idempotency-Key only stops a duplicate, there is no resumable upload.
- **No lazy loading.** The sheet's code, CSS and strings (+129 KB minified) are part of the main bundle and the sheet is mounted with the HUD; loading them on the first open would save that parse at start-up.
- **The admin page's link into the app** (`?cam=` from a stored pose) is the backend's to build; this document gives the format. Photo mode's PNG pose chunk has a reader (`readPngPose`) but no tool uses it yet.
- **The app's own start-up layout shift** (0.04 to 0.17, the departures board while the page loads, measured by the e2e and not counted against the sheet) is older than this feature and was not touched.
