// Contributor backend: the public API (contributors, profile, account transfer, submissions, leaderboard, health).
// Contract: docs/contrib/API.md. Every route here is under /api/contrib/v1.
import { VERSION } from "./config.js";
import { HttpError, badRequest, forbidden, tooMany, json, readJson } from "./http.js";
import { ingestSubmission } from "./ingest.js";
import { toMine } from "./repo.js";
import { cleanNickname, normalizeCrewNo, defaultNickname, normalizeTransferCode, formatTransferCode, parseIntParam, NOTE_MAX } from "./validate.js";
import { iso, randomId, randomBase32 } from "./util.js";

export const API = "/api/contrib/v1";

/** How long a transfer code stays valid. */
export const TRANSFER_CODE_TTL_MS = 15 * 60 * 1000;
/** Tokens (devices) one contributor may hold, including the first. */
export const MAX_DEVICES = 10;

const HOUR = 3600_000;

/** GET /health */
function health(c) {
  let ok = false;
  try { ok = c.repo.ping(); } catch { ok = false; }
  const { config } = c;
  return json({
    ok, service: "kesennuma-contrib", version: VERSION, storage: c.storage.kind, time: iso(c.now()),
    // what the report sheet may check before it uploads (the operator can change these), so the app need not hard-code them
    limits: { maxPhotos: config.maxPhotos, maxPhotoBytes: config.maxPhotoBytes, maxScreenshotBytes: config.maxShotBytes, maxNoteChars: NOTE_MAX, dailyLimit: config.dailyLimit },
    points: { issue: config.points.issue, fix: config.points.fix },
  }, ok ? 200 : 503);
}

/** The body of GET /me (also returned by PATCH /me). */
function meBody(c) {
  const u = c.user;
  const { points, accepted } = c.repo.pointsOf(u.id);
  return {
    contributorId: u.id, nickname: u.nickname, crewNo: u.crew_no, createdAt: u.created_at, banned: Boolean(u.banned),
    points, pointsTotal: points, accepted, rank: c.repo.rankOf(u.id),
    submissions: c.repo.listMine(u.id).map(toMine),
  };
}

/** POST /contributors {nickname?, crewNo?} -> 201 {contributorId, token, nickname} */
async function createContributor(c) {
  const lim = c.counter.take(`create:${c.ip}`, c.config.limits.createPerHourIp, HOUR);
  if (!lim.ok) throw tooMany(lim.retryAfterMs, "rate_limited", "too many new contributors from this network, try again later");
  const body = await readJson(c.req);
  const nick = cleanNickname(body.nickname); if (!nick.ok) throw badRequest(nick.error, nick.message);
  const crew = normalizeCrewNo(body.crewNo); if (!crew.ok) throw badRequest(crew.error, crew.message);
  const id = randomId(12);
  const t = c.auth.newToken(id);
  const nickname = nick.value ?? defaultNickname(id);
  c.repo.createContributor({ id, secretHash: t.hash, nickname, crewNo: crew.value, nowIso: iso(c.now()) });
  return json({ contributorId: id, token: t.token, nickname }, 201);
}

/** POST /contributors/claim {code} -> 200 {contributorId, token, nickname}: a new token for the same contributor. */
async function claim(c) {
  const lim = c.counter.take(`claim:${c.ip}`, c.config.limits.claimPerHourIp, HOUR);
  if (!lim.ok) throw tooMany(lim.retryAfterMs, "rate_limited", "too many code attempts from this network, try again later");
  const body = await readJson(c.req);
  const code = normalizeTransferCode(body.code); if (!code.ok) throw badRequest(code.error, code.message);
  const codeHash = c.auth.hashCode(code.value);
  const nowIso = iso(c.now());
  const notFound = () => new HttpError(404, "code_not_found", "this code is wrong, expired or already used");
  const cid = c.repo.peekTransferCode(codeHash, nowIso);
  const owner = cid ? c.repo.getContributor(cid) : null;
  if (!owner) throw notFound();
  if (owner.banned) throw forbidden("banned", "this contributor can no longer be used");
  if (c.repo.countDeviceTokens(cid) >= MAX_DEVICES) throw new HttpError(409, "too_many_devices", `an account can be used on at most ${MAX_DEVICES} devices`);
  if (c.repo.consumeTransferCode(codeHash, nowIso) !== cid) throw notFound(); // another request used it first
  const t = c.auth.newToken(cid);
  c.repo.addDeviceToken(cid, t.hash, nowIso);
  return json({ contributorId: cid, token: t.token, nickname: owner.nickname });
}

/** GET /me */
function getMe(c) { return json(meBody(c)); }

