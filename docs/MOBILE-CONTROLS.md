# Mobile controls (the touch pad)

On a phone the town is played like a mobile game: a floating thumbstick on the left, a drag-look on the right and a
context action cluster in an arc at the bottom right. Code: `src/anime/ui/touchpad.js` (logic) and
`src/anime/ui/touchpad-style.js` (CSS). Strings: `data/ui-touch-i18n.json` (`ja` default, `en`). Tests:
`test/mobile-pad.test.js` (pure parts) and `test/mobile-pad.e2e.test.js` (headless Chrome, real touches).

## When it is on

| Condition | Pad |
|---|---|
| `(pointer: coarse)` matches (a phone or tablet) | on |
| any `touchstart` on a device that did not match (a touch laptop) | on from then on |
| `?touch=1` | on (desktop testing; the stick needs real touches, the buttons also work with a mouse) |
| `?touch=0` | forced off (touches do nothing) |

Keyboard and mouse never go through the pad. With the pad off, the page is exactly the desktop page.

## Layout per mode

Thumbs rest on the lower half of the screen: the stick on the left, the look on the right, the buttons in an arc at the
bottom right. The mode chip (top left) switches 歩く / 飛ぶ / 運転; the gear beside it opens the settings.

### Walk (歩く)

Primary ジャンプ (orange), then ダッシュ (toggle), 飛ぶ, and 乗る (near a road the car can start on) or 入る (near an
interior door; 出る inside).

| Portrait | Landscape | Stick past 85 % (run) |
|---|---|---|
| ![walk, portrait](shots/mobile/walk_portrait.png) | ![walk, landscape](shots/mobile/walk_landscape.png) | ![walk, running](shots/mobile/walk_portrait_stick_run.png) |

### Fly (飛ぶ)

Primary 上昇 (hold), then 下降 (hold), 加速 (hold) and 歩く (land). Stick is still the horizontal move; the buttons are
the vertical axis and the boost.

| Portrait | Landscape | 上昇 held |
|---|---|---|
| ![fly, portrait](shots/mobile/fly_portrait.png) | ![fly, landscape](shots/mobile/fly_landscape.png) | ![fly, rising](shots/mobile/fly_portrait_rise.png) |

### Drive (運転)

Stick: up is throttle, down is reverse, left and right steer. Primary ブレーキ (hold, handbrake), then ブースト (hold)
and 降りる. A speed chip shows above the dock and the pad lifts clear of it. A drag on the right looks around from the
chase camera.

| Portrait | Landscape | ブースト held |
|---|---|---|
| ![drive, portrait](shots/mobile/drive_portrait.png) | ![drive, landscape](shots/mobile/drive_landscape.png) | ![drive, boost](shots/mobile/drive_landscape_boost.png) |

### Other screens

| First-run coach mark | Settings | Left-handed | English |
|---|---|---|---|
| ![coach](shots/mobile/coach_portrait.png) | ![settings](shots/mobile/settings_portrait.png) | ![left-handed](shots/mobile/walk_portrait_lefthanded.png) | ![en](shots/mobile/en_walk_portrait.png) |

## Gestures

| Gesture | Where | Result |
|---|---|---|
| Touch and drag | lower 75 % of the left half | floating stick: the base appears under the thumb, the knob follows, release springs home |
| Push past 85 % of the travel | stick | run / boost / fast flight (coral ring, tag 走る or ブースト) |
| Drag | anywhere else that is not a button | look (0.008 rad per CSS px, pitch clamped to 85 degrees) |
| Tap | a button | action; `hold` buttons stay active while the finger is down, `toggle` buttons flip |
| Tap | places strip, time dock, minimap, mode chip | the panel's own click (a tap is a touch that moves 10 CSS px or less) |
| Drag that starts on a panel | the same panels | after 10 CSS px the pad takes it (stick or look, by where it landed); the panel sees no click |
| Several fingers | everywhere | each touch keeps its identifier: move, look and buttons at the same time |
| Pinch, double-tap | anywhere | blocked (no browser zoom) |

## Settings

The gear next to the mode chip. Stored in `localStorage` key `klc.pad.v1` (inside try/catch, so private mode simply forgets).

| Setting | Effect |
|---|---|
| 左手モード (left-handed) | swaps the sides: stick on the right, look on the left, buttons arc at the bottom left |
| 視点の上下を反転 (invert Y) | flips the vertical look direction (flight-stick style) |
| 視点の感度 (sensitivity) | multiplies the look speed, 0.5 to 1.8 |

