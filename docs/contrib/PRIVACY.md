# Consent and privacy text / 同意とプライバシー

Version: 2026-10-05

This is the text the app shows in the report sheet (the consent checkbox and the 「取り扱いの詳細」 page), in Japanese and English. The version above is `PRIVACY_VERSION` in `server/contrib/config.js`; every submission records the version it was sent under (`client_json.consent.version`). **Change both together** whenever the wording changes.

Before launch: replace `{{CONTACT}}` below with the team's real contact address or form (this repository does not name one), and have the text reviewed by the team and the DMO. It is a plain-language notice drafted for the project, not legal advice; it describes handing the クルーNo. to 気仙沼地域戦略, which is a provision to a third party under Japan's personal-information law and deserves a proper review.

The sections under "日本語" and "English" are written to be copied key by key into `data/ui-contrib-i18n.json`: each `###` heading is the key and the text below it is the value (`privacy.items` is an ordered list; each item starts with a bold title).

---

## 日本語 (ja)

### consent.label
投稿内容と写真の取り扱い(プライバシー)に同意して送信します

### consent.link
取り扱いの詳細

### privacy.summary
写真と撮影場所は公開されません。3Dの街を実際に近づけるためにだけ使います。

### privacy.title
投稿の取り扱いについて

### privacy.intro
「気仙沼 Living City」は、現地の方や訪れた方からの「ここが実際と違う」という報告で、3Dの街を実際の気仙沼に近づけていくプロジェクトです。報告を送る前に、次の内容をご確認ください。同意いただけない場合は送信せずに閉じてください(街の閲覧はそのままご利用いただけます)。

### privacy.items
1. **集める情報** ニックネーム、(任意で)クルーNo.、メモ、添付した写真と、その写真に含まれる撮影位置・撮影日時・向き・カメラの種類などの情報(EXIF)、報告時の画面のスクリーンショットと視点(カメラの位置・向き・時間帯など)、ご利用の端末・ブラウザの種類を送信・保存します。氏名・メールアドレス・電話番号は求めず、IPアドレスも保存しません。
2. **使う目的** 3Dモデルの誤りを見つけて直し、街の再現の精度を上げるためにだけ使います。広告など、ほかの目的には使いません。
3. **公開しません** 写真と正確な撮影位置は公開しません。運営チームが内部でのみ確認・分析します。公開されるのは、貢献ランキングに表示されるニックネームとポイントだけです。
4. **顔・ナンバープレート** 写真に写り込んだ人の顔や車のナンバープレートを、公開する画像・資料に使うことはありません。必要な場合は判別できないように加工します。
5. **利用の許諾** 送信いただいた写真・スクリーンショット・メモについて、街の3Dモデルを改善する目的で利用することを、本プロジェクトに対して非独占的に許諾していただきます。著作権はあなたに残ります。
6. **クルーNo.について** 入力は任意です。入力した場合は、クルーのポイントプレゼント等の特典をお送りする目的にのみ使い、特典の発行のために気仙沼地域戦略に提供します。ほかの目的には使いません。入力しなくても投稿できます。
7. **削除のご依頼** ご希望があれば、あなたが送ったデータ(投稿・写真・ニックネーム・クルーNo.)をいつでも削除します。削除後は運営側のデータから消えますが、すでに3Dモデルの修正に反映された内容は元に戻せない場合があります。
8. **保管** データはアクセスを制限した環境に保存し、運営メンバーだけが扱います。
9. **お子さま** 16歳未満の方は、保護者の方と一緒にご確認のうえ送信してください。

### privacy.contact
削除のご依頼・お問い合わせ: {{CONTACT}}

---

## English (en)

### consent.label
I agree to how my report and photos are handled (privacy) and want to send it

### consent.link
How your report is handled

### privacy.summary
Photos and locations are never made public. They are used only to correct the 3D city.

### privacy.title
How your report is handled

### privacy.intro
"Kesennuma Living City" brings the 3D town closer to the real Kesennuma with reports from residents and visitors of what is different on site. Please read this before you send a report. If you do not agree, close the sheet without sending (you can keep exploring the city).

### privacy.items
1. **What we collect** Your nickname, optionally your クルーNo., your note, the photos you attach together with the information inside them (EXIF: where and when they were taken, direction, camera type), a screenshot of your view with the camera position and direction when you reported, and the type of device and browser you use. We do not ask for your name, e-mail address or phone number, and we do not store your IP address.
2. **Why** Only to find and correct mistakes in the 3D model and make the town more accurate. Not for advertising or any other purpose.
3. **Never public** Photos and exact locations are never published. Only the project team looks at them, internally. The only things made public are the nickname and points shown on the contribution ranking.
4. **Faces and number plates** Faces of people and vehicle number plates visible in a photo will not be used in anything we publish. If a photo ever has to be shown, they are made unrecognisable first.
5. **Licence** You grant the project a non-exclusive licence to use the photos, screenshots and notes you send in order to improve the 3D model of the town. You keep the copyright.
6. **Your クルーNo.** Entering it is optional. If you enter it, it is used only to send Crew rewards such as point-present coupons, and is passed to 気仙沼地域戦略 (Kesennuma Regional Strategy) for issuing them. It is not used for anything else. You can report without it.
7. **Deletion on request** On request we delete everything you sent (reports, photos, nickname and クルーNo.), at any time. After deletion it is gone from our data; changes already made to the 3D model from your report may not be reversible.
8. **Storage** Data is kept in an access-controlled environment and handled only by the team.
9. **Children** If you are under 16, please read this together with a parent or guardian before sending.

### privacy.contact
To ask for deletion or with any question: {{CONTACT}}

---

## How the service keeps these promises

| Promise | In the service |
| --- | --- |
| Photos and locations are never public | Files are served only through the admin-only `/admin/files/...` route and only if they belong to a submission. The public leaderboard returns nickname, count and points; `GET /me` returns the contributor's own data. Preview images carry no metadata. The pipeline feed is admin-only. |
| Exact locations are internal | EXIF position, ENU and heading are stored per photo and shown only in the admin page and the admin feed. |
| What is collected | Exactly the fields in `POST /submissions` and `POST /contributors`, plus a user-agent string cut to 200 characters. **No IP address** is stored (rate limits keep addresses in memory only) and none is logged. EXIF is read through a whitelist: serial numbers, owner and artist names, comments and maker notes are not read. |
| Faces and number plates | A team commitment, not something software can enforce: never publish a contributor's photo as is. The originals stay in private storage. |
| Licence | The consent version is stored with every submission. The licence text is item 5 above. |
| Deletion on request | `DELETE /me?confirm=1` (the contributor) and the admin page (a submission, or a contributor with everything) remove the rows and the files and add an audit entry that contains no personal data. The file keys are queued in the same database transaction, so a file the store cannot delete right away is retried until it is gone instead of being forgotten. Copies pulled to a team member's machine with `tools/contrib/pull.mjs` are removed with `pull.mjs --prune`. |
| クルーNo. only for rewards | Stored only on the contributor row; returned only to its owner (`GET /me`), masked in the admin detail, left out of the leaderboard and the pipeline feed, and written in full only in the admin-only crew CSV that the team sends to the DMO. |
| Access-controlled storage | Private volume or private bucket; contributor secrets and transfer codes are stored only as keyed hashes; the admin token is compared in constant time. |

Decisions for the team (not set by the software): how long originals are kept after the last release that used them; who may open the admin page; how deletion requests reach the team (the contact above).