/** PATCH /me {nickname?, crewNo?}: an omitted key is left alone; nickname "" / null resets it; crewNo "" / null removes it. */
async function patchMe(c) {
  const body = await readJson(c.req);
  const patch = {};
  if (Object.hasOwn(body, "nickname")) {
    const r = cleanNickname(body.nickname); if (!r.ok) throw badRequest(r.error, r.message);
    patch.nickname = r.value ?? defaultNickname(c.user.id);
  }
  if (Object.hasOwn(body, "crewNo")) {
    const r = normalizeCrewNo(body.crewNo); if (!r.ok) throw badRequest(r.error, r.message);
    patch.crewNo = r.value;
  }
  if (Object.keys(patch).length) {
    c.repo.updateProfile(c.user.id, patch);
    c.user = c.repo.getContributor(c.user.id);
  }
  return json(meBody(c));
}

/** DELETE /me?confirm=1: erase the contributor and everything they sent (privacy: deletion on request). */
async function deleteMe(c) {
  if (c.query.get("confirm") !== "1") throw badRequest("confirm_required", "add ?confirm=1 to erase this contributor and all their submissions");
  const { deleted, keys } = c.repo.deleteContributor(c.user.id, iso(c.now()));
  const { removed, failed } = await c.purge(keys);
  c.repo.audit({ at: iso(c.now()), actor: "contributor", action: "contributor.self_delete", target: c.user.id, detail: { files: keys.length, leftover: failed } });
  return json({ ok: deleted, deletedFiles: removed });
}

/** GET|POST /me/transfer-code -> {code, expiresAt, expiresInSeconds}: a short human code to sign in on another device. */
function transferCode(c) {
  if (c.user.banned) throw forbidden("banned", "this contributor can no longer be used");
  const lim = c.counter.take(`transfer:${c.user.id}`, c.config.limits.transferCodesPerHour, HOUR);
  if (!lim.ok) throw tooMany(lim.retryAfterMs, "rate_limited", "too many transfer codes requested, try again later");
  const code = randomBase32(10);
  const expires = c.now() + TRANSFER_CODE_TTL_MS;
  c.repo.createTransferCode({ contributorId: c.user.id, codeHash: c.auth.hashCode(code), nowIso: iso(c.now()), expiresIso: iso(expires) });
  return json({ code: formatTransferCode(code), expiresAt: iso(expires), expiresInSeconds: TRANSFER_CODE_TTL_MS / 1000 });
}

/** POST /me/sign-out-others -> {ok, revoked}: every other device's token (and any open transfer code) stops working. */
function signOutOthers(c) {
  const revoked = c.repo.keepOnlyToken(c.user.id, c.user.token_hash);
  return json({ ok: true, revoked });
}

/** GET /leaderboard?limit=20 -> [{nickname, accepted, points}]. With a valid contributor token the caller's row also has `me: true`. */
function leaderboard(c) {
  const limit = parseIntParam(c.query.get("limit"), 20, 1, 100);
  const rows = c.repo.leaderboard(limit).map((r) => ({ nickname: r.nickname, accepted: r.accepted, points: r.points }));
  if (c.user) {
    const rank = c.repo.rankOf(c.user.id);
    if (rank && rank <= rows.length) rows[rank - 1].me = true;
  }
  return json(rows);
}

/** @type {Array<{method: string, path: string, label: string, auth: "user" | "optional" | null, limit?: false, handler: Function}>} */
export const publicRoutes = [
  { method: "GET", path: `${API}/health`, label: "health", auth: null, limit: false, handler: health },
  { method: "POST", path: `${API}/contributors`, label: "contributors.create", auth: null, handler: createContributor },
  { method: "POST", path: `${API}/contributors/claim`, label: "contributors.claim", auth: null, handler: claim },
  { method: "GET", path: `${API}/me`, label: "me.get", auth: "user", handler: getMe },
  { method: "PATCH", path: `${API}/me`, label: "me.patch", auth: "user", handler: patchMe },
  { method: "DELETE", path: `${API}/me`, label: "me.delete", auth: "user", handler: deleteMe },
  { method: "GET", path: `${API}/me/transfer-code`, label: "me.transfer_code", auth: "user", handler: transferCode },
  { method: "POST", path: `${API}/me/transfer-code`, label: "me.transfer_code", auth: "user", handler: transferCode },
  { method: "POST", path: `${API}/me/sign-out-others`, label: "me.sign_out_others", auth: "user", handler: signOutOthers },
  { method: "POST", path: `${API}/submissions`, label: "submissions.create", auth: "user", handler: ingestSubmission },
  { method: "GET", path: `${API}/leaderboard`, label: "leaderboard", auth: "optional", handler: leaderboard },
];
