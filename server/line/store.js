// SQLite for the LINE bot (bun:sqlite). The raw LINE user id is stored only as AES-256-GCM
// ciphertext on contacts. user_ref is HMAC-SHA256 truncated to 16 bytes, base64url (22 characters).
//
// closed_at is not in the spec's column list. It records when the team set fixed or rejected, so a
// later note does not postpone the 180-day deletion.

import { Database } from "bun:sqlite";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const DAY = 24 * 60 * 60 * 1000;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL CHECK (kind IN ('bug','fix','photo','idea','other')),
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','accepted','fixed','rejected','deleted')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  closed_at     TEXT,
  user_ref      TEXT NOT NULL,
  device        TEXT,
  mode          TEXT,
  fix_what      TEXT,
  place_name    TEXT,
  lat           REAL,
  lon           REAL,
  text          TEXT NOT NULL DEFAULT '',
  lang          TEXT NOT NULL DEFAULT 'ja',
  photo_consent INTEGER NOT NULL DEFAULT 0 CHECK (photo_consent IN (0, 1)),
  notes         TEXT NOT NULL DEFAULT '',
  view_id       TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_ref, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  sha256     TEXT NOT NULL,
  mime       TEXT NOT NULL,
  w          INTEGER,
  h          INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_report ON media(report_id);

