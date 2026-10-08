# kesennuma-multi

The maintainer deploys this. The play-multi code does not deploy itself.

A separate Railway service from the town app. It relays poses for 「みんなであそぶ」. It stores nothing: no database, no volume, no accounts, no names, no chat.

## Service

- Name: `kesennuma-multi`
- Root directory: `server/multi`
- Builder: Dockerfile (`server/multi/Dockerfile`)
- Health check: `GET /health` (also `/healthz`). Expect `200` and `{"ok":true,...}`.
- Port: Railway's `PORT` (the image defaults to 8080).
- Websocket path: `/ws`

Do not attach a disk. Do not set a database URL. A restart empties every room; that is the design (room codes expire, nothing is kept).

## Environment

| Name | Required | Meaning |
|---|---|---|
| `PORT` | set by Railway | listen port |
| `ALLOWED_ORIGINS` | yes, in production | comma-separated page origins, exact match |

Production value:

```
ALLOWED_ORIGINS=https://kesennuma-living-city-production.up.railway.app
```

When `ALLOWED_ORIGINS` is unset, the process also accepts `http://localhost` and `http://127.0.0.1` (any port) so a local page can reach a local relay. A set list does **not** add localhost. Add a local origin only for a rehearsal, then remove it.

No other origin. A page on any other host gets `403` on the upgrade and the socket never opens.

## Limits (already in the code)

- 4-character room code, alphabet without ambiguous glyphs, at most 8 players, at most 200 rooms
- messages over 512 bytes are dropped and the socket is closed
- 30 messages per second per socket; the rest are ignored
- a socket with nothing to say for 10 minutes is closed; an empty room is removed at once
- relay snapshot at 15 Hz: id, mode, pose, vehicle, look, colour. No names.

## After the URL exists

The page reads `MULTI_WS` in `src/anime/play/multi/endpoint.js`. It is `wss://kesennuma-multi-production.up.railway.app/ws`. A page on localhost still connects to `ws://localhost:9505/ws`. `?ws=` may name localhost, or the same host as `MULTI_WS`.

## Start

Working directory is `server/multi`. The image already sets that.

```
bun index.js
```

Railway runs the Dockerfile `CMD ["bun", "index.js"]` as user `bun`. `ENV PORT=8080` is the default; Railway overrides `PORT`. There is no start script, no database, and no disk.

Local rehearsal (the play lane uses 9505; stop it when you are done):

```
cd server/multi && PORT=9505 bun index.js
curl -s localhost:9505/health
```

## Smoke test

Two clients, one room, then the code is gone. Run it locally before the deploy, and again against the deployed URL. Do not treat `rooms: 0` as a pass on the shared service: other people may be in a room.

Local (starts its own relay on a free port and stops it):

```
env -u NODE_OPTIONS bun server/multi/smoke.mjs
```

Deployed (replace the host with the Railway URL for `kesennuma-multi`):

```
env -u NODE_OPTIONS bun server/multi/smoke.mjs \
  --ws wss://<kesennuma-multi-host>/ws \
  --origin https://kesennuma-living-city-production.up.railway.app
```

Pass looks like this:

1. `GET /health` returns `{"ok":true,...}`.
2. Client A creates a room. The code is 4 characters from `ACDEFHJKMNPQRTUVWXY3479`.
3. Client B joins that code. A sees one peer.
4. A starts `car`. Both receive the same `go`.
5. Both leave. A third client that joins the old code gets an error, not a room.

The Origin on every socket is `ALLOWED_ORIGINS`. A wrong Origin gets `403` and the socket never opens.

## What the app does with it

The host starts a car course (`car`) or a race (`race`). Everyone in the room gets the same `go` time and counts down together. Finish times come back on a board of fish-and-colour labels, for that room only, and disappear with the room.

Other lanes call `ctx.services.multi.startTogether('car' | 'race')`, listen with `onTogether`, and report with `finishTogether(ms)`.