## Details

- **Left: floating stick.** A ghost ring rests bottom-left. A thumb landing anywhere in the lower 75 % of the left half puts
  the base under it; the knob follows (56 CSS px of travel, scaled to 0.8 to 1.15 by screen size). 12 % dead zone, eased
  (smoothstep) magnitude. Past 85 % of the travel the ring turns coral and the tag says 走る (on foot) or ブースト (in a
  car): that is RUN / BOOST / fast flight. The knob springs home on release.
- **Right: look.** Drag anywhere that is not a button: 0.008 rad per CSS px (about 85 degrees for a 190 px swipe; times the sensitivity setting, 0.5 to 1.8), light smoothing
  (35 ms), pitch clamped to 85 degrees by the player. The top quarter of the stick's half also looks.
- **Thumbs on panels.** A touch that lands on the places strip, the time dock, the credit line, the minimap or the mode chip
  is a tap until it moves more than 10 CSS px; then the pad takes it (the stick or the look, by where it landed) and the
  panel never sees a click. A strip that scrolls sideways keeps a drag along its axis. Inputs and the settings keep theirs.
- **Multi-touch.** Every touch keeps its identifier: stick, look and buttons work at once.
- **Buttons** (right bottom, an arc around a big primary button, 56 px or more, SVG icon plus short JA label, a pressed
  state, `navigator.vibrate(8)` where supported):

| Mode | Buttons (first is the primary) |
|---|---|
| walk | ジャンプ, ダッシュ (toggle), 飛ぶ, and 乗る (near a road the car can start on) or 入る (near an interior door; 出る inside) |
| fly | 上昇 (hold), 下降 (hold), 加速 (hold), 歩く (land) |
| drive | ブレーキ (hold, handbrake), ブースト (hold), 降りる |

- **Top left: mode chip** 歩く / 飛ぶ / 運転 (quick switch) and a settings button: 左手モード (swap sides, persisted),
  視点の上下を反転 (invert Y) and 視点の感度 (look sensitivity). Settings live in `localStorage` key `klc.pad.v1`
  (inside try/catch: private mode just forgets).
- **First run:** a coach mark 「左で移動・右で視点」, dismissible, shown once.
- **Hidden** during the intro card, the auto tour and its flights, the tiny planet, photo mode and cinematic mode
  (`body.noui | shot | klc-photo | cinematic | film`). **Fades** to 35 % after 4 s without a touch; any touch restores it
  at once.
- **iOS hardening:** `touch-action: none` on the canvas and the pad, `preventDefault` on touchmove (scrollable panels
  excepted), `gesturestart|change|end` blocked, double-tap zoom blocked, viewport `maximum-scale=1, user-scalable=no`,
  `-webkit-touch-callout: none`, `user-select: none`, `dvh` / `svh` for the height and `env(safe-area-inset-*)` on every
  edge, re-laid out on resize, rotation and when a panel changes size.
- **Layout.** The pad measures the dock, the places strip, the credit line and the car's speed chip and lifts the
  cluster and the ghost stick clear of them; the mode chip sits under the brand and the minimap. While the pad is on
  (`body.klc-pad`) `touchpad-style.js` re-seats a few existing panels per orientation (minimap, search / map buttons).
  `test/mobile-pad.e2e.test.js` measures every pad rectangle against every panel in portrait (390x844) and landscape
  (844x390).

## iOS notes

See the `iOS hardening` bullet above. In addition: Safari ignores `user-scalable=no` for accessibility, so the pad also blocks
`gesturestart|change|end` and the double-tap; the canvas and the pad use `touch-action: none`; heights use `dvh` / `svh` so
the collapsing URL bar does not move the buttons; every edge reads `env(safe-area-inset-*)` (the home indicator and the
notch in landscape). Haptics (`navigator.vibrate`) do nothing on iPhone Safari, so the pressed state carries the feedback.
A phone-tier build (smaller atlas, forced on touch devices) keeps the page inside iOS's memory limit.

## Game API

```js
const pad = ctx.pad;                    // also window.__pad

pad.move            // THREE.Vector2: x right, y down, length 0..1 (dead zone out, eased). player.touchMove returns it
pad.running         // the stick is past 85 %
pad.takeLook(dt)    // { dx, dy } radians for this frame; finger right = dx > 0, finger down = dy > 0
pad.isDown('brake') // is a hold button down
pad.vertical        // +1 while 上昇, -1 while 下降;  pad.dash  the ダッシュ toggle;  pad.brake / pad.boost
pad.mode            // 'walk' | 'fly' | 'drive' | a registered name
pad.hidden          // true while the pad is out of the way (intro, tours, photo)
pad.suppress('why', true | false)   // hide the pad for your own reason (a cutscene)
pad.on((e) => ...)  // { type: 'down' | 'up' | 'action' | 'mode' | 'settings', id, mode }; returns the off function
```

