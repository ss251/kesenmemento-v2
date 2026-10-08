// Contributor backend: every SQL statement lives here.
//
// `createRepo(db)` returns plain functions over a bun:sqlite Database. All values are bound as parameters (never
// concatenated); list filters are assembled from fixed fragments. Row shapes are converted to the camelCase JSON
// the API returns by the `to*` functions at the bottom, which is also where a field can be kept private: the
// public leaderboard and a contributor's own view never include another person's クルーNo. or reviewer notes.
import { parseJson } from "./util.js";

/** Public path prefix of the admin-only file route. */
export const FILES_PATH = "/api/contrib/v1/admin/files/";
export const fileUrl = (key) => (key ? FILES_PATH + key : null);

const ACCEPT_CLASS = "('accepted','used')";

/** Escape LIKE wildcards in a user search string. */
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/**
 * @param {import("bun:sqlite").Database} db
 */
export function createRepo(db) {
  const get = (sql, ...p) => db.query(sql).get(...p) ?? null;
  const all = (sql, ...p) => db.query(sql).all(...p);
  const run = (sql, ...p) => db.query(sql).run(...p);
  const tx = (fn) => db.transaction(fn)();

  // ------------------------------------------------------------------------------------------ contributors

  const repo = {
    /** SELECT 1: the health probe. */
    ping() { return get("SELECT 1 AS ok").ok === 1; },

    createContributor({ id, secretHash, nickname, crewNo, nowIso }) {
      run("INSERT INTO contributors (id, secret_hash, nickname, crew_no, created_at, last_seen, banned) VALUES (?, ?, ?, ?, ?, ?, 0)",
        id, secretHash, nickname, crewNo, nowIso, nowIso);
    },

    getContributor(id) { return get("SELECT * FROM contributors WHERE id = ?", id); },

    /** Secret hashes of the device tokens a contributor added by claiming a transfer code. */
    extraTokenHashes(id) {
      return all("SELECT secret_hash FROM contributor_tokens WHERE contributor_id = ?", id).map((r) => r.secret_hash);
    },

    addDeviceToken(contributorId, secretHash, nowIso) {
      run("INSERT INTO contributor_tokens (contributor_id, secret_hash, created_at) VALUES (?, ?, ?)", contributorId, secretHash, nowIso);
    },
    countDeviceTokens(contributorId) {
      return get("SELECT COUNT(*) AS n FROM contributor_tokens WHERE contributor_id = ?", contributorId).n + 1;
    },

    touchSeen(id, nowIso) { run("UPDATE contributors SET last_seen = ? WHERE id = ?", nowIso, id); },

    /** Update nickname and/or crew number; `undefined` leaves a field alone, `null` crewNo removes it. */
    updateProfile(id, { nickname, crewNo }) {
      if (nickname !== undefined) run("UPDATE contributors SET nickname = ? WHERE id = ?", nickname, id);
      if (crewNo !== undefined) run("UPDATE contributors SET crew_no = ? WHERE id = ?", crewNo, id);
    },

    setBanned(id, banned) { run("UPDATE contributors SET banned = ? WHERE id = ?", banned ? 1 : 0, id); },

    // transfer codes: one live code per contributor; the table holds only a keyed hash of the code
    createTransferCode({ contributorId, codeHash, nowIso, expiresIso }) {
      tx(() => {
        run("DELETE FROM transfer_codes WHERE contributor_id = ? AND used_at IS NULL", contributorId);
        run("DELETE FROM transfer_codes WHERE expires_at < ?", nowIso); // housekeeping
        run("INSERT INTO transfer_codes (code_hash, contributor_id, created_at, expires_at) VALUES (?, ?, ?, ?)", codeHash, contributorId, nowIso, expiresIso);
      });
    },
    /** The contributor a live (unused, unexpired) code belongs to, without consuming it. */
    peekTransferCode(codeHash, nowIso) {
      const r = get("SELECT contributor_id FROM transfer_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?", codeHash, nowIso);
      return r ? r.contributor_id : null;
    },
    /** Burn a code if it exists, is unused and unexpired; returns the contributor id (single use, atomic). */
    consumeTransferCode(codeHash, nowIso) {
      const r = get("UPDATE transfer_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING contributor_id", nowIso, codeHash, nowIso);
      return r ? r.contributor_id : null;
    },

    // -------------------------------------------------------------------------------------------- points

    /** Points total and accepted count (accepted + used) of one contributor. */
    pointsOf(contributorId) {
      const r = get(`SELECT COALESCE(SUM(points), 0) AS points, COUNT(*) AS accepted FROM submissions WHERE contributor_id = ? AND status IN ${ACCEPT_CLASS}`, contributorId);
      return { points: r.points, accepted: r.accepted };
    },

    /** The public leaderboard: nickname, accepted count and points only. Banned contributors are left out. */
    leaderboard(limit) {
      return all(`
        SELECT c.nickname AS nickname, COUNT(*) AS accepted, SUM(s.points) AS points
        FROM submissions s JOIN contributors c ON c.id = s.contributor_id
        WHERE s.status IN ${ACCEPT_CLASS} AND c.banned = 0
        GROUP BY c.id
        ORDER BY points DESC, accepted DESC, MIN(s.reviewed_at) ASC, c.id ASC
        LIMIT ?`, limit);
    },

    /** 1-based leaderboard position of a contributor (same ordering as leaderboard()), or null when not listed. */
    rankOf(contributorId) {
      const r = get(`
        WITH lb AS (
          SELECT s.contributor_id AS cid, SUM(s.points) AS points, COUNT(*) AS accepted, MIN(s.reviewed_at) AS first_at
          FROM submissions s JOIN contributors c ON c.id = s.contributor_id
          WHERE s.status IN ${ACCEPT_CLASS} AND c.banned = 0
          GROUP BY s.contributor_id
        ), ranked AS (
          SELECT cid, ROW_NUMBER() OVER (ORDER BY points DESC, accepted DESC, first_at ASC, cid ASC) AS rank FROM lb
        )
        SELECT rank FROM ranked WHERE cid = ?`, contributorId);
      return r ? r.rank : null;
    },

    // ---------------------------------------------------------------------------------------- submissions

    /** created_at of the oldest submission after `sinceIso` (when the daily window next frees a slot). */
    oldestSince(contributorId, sinceIso) {
      const r = get("SELECT MIN(created_at) AS t FROM submissions WHERE contributor_id = ? AND created_at > ?", contributorId, sinceIso);
      return r ? r.t : null;
    },

    /** Request bytes of the contributor's submissions after `sinceIso` (their upload volume for the daily budget). */
    bytesSince(contributorId, sinceIso) {
      return get("SELECT COALESCE(SUM(CAST(json_extract(client_json, '$.bodyBytes') AS INTEGER)), 0) AS n FROM submissions WHERE contributor_id = ? AND created_at > ?", contributorId, sinceIso).n;
    },

    countSince(contributorId, sinceIso) {
      return get("SELECT COUNT(*) AS n FROM submissions WHERE contributor_id = ? AND created_at > ?", contributorId, sinceIso).n;
    },

    findByIdempotencyKey(contributorId, key) {
      return get("SELECT * FROM submissions WHERE contributor_id = ? AND json_extract(client_json, '$.idem') = ?", contributorId, key);
    },

    /**
     * Insert a submission and its photos atomically, re-checking the contributor's daily quota inside the
     * transaction so two simultaneous uploads cannot both slip past the limit.
     * @returns {{ok: true} | {ok: false, reason: "quota"}}
     */
    insertSubmission({ sub, photos, quota }) {
      return tx(() => {
        if (quota && get("SELECT COUNT(*) AS n FROM submissions WHERE contributor_id = ? AND created_at > ?", sub.contributorId, quota.sinceIso).n >= quota.limit) return { ok: false, reason: "quota" };
        run(`INSERT INTO submissions (id, contributor_id, created_at, status, kind, category, note, lang, pose_json, screenshot_key, client_json, points)
             VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, 0)`,
          sub.id, sub.contributorId, sub.createdAt, sub.kind, sub.category, sub.note, sub.lang, sub.poseJson, sub.screenshotKey, sub.clientJson);
        for (const p of photos) {
          run(`INSERT INTO photos (id, submission_id, n, key, preview_key, mime, bytes, width, height, exif_json, lat, lon, enu_x, enu_z, taken_at, heading)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            p.id, sub.id, p.n, p.key, p.previewKey, p.mime, p.bytes, p.width, p.height, p.exifJson, p.lat, p.lon, p.enuX, p.enuZ, p.takenAt, p.heading);
        }
        return { ok: true };
      });
    },

    getSubmission(id) { return get("SELECT * FROM submissions WHERE id = ?", id); },
    getPhotos(submissionId) { return all("SELECT * FROM photos WHERE submission_id = ? ORDER BY n", submissionId); },

    /** A contributor's own submissions, newest first, with photo counts. */
    listMine(contributorId, limit = 200) {
      return all(`SELECT s.*, (SELECT COUNT(*) FROM photos p WHERE p.submission_id = s.id) AS photo_count
                  FROM submissions s WHERE s.contributor_id = ? ORDER BY s.created_at DESC, s.id LIMIT ?`, contributorId, limit);
    },

    /**
     * Admin list. Filters: status, kind, category, contributor id, free-text `q` (id prefix, nickname or note).
     * @returns {{rows: any[], total: number}}
     */
    listAdmin({ status, kind, category, contributorId, q, limit, offset, sort }) {
      const where = [], params = [];
      if (status) { where.push("s.status = ?"); params.push(status); }
      if (kind) { where.push("s.kind = ?"); params.push(kind); }
      if (category) { where.push("s.category = ?"); params.push(category); }
      if (contributorId) { where.push("s.contributor_id = ?"); params.push(contributorId); }
      if (q) {
        const like = `%${likeEscape(q)}%`;
        where.push("(s.id LIKE ? ESCAPE '\\' OR c.nickname LIKE ? ESCAPE '\\' OR s.note LIKE ? ESCAPE '\\')");
        params.push(`${likeEscape(q)}%`, like, like);
      }
      const W = where.length ? "WHERE " + where.join(" AND ") : "";
      const order = sort === "oldest" ? "s.created_at ASC, s.id ASC" : "s.created_at DESC, s.id DESC";
      const total = get(`SELECT COUNT(*) AS n FROM submissions s JOIN contributors c ON c.id = s.contributor_id ${W}`, ...params).n;
      const rows = all(`
        SELECT s.*, c.nickname AS c_nickname, c.banned AS c_banned,
          (SELECT COUNT(*) FROM photos p WHERE p.submission_id = s.id) AS photo_count,
          (SELECT p.lat FROM photos p WHERE p.submission_id = s.id AND p.lat IS NOT NULL ORDER BY p.n LIMIT 1) AS photo_lat,
          (SELECT p.lon FROM photos p WHERE p.submission_id = s.id AND p.lat IS NOT NULL ORDER BY p.n LIMIT 1) AS photo_lon
        FROM submissions s JOIN contributors c ON c.id = s.contributor_id
        ${W} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, limit, offset);
      return { rows, total };
    },

    /** Submission + its contributor + the contributor's totals, for the admin detail view. */
    getAdminDetail(id) {
      const s = get("SELECT * FROM submissions WHERE id = ?", id);
      if (!s) return null;
      const c = get("SELECT * FROM contributors WHERE id = ?", s.contributor_id);
      const totals = get(`SELECT COUNT(*) AS submissions, COALESCE(SUM(CASE WHEN status IN ${ACCEPT_CLASS} THEN 1 ELSE 0 END), 0) AS accepted,
                                  COALESCE(SUM(CASE WHEN status IN ${ACCEPT_CLASS} THEN points ELSE 0 END), 0) AS points
                          FROM submissions WHERE contributor_id = ?`, s.contributor_id);
      return { submission: s, photos: all("SELECT * FROM photos WHERE submission_id = ? ORDER BY n", id), contributor: c, totals };
    },

    /**
     * Review a submission. `defaultPoints` is `{issue, fix}`: points used when accepting without an explicit number.
     * `reviewed_at` is the time of the first decision in the current class
     * (new / accept-class / rejected); editing points or marking an accepted item used does not move it, so a
     * period export never lists the same item in two periods.
     * @returns {{before: any, after: any} | null} null when the submission does not exist
     */
    review(id, { status, points, reviewerNote, version, nowIso, defaultPoints }) {
      return tx(() => {
        const before = get("SELECT * FROM submissions WHERE id = ?", id);
        if (!before) return null;
        const cls = (s) => (s === "new" ? "new" : s === "rejected" ? "rejected" : "accept");
        const accepting = status === "accepted" || status === "used";
        let newPoints = 0;
        if (accepting) newPoints = points ?? (before.points > 0 && (before.status === "accepted" || before.status === "used") ? before.points : (defaultPoints[before.kind] ?? defaultPoints.issue));
        const note = reviewerNote === undefined ? before.reviewer_note : (reviewerNote || null);
        const reviewedAt = status === "new" ? null : cls(before.status) !== cls(status) ? nowIso : (before.reviewed_at ?? nowIso);
        let usedVersion = null, usedAt = null;
        if (status === "used") {
          usedVersion = version ?? (before.status === "used" ? before.used_version : null);
          usedAt = before.status === "used" && usedVersion === before.used_version ? (before.used_at ?? nowIso) : nowIso;
        }
        run("UPDATE submissions SET status = ?, points = ?, reviewer_note = ?, reviewed_at = ?, used_version = ?, used_at = ? WHERE id = ?",
          status, newPoints, note, reviewedAt, usedVersion, usedAt, id);
        return { before, after: get("SELECT * FROM submissions WHERE id = ?", id) };
      });
    },

    /**
     * Mark accepted submissions as shipped in a release. Only `accepted` items change; items already used in the
     * same release are `unchanged`, in another release `already_used`, and new/rejected ones `not_accepted`.
     * @returns {{updated: string[], skipped: Array<{id: string, reason: string}>, notFound: string[]}}
     */
    markUsed(ids, version, nowIso) {
      return tx(() => {
        const updated = [], skipped = [], notFound = [];
        for (const id of ids) {
          const s = get("SELECT id, status, used_version FROM submissions WHERE id = ?", id);
          if (!s) notFound.push(id);
          else if (s.status === "accepted") { run("UPDATE submissions SET status = 'used', used_version = ?, used_at = ? WHERE id = ?", version, nowIso, id); updated.push(id); }
          else if (s.status === "used") skipped.push({ id, reason: s.used_version === version ? "unchanged" : "already_used" });
          else skipped.push({ id, reason: "not_accepted" });
        }
        return { updated, skipped, notFound };
      });
    },

    /** Is `key` one of the files recorded for some submission? The admin file route serves nothing else. */
    keyKnown(key) {
      return Boolean(
        get("SELECT 1 AS x FROM photos WHERE key = ? OR preview_key = ? LIMIT 1", key, key) ||
        get("SELECT 1 AS x FROM submissions WHERE screenshot_key = ? OR json_extract(client_json, '$.screenshot.thumbKey') = ? LIMIT 1", key, key));
    },

    /** Storage keys of every file of a submission (screenshot, thumbnail, originals, previews). */
    keysOfSubmission(id) {
      const s = get("SELECT screenshot_key, client_json FROM submissions WHERE id = ?", id);
      if (!s) return [];
      const keys = new Set();
      if (s.screenshot_key) keys.add(s.screenshot_key);
      const thumb = parseJson(s.client_json, {})?.screenshot?.thumbKey;
      if (thumb) keys.add(thumb);
      for (const p of all("SELECT key, preview_key FROM photos WHERE submission_id = ?", id)) { keys.add(p.key); if (p.preview_key) keys.add(p.preview_key); }
      return [...keys];
    },

    /**
     * Delete a submission and its photo rows. The storage keys of its files are queued in `pending_deletes` in the
     * same transaction (so they survive a crash or a storage outage) and returned for the caller to delete now.
     */
    deleteSubmission(id, nowIso = new Date().toISOString()) {
      return tx(() => {
        const keys = repo.keysOfSubmission(id);
        repo.queueDeletes(keys, nowIso);
        run("DELETE FROM photos WHERE submission_id = ?", id);
        const r = run("DELETE FROM submissions WHERE id = ?", id);
        return { deleted: r.changes > 0, keys };
      });
    },

    /** Erase a contributor with all submissions, photos, tokens and codes; their file keys are queued like above. */
    deleteContributor(id, nowIso = new Date().toISOString()) {
      return tx(() => {
        const keys = [];
        for (const s of all("SELECT id FROM submissions WHERE contributor_id = ?", id)) keys.push(...repo.keysOfSubmission(s.id));
        repo.queueDeletes(keys, nowIso);
        run("DELETE FROM photos WHERE submission_id IN (SELECT id FROM submissions WHERE contributor_id = ?)", id);
        run("DELETE FROM submissions WHERE contributor_id = ?", id);
        run("DELETE FROM transfer_codes WHERE contributor_id = ?", id);
        run("DELETE FROM contributor_tokens WHERE contributor_id = ?", id);
        const r = run("DELETE FROM contributors WHERE id = ?", id);
        return { deleted: r.changes > 0, keys };
      });
    },

    // ----------------------------------------------------------------------- files waiting to be deleted

    /** Record keys whose files must be deleted (idempotent). */
    queueDeletes(keys, nowIso = new Date().toISOString()) {
      for (const key of keys) run("INSERT OR IGNORE INTO pending_deletes (key, queued_at) VALUES (?, ?)", key, nowIso);
    },
    /** Forget keys whose files are gone. */
    clearPending(keys) {
      for (const key of keys) run("DELETE FROM pending_deletes WHERE key = ?", key);
    },
    /** A delete attempt failed: count it and keep a short reason (never file content). */
    notePendingFailure(key, reason, nowIso = new Date().toISOString()) {
      run(`INSERT INTO pending_deletes (key, queued_at, attempts, last_error) VALUES (?, ?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1, last_error = excluded.last_error`, key, nowIso, String(reason).slice(0, 120));
    },
    /** The oldest queued keys. */
    pendingDeletes(limit = 200) { return all("SELECT key, queued_at, attempts, last_error FROM pending_deletes ORDER BY queued_at, key LIMIT ?", limit); },
    pendingDeleteCount() { return get("SELECT COUNT(*) AS n FROM pending_deletes").n; },

    // ------------------------------------------------------------------------------------ device tokens

    /**
     * Revoke every token of a contributor except the one that has hash `keepHash` (and any open transfer code):
     * the kept token becomes the contributor's only credential. Returns how many tokens were revoked.
     */
    keepOnlyToken(contributorId, keepHash) {
      return tx(() => {
        const main = get("SELECT secret_hash FROM contributors WHERE id = ?", contributorId)?.secret_hash;
        const extra = all("SELECT secret_hash FROM contributor_tokens WHERE contributor_id = ?", contributorId).map((x) => x.secret_hash);
        const revoked = [main, ...extra].filter((h) => h !== undefined && h !== keepHash).length;
        run("UPDATE contributors SET secret_hash = ? WHERE id = ?", keepHash, contributorId);
        run("DELETE FROM contributor_tokens WHERE contributor_id = ?", contributorId);
        run("DELETE FROM transfer_codes WHERE contributor_id = ? AND used_at IS NULL", contributorId);
        return revoked;
      });
    },

    // ------------------------------------------------------------------------------------------- exports

    /**
     * Crew-number export rows: accepted + used submissions reviewed in [fromIso, toIso), grouped by クルーNo.
     * (two accounts that entered the same number are merged: one reward per number). Banned contributors and
     * contributors without a number are excluded. The nickname shown is the one of the account with most points.
     * @returns {Array<{crewNo: string, nickname: string, points: number, accepted: number}>}
     */
    crewExport({ fromIso, toIso }) {
      const rows = all(`
        SELECT c.crew_no AS crew_no, c.id AS cid, c.nickname AS nickname, c.created_at AS created_at, SUM(s.points) AS points, COUNT(*) AS accepted
        FROM submissions s JOIN contributors c ON c.id = s.contributor_id
        WHERE s.status IN ${ACCEPT_CLASS} AND c.crew_no IS NOT NULL AND c.banned = 0
          AND s.reviewed_at IS NOT NULL AND (? IS NULL OR s.reviewed_at >= ?) AND (? IS NULL OR s.reviewed_at < ?)
        GROUP BY c.id`, fromIso, fromIso, toIso, toIso);
      const byNo = new Map();
      for (const r of rows) {
        const g = byNo.get(r.crew_no);
        if (!g) byNo.set(r.crew_no, { crewNo: r.crew_no, nickname: r.nickname, points: r.points, accepted: r.accepted, top: r.points, topCreated: r.created_at });
        else {
          g.points += r.points; g.accepted += r.accepted;
          if (r.points > g.top || (r.points === g.top && r.created_at > g.topCreated)) { g.nickname = r.nickname; g.top = r.points; g.topCreated = r.created_at; }
        }
      }
      return [...byNo.values()]
        .map(({ crewNo, nickname, points, accepted }) => ({ crewNo, nickname, points, accepted }))
        .sort((a, b) => b.points - a.points || b.accepted - a.accepted || (a.crewNo < b.crewNo ? -1 : 1));
    },

    /** Submissions with their photos for the pipeline feed. */
    feed({ status, fromIso, toIso }) {
      const where = ["1 = 1"], params = [];
      if (status) { where.push("s.status = ?"); params.push(status); }
      if (fromIso) { where.push("s.reviewed_at >= ?"); params.push(fromIso); }
      if (toIso) { where.push("s.reviewed_at < ?"); params.push(toIso); }
      const subs = all(`SELECT s.*, c.nickname AS c_nickname FROM submissions s JOIN contributors c ON c.id = s.contributor_id
                        WHERE ${where.join(" AND ")} ORDER BY COALESCE(s.reviewed_at, s.created_at) ASC, s.id ASC`, ...params);
      const byId = new Map(subs.map((s) => [s.id, []]));
      const ids = subs.map((s) => s.id);
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        for (const p of all(`SELECT * FROM photos WHERE submission_id IN (${chunk.map(() => "?").join(",")}) ORDER BY submission_id, n`, ...chunk)) byId.get(p.submission_id).push(p);
      }
      return subs.map((s) => ({ submission: s, photos: byId.get(s.id) }));
    },

    stats() {
      const byStatus = Object.fromEntries(all("SELECT status, COUNT(*) AS n FROM submissions GROUP BY status").map((r) => [r.status, r.n]));
      const newByKind = Object.fromEntries(all("SELECT kind, COUNT(*) AS n FROM submissions WHERE status = 'new' GROUP BY kind").map((r) => [r.kind, r.n]));
      return {
        byStatus: { new: byStatus.new ?? 0, accepted: byStatus.accepted ?? 0, used: byStatus.used ?? 0, rejected: byStatus.rejected ?? 0 },
        newByKind: { issue: newByKind.issue ?? 0, fix: newByKind.fix ?? 0 },
        contributors: get("SELECT COUNT(*) AS n FROM contributors").n,
        banned: get("SELECT COUNT(*) AS n FROM contributors WHERE banned = 1").n,
        photos: get("SELECT COUNT(*) AS n FROM photos").n,
        withCrewNo: get("SELECT COUNT(*) AS n FROM contributors WHERE crew_no IS NOT NULL").n,
      };
    },

    // ------------------------------------------------------------------------------------------------ audit

    audit({ at, actor, action, target = null, detail = null }) {
      run("INSERT INTO audit (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)", at, actor, action, target, detail === null ? null : JSON.stringify(detail));
    },
    listAudit({ limit, offset }) {
      return {
        rows: all("SELECT * FROM audit ORDER BY id DESC LIMIT ? OFFSET ?", limit, offset),
        total: get("SELECT COUNT(*) AS n FROM audit").n,
      };
    },
  };
  return repo;
}

// ------------------------------------------------------------------------------------------------- shapes

/** The submission as its owner sees it (GET /me). No reviewer note, no other person's data. */
export function toMine(row) {
  return {
    id: row.id, createdAt: row.created_at, status: row.status, kind: row.kind, category: row.category,
    note: row.note, points: row.points, photos: row.photo_count ?? 0,
    reviewedAt: row.reviewed_at, usedVersion: row.used_version, usedAt: row.used_at,
  };
}

/** `client_json.screenshot`: {mime, bytes, width, height, thumbKey} or null. */
export function screenshotInfo(row) {
  if (!row.screenshot_key) return null;
  const s = parseJson(row.client_json, {})?.screenshot ?? {};
  return { key: row.screenshot_key, url: fileUrl(row.screenshot_key), mime: s.mime ?? null, bytes: s.bytes ?? null, width: s.width ?? null, height: s.height ?? null, thumbKey: s.thumbKey ?? null, thumbUrl: fileUrl(s.thumbKey ?? null) };
}

/** One row of the admin list. */
export function toAdminListItem(row) {
  const pose = parseJson(row.pose_json, null);
  const shot = screenshotInfo(row);
  let location = null;
  if (row.photo_lat !== null && row.photo_lat !== undefined) location = { lat: row.photo_lat, lon: row.photo_lon, source: "photo" };
  else if (pose?.latlon) location = { lat: pose.latlon[0], lon: pose.latlon[1], source: "pose" };
  return {
    id: row.id, createdAt: row.created_at, status: row.status, kind: row.kind, category: row.category, note: row.note, lang: row.lang,
    points: row.points, reviewedAt: row.reviewed_at, usedVersion: row.used_version, usedAt: row.used_at,
    contributor: { id: row.contributor_id, nickname: row.c_nickname, banned: Boolean(row.c_banned) },
    photoCount: row.photo_count, hasScreenshot: Boolean(shot), thumbUrl: shot?.thumbUrl ?? null, location,
  };
}

/** A photo row as JSON. */
export function toPhoto(p) {
  return {
    id: p.id, n: p.n, key: p.key, url: fileUrl(p.key), previewKey: p.preview_key, previewUrl: fileUrl(p.preview_key),
    mime: p.mime, bytes: p.bytes, width: p.width, height: p.height, exif: parseJson(p.exif_json, {}),
    lat: p.lat, lon: p.lon, enu: p.enu_x === null || p.enu_x === undefined ? null : { x: p.enu_x, z: p.enu_z },
    takenAt: p.taken_at, heading: p.heading,
  };
}

/** The full admin record of one submission. */
export function toAdminDetail({ submission: s, photos, contributor: c, totals }, maskCrewNo) {
  return {
    id: s.id, createdAt: s.created_at, status: s.status, kind: s.kind, category: s.category, note: s.note, lang: s.lang,
    points: s.points, reviewerNote: s.reviewer_note, reviewedAt: s.reviewed_at, usedVersion: s.used_version, usedAt: s.used_at,
    pose: parseJson(s.pose_json, null), client: parseJson(s.client_json, {}),
    screenshot: screenshotInfo(s), photos: photos.map(toPhoto),
    contributor: {
      id: c.id, nickname: c.nickname, banned: Boolean(c.banned), createdAt: c.created_at, lastSeen: c.last_seen,
      hasCrewNo: Boolean(c.crew_no), crewNoMasked: maskCrewNo(c.crew_no),
      submissions: totals.submissions, accepted: totals.accepted, points: totals.points,
    },
  };
}

/** A submission for the pipeline feed: everything the survey tools need, no クルーNo. */
export function toFeedItem({ submission: s, photos }) {
  return {
    id: s.id, createdAt: s.created_at, status: s.status, kind: s.kind, category: s.category, note: s.note, lang: s.lang,
    points: s.points, reviewerNote: s.reviewer_note, reviewedAt: s.reviewed_at, usedVersion: s.used_version, usedAt: s.used_at,
    contributor: { id: s.contributor_id, nickname: s.c_nickname },
    pose: parseJson(s.pose_json, null), client: parseJson(s.client_json, {}),
    screenshot: screenshotInfo(s), photos: photos.map(toPhoto),
  };
}

/** An audit row as JSON. */
export function toAuditEntry(r) {
  return { id: r.id, at: r.at, actor: r.actor, action: r.action, target: r.target, detail: parseJson(r.detail, null) };
}