CREATE TABLE IF NOT EXISTS contacts (
  user_ref         TEXT PRIMARY KEY,
  line_user_id_enc TEXT NOT NULL,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  user_ref   TEXT PRIMARY KEY,
  state      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events_seen (
  id      TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_hits (
  user_ref TEXT NOT NULL,
  at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_hits ON rate_hits(user_ref, at);

CREATE TABLE IF NOT EXISTS rate_notice (
  user_ref TEXT NOT NULL,
  scope    TEXT NOT NULL,
  bucket   TEXT NOT NULL,
  PRIMARY KEY (user_ref, scope, bucket)
);

CREATE TABLE IF NOT EXISTS report_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_ref TEXT NOT NULL,
  at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_report_log ON report_log(user_ref, at);

CREATE TABLE IF NOT EXISTS digest_sent (
  ymd     TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
`;

const KINDS = new Set(["bug", "fix", "photo", "idea", "other"]);
const STATUSES = new Set(["new", "seen", "accepted", "fixed", "rejected", "deleted"]);
const CLOSED = new Set(["fixed", "rejected"]);

/** @param {string} userId @param {Buffer} key */
export function userRefOf(userId, key) {
  return createHmac("sha256", key).update(String(userId), "utf8").digest().subarray(0, 16).toString("base64url");
}

/** @param {string} userId @param {Buffer} key */
export function encryptUserId(userId, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(userId), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64url");
}

/** @param {string} enc @param {Buffer} key */
export function decryptUserId(enc, key) {
  const buf = Buffer.from(String(enc), "base64url");
  if (buf.length < 29) throw new Error("bad contact");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function extFor(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

/**
 * @param {{ dataDir: string, storeKey: Buffer }} opts
 */
export function openStore({ dataDir, storeKey }) {
  const root = resolve(dataDir);
  const mediaRoot = resolve(root, "media");
  mkdirSync(mediaRoot, { recursive: true });
  const db = new Database(join(root, "line.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA);
  const reportCols = db.query("PRAGMA table_info(reports)").all();
  if (!reportCols.some((c) => c.name === "view_id")) db.exec("ALTER TABLE reports ADD COLUMN view_id TEXT");
  db.exec("PRAGMA user_version = 1");

  function insideMedia(relPath) {
    if (typeof relPath !== "string" || relPath.includes("\0")) return null;
    const full = resolve(root, relPath);
    const rel = relative(mediaRoot, full);
    if (rel.startsWith("..") || rel.startsWith(sep) || rel === "") return null;
    return full;
  }

  function unlinkIfUnused(relPath) {
    const full = insideMedia(relPath);
    if (!full) return;
    const n = db.query("SELECT COUNT(*) AS n FROM media WHERE path = ?").get(relPath).n;
    if (n > 0) return;
    try { rmSync(full, { force: true }); } catch { /* already gone */ }
  }

  function allocCode() {
    db.query("INSERT INTO meta(k, v) VALUES('next_code', '1') ON CONFLICT(k) DO NOTHING").run();
    const row = db.query("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'next_code' RETURNING CAST(v AS INTEGER) - 1 AS n").get();
    return `KM-${String(row.n).padStart(4, "0")}`;
  }

  const insertReport = db.transaction((draft, userRef, now) => {
    const code = allocCode();
    const at = iso(now);
    const kind = KINDS.has(draft.kind) ? draft.kind : "other";
    const info = db.query(`
      INSERT INTO reports (
        code, kind, status, created_at, updated_at, user_ref, device, mode, fix_what,
        place_name, lat, lon, text, lang, photo_consent, notes, view_id
      ) VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
    `).run(
      code, kind, at, at, userRef,
      draft.device || null, draft.mode || null, draft.fixWhat || null,
      draft.placeName || null,
      Number.isFinite(draft.lat) ? draft.lat : null,
      Number.isFinite(draft.lon) ? draft.lon : null,
      String(draft.text || "").slice(0, 4000),
      draft.lang === "en" ? "en" : "ja",
      draft.photoConsent ? 1 : 0,
      /^V\d{2}$/.test(draft.viewId || "") ? draft.viewId : null,
    );
    const reportId = Number(info.lastInsertRowid);
    for (const m of draft.media || []) {
      if (!m?.path || !insideMedia(m.path)) continue;
      db.query(`
        INSERT INTO media (report_id, path, bytes, sha256, mime, w, h, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(reportId, m.path, m.bytes | 0, m.sha256, m.mime, m.w ?? null, m.h ?? null, at);
    }
    db.query("INSERT INTO report_log (user_ref, at) VALUES (?, ?)").run(userRef, now);
    return { id: reportId, code };
  });

  function rowReport(row) {
    if (!row) return null;
    return row;
  }

  return {
    root,
    mediaRoot,
    db,
    close() { db.close(); },
    userRef(userId) { return userRefOf(userId, storeKey); },

    upsertContact(userRef, userId, now = Date.now()) {
      const enc = encryptUserId(userId, storeKey);
      db.query(`
        INSERT INTO contacts (user_ref, line_user_id_enc, created_at) VALUES (?, ?, ?)
        ON CONFLICT(user_ref) DO UPDATE SET line_user_id_enc = excluded.line_user_id_enc
      `).run(userRef, enc, iso(now));
    },

    /** The raw LINE user id, or null. Callers must not log it. */
    lineUserId(userRef) {
      const row = db.query("SELECT line_user_id_enc FROM contacts WHERE user_ref = ?").get(userRef);
      if (!row) return null;
      try { return decryptUserId(row.line_user_id_enc, storeKey); } catch { return null; }
    },

    /** @returns {boolean} true when this id is new */
    markEvent(id, now = Date.now()) {
      const info = db.query("INSERT INTO events_seen (id, seen_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING").run(String(id).slice(0, 128), now);
      return info.changes === 1;
    },

    loadSession(userRef) {
      const row = db.query("SELECT state FROM sessions WHERE user_ref = ?").get(userRef);
      if (!row) return null;
      try {
        const state = JSON.parse(row.state);
        return state && typeof state === "object" ? state : null;
      } catch {
        return null;
      }
    },

    saveSession(userRef, session) {
      const raw = JSON.stringify(session);
      if (raw.length > 200_000) return;
      db.query(`
        INSERT INTO sessions (user_ref, state, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_ref) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
      `).run(userRef, raw, iso(session.updatedAt || Date.now()));
    },

    /**
     * Count this event. The 21st event in a minute is over the limit.
     * @returns {{ ok: boolean, count: number }}
     */
    hitEvent(userRef, now = Date.now(), limit = 20) {
      db.query("INSERT INTO rate_hits (user_ref, at) VALUES (?, ?)").run(userRef, now);
      const count = db.query("SELECT COUNT(*) AS n FROM rate_hits WHERE user_ref = ? AND at > ?").get(userRef, now - 60_000).n;
      return { ok: count <= limit, count };
    },

    /** @returns {boolean} true the first time this bucket is claimed */
    claimNotice(userRef, scope, bucket) {
      const info = db.query("INSERT INTO rate_notice (user_ref, scope, bucket) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(userRef, scope, String(bucket));
      return info.changes === 1;
    },

    reportsToday(userRef, now = Date.now()) {
      return db.query("SELECT COUNT(*) AS n FROM report_log WHERE user_ref = ? AND at > ?").get(userRef, now - DAY).n;
    },

    createReport(draft, userRef, now = Date.now()) {
      return insertReport(draft, userRef, now);
    },

    /**
     * Delete this person's reports, media files, and contact. The daily counter stays, so 削除
     * cannot reset the 30-a-day limit. Returns how many reports went.
     */
    deleteUser(userRef) {
      const paths = db.query("SELECT m.path AS path FROM media m JOIN reports r ON r.id = m.report_id WHERE r.user_ref = ?").all(userRef).map((r) => r.path);
      const n = db.query("SELECT COUNT(*) AS n FROM reports WHERE user_ref = ?").get(userRef).n;
      db.query("DELETE FROM reports WHERE user_ref = ?").run(userRef);
      db.query("DELETE FROM contacts WHERE user_ref = ?").run(userRef);
      db.query("DELETE FROM sessions WHERE user_ref = ?").run(userRef);
      for (const p of paths) unlinkIfUnused(p);
      return { reports: n };
    },

    getReportForUser(userRef, code) {
      return rowReport(db.query("SELECT * FROM reports WHERE user_ref = ? AND code = ?").get(userRef, code));
    },

    getByCode(code) {
      return rowReport(db.query("SELECT * FROM reports WHERE code = ?").get(code));
    },

    listReports({ kind = "", status = "", limit = 200 } = {}) {
      const where = [];
      const args = [];
      if (kind) { where.push("kind = ?"); args.push(kind); }
      if (status) { where.push("status = ?"); args.push(status); }
      const sql = `SELECT r.*, (SELECT COUNT(*) FROM media m WHERE m.report_id = r.id) AS photo_count
        FROM reports r ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY r.created_at DESC, r.id DESC LIMIT ?`;
      args.push(Math.min(500, Math.max(1, limit)));
      return db.query(sql).all(...args);
    },

    mediaFor(reportId) {
      return db.query("SELECT * FROM media WHERE report_id = ? ORDER BY id").all(reportId);
    },

    getMedia(id) {
      const row = db.query("SELECT * FROM media WHERE id = ?").get(Number(id));
      if (!row || !insideMedia(row.path)) return null;
      return row;
    },

    readMedia(row) {
      const full = insideMedia(row.path);
      if (!full) return null;
      try { return readFileSync(full); } catch { return null; }
    },

    /**
     * @param {{ bytes: Buffer, mime: string, w: number | null, h: number | null }} prepared
     */
    saveImage(prepared) {
      const sha256 = createHash("sha256").update(prepared.bytes).digest("hex");
      const rel = join("media", sha256.slice(0, 2), `${sha256}.${extFor(prepared.mime)}`).split(sep).join("/");
      const full = insideMedia(rel);
      if (!full) throw new Error("bad media path");
      mkdirSync(dirname(full), { recursive: true });
      try { statSync(full); } catch { writeFileSync(full, prepared.bytes); }
      return { path: rel, bytes: prepared.bytes.length, sha256, mime: prepared.mime, w: prepared.w, h: prepared.h };
    },

    unlink(relPath) { unlinkIfUnused(relPath); },

    setStatus(code, status, now = Date.now()) {
      if (!STATUSES.has(status) || status === "deleted") return null;
      const row = db.query("SELECT * FROM reports WHERE code = ?").get(code);
      if (!row) return null;
      const at = iso(now);
      let closed = row.closed_at;
      if (CLOSED.has(status)) closed = closed || at;
      else closed = null;
      db.query("UPDATE reports SET status = ?, updated_at = ?, closed_at = ? WHERE code = ?").run(status, at, closed, code);
      return db.query("SELECT * FROM reports WHERE code = ?").get(code);
    },

    setNotes(code, notes, now = Date.now()) {
      const text = String(notes ?? "").slice(0, 4000);
      const info = db.query("UPDATE reports SET notes = ?, updated_at = ? WHERE code = ?").run(text, iso(now), code);
      return info.changes === 1;
    },

    listSince(isoStart) {
      return db.query("SELECT code, kind, text, created_at FROM reports WHERE created_at >= ? ORDER BY id").all(isoStart);
    },

    digestSent(ymd) {
      return Boolean(db.query("SELECT ymd FROM digest_sent WHERE ymd = ?").get(ymd));
    },

    markDigest(ymd, now = Date.now()) {
      db.query("INSERT INTO digest_sent (ymd, sent_at) VALUES (?, ?) ON CONFLICT(ymd) DO NOTHING").run(ymd, iso(now));
    },

    /**
     * Rejected photos go after 30 days. Closed reports go 180 days after closed_at.
     * Webhook ids are kept 7 days. Open reports stay.
     */
    runRetention(now = Date.now()) {
      const mediaCut = iso(now - 30 * DAY);
      const reportCut = iso(now - 180 * DAY);
      const rejected = db.query(`
        SELECT m.path AS path FROM media m
        JOIN reports r ON r.id = m.report_id
        WHERE r.status = 'rejected' AND r.closed_at IS NOT NULL AND r.closed_at <= ?
      `).all(mediaCut);
      const paths = rejected.map((r) => r.path);
      db.query(`
        DELETE FROM media WHERE id IN (
          SELECT m.id FROM media m
          JOIN reports r ON r.id = m.report_id
          WHERE r.status = 'rejected' AND r.closed_at IS NOT NULL AND r.closed_at <= ?
        )
      `).run(mediaCut);
      for (const p of paths) unlinkIfUnused(p);

      const old = db.query(`
        SELECT m.path AS path FROM media m
        JOIN reports r ON r.id = m.report_id
        WHERE r.status IN ('fixed', 'rejected') AND r.closed_at IS NOT NULL AND r.closed_at <= ?
      `).all(reportCut);
      const oldPaths = old.map((r) => r.path);
      const removed = db.query(`
        DELETE FROM reports WHERE status IN ('fixed', 'rejected') AND closed_at IS NOT NULL AND closed_at <= ?
      `).run(reportCut);
      for (const p of oldPaths) unlinkIfUnused(p);

      db.query("DELETE FROM events_seen WHERE seen_at <= ?").run(now - 7 * DAY);
      db.query("DELETE FROM rate_hits WHERE at <= ?").run(now - 2 * DAY);
      db.query("DELETE FROM report_log WHERE at <= ?").run(now - 2 * DAY);
      db.query("DELETE FROM sessions WHERE updated_at <= ?").run(iso(now - DAY));

      const known = new Set(db.query("SELECT path FROM media").all().map((r) => r.path));
      let orphans = 0;
      const walk = (dir) => {
        let names = [];
        try { names = readdirSync(dir); } catch { return; }
        for (const name of names) {
          const full = join(dir, name);
          let st;
          try { st = statSync(full); } catch { continue; }
          if (st.isDirectory()) { walk(full); continue; }
          const rel = relative(root, full).split(sep).join("/");
          if (known.has(rel)) continue;
          if (now - st.mtimeMs < DAY) continue;
          try { rmSync(full, { force: true }); orphans++; } catch { /* ignore */ }
        }
      };
      walk(mediaRoot);
      return { reports: removed.changes, orphans };
    },
  };
}