`Player.attachPad(pad)` (main.js) makes the player consume `pad.move`, `pad.takeLook()` and the `action` events `jump`,
`fly`, `land`; `player.touchMove` is kept as a getter for older callers. `drive.js` reads `ctx.pad.move`
(throttle = -y, steer = x), the ブレーキ and ブースト buttons, and gives the touch look to the chase camera
(`player.lookSink`). `drive.canEnter(r)` tells the 乗る button whether a road is within `r` metres.

### Registering a mode (the sail mode of 第一昭福丸)

```js
pad.registerMode('sail', {
  stick: 'none',                                // 'analog' (default) or 'none': with 'none' every touch looks
  buttons: [                                    // the first one is the big primary button; up to 7 fit the arc
    { id: 'stop', label: '停止', icon: 'brake', onDown: () => sail.stop() },
    { id: 'auto', label: '自動操船', icon: 'boost', toggle: true, onDown: (pad, on) => sail.auto(on) },
    { id: 'x4', label: '4×', icon: 'dash', hold: true, onDown: () => sail.speed(4), onUp: () => sail.speed(1) },
    { id: 'home', label: '町へ戻る', icon: 'land', onDown: () => sail.home() },
  ],
  onEnter: (pad) => {}, onExit: (pad) => {},    // optional
});
pad.setMode('sail');      // show it; the pad no longer follows the player / car by itself
pad.setMode('walk');      // (or null, or 'auto') hand the buttons back: walk / fly / drive follow the game again
```

A button is `{ id, label, icon, hold?, toggle?, visible?, onDown, onUp }`.

- `label`: a string, `{ ja, en }`, a function returning either, or one of the pad's `touch.*` string keys.
- `icon`: a name from `ICONS` in `touchpad.js` (jump dash fly board enter leave up down boost land brake nitro getout walk
  car sliders) or raw `<svg>` markup. Use `currentColor` and a 24x24 viewBox.
- `hold`: the button is held while the finger is down (`pad.isDown(id)`, `onDown` on press, `onUp` on release).
  `toggle`: each tap flips it (`onDown(pad, on)`); the button shows the pressed state.
- `visible`: a function; polled each frame, the button pops in or out (its slot in the arc stays put).
- Every press also emits `{ type: 'down' | 'up', id, mode }` on `pad.on`.
- `registerMode` throws for the built-in names or duplicate ids; `setMode` throws for an unknown name.
- Language: the pad follows the HUD's (`ctx.services.life.hud.i18n.lang`).

Pitfall: the sail branch reads `player.touchMove`; with the pad attached that is `pad.move`, so the stick keeps working
there without changes.

## How to test

By hand on a desktop: open `http://localhost:<port>/?touch=1` (add `&lang=en` for English). The buttons work with a mouse;
the stick and look need real touches, so use Chrome DevTools device mode or the CDP test below. `?touch=0` forces the pad off.

```sh
env -u NODE_OPTIONS bun test test/mobile-pad.test.js                          # pure parts, fast (also part of bun test)
tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 bun test test/mobile-pad.e2e.test.js   # headless Chrome, port 8981
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/pad-shots.mjs [--only walk,fly,drive,coach,settings] [--q lang=en --prefix en_]
```

`bun test` alone skips the end-to-end file (it needs the Chrome lock). The e2e test is an iPhone-shaped page (390x844 at
DPR 3, `mobile`, iPhone UA, touch emulation, `Emulation.setSafeAreaInsetsOverride`) and real touches through
`Input.dispatchTouchEvent`; helpers in `tools/anime/pad-lib.mjs`. In CDP a `touchEnd` lists the points that lift, the
others stay down.

Screenshots (`docs/shots/mobile/`, 390x844 and 844x390 at DPR 2 with iPhone safe-area insets): `walk_*`, `fly_*`,
`drive_*` in `portrait` and `landscape`; `*_stick_run` (the thumb past 85 %: coral ring and the 走る / ブースト tag),
`fly_*_rise` (上昇 held), `drive_*_boost`, `coach_*` (first-run mark), `settings_portrait`, `walk_portrait_lefthanded`,
and `en_walk_*` (English labels).
