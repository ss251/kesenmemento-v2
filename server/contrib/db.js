// Contributor backend: the SQLite database (bun:sqlite, WAL) and its migrations.
//
// The schema lives in code. `PRAGMA user_version` records how many migrations have run; opening a database
// applies the missing ones in order, each in its own transaction, and refuses a database written by a newer
// service (a rollback must never run old code against a newer schema).
//
// Tables (spec: the contributor spec (not included), additions marked +):
//   contributors   anonymous accounts: id, secret_hash, nickname, crew_no (14 digits, nullable), banned...
//   submissions    reports: status new/accepted/used/rejected, + kind issue/fix, + used_version/used_at
//   photos         one row per uploaded photo with its EXIF-derived position
//   audit          who did what (admin actions, exports)
//   + contributor_tokens   extra device tokens for a contributor (account transfer), hashed like the first one
//   + transfer_codes       short-lived single-use codes that mint such a token on another device
//   + pending_deletes      stored files still to be deleted after their rows were removed (privacy deletions are retried)
import { Database } from "bun:sqlite";
import { dirname, resolve } from "node:path";
import { makeDataDir } from "./util.js";

/** @type {Array<{version: number, name: string, sql: string}>} */
export const MIGRATIONS = [
  {
    version: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE contributors (
        id          TEXT PRIMARY KEY,
        secret_hash TEXT NOT NULL,
        nickname    TEXT NOT NULL,
        crew_no     TEXT CHECK (crew_no IS NULL OR (length(crew_no) = 14 AND crew_no NOT GLOB '*[^0-9]*')),
        created_at  TEXT NOT NULL,
        last_seen   TEXT,
        banned      INTEGER NOT NULL DEFAULT 0 CHECK (banned IN (0, 1))
      );
      CREATE INDEX idx_contributors_crew ON contributors(crew_no) WHERE crew_no IS NOT NULL;

      CREATE TABLE contributor_tokens (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        contributor_id TEXT NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
        secret_hash    TEXT NOT NULL,
        created_at     TEXT NOT NULL
      );
      CREATE INDEX idx_tokens_contributor ON contributor_tokens(contributor_id);

      CREATE TABLE transfer_codes (
        code_hash      TEXT PRIMARY KEY,
        contributor_id TEXT NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
        created_at     TEXT NOT NULL,
        expires_at     TEXT NOT NULL,
        used_at        TEXT
      );
      CREATE INDEX idx_transfer_contributor ON transfer_codes(contributor_id);

      CREATE TABLE submissions (
        id             TEXT PRIMARY KEY,
        contributor_id TEXT NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
        created_at     TEXT NOT NULL,
        status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'used', 'rejected')),
        kind           TEXT NOT NULL DEFAULT 'issue',
        category       TEXT NOT NULL DEFAULT 'other',
        note           TEXT NOT NULL DEFAULT '',
        lang           TEXT,
        pose_json      TEXT,
        screenshot_key TEXT,
        client_json    TEXT,
        points         INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
        reviewer_note  TEXT,
        reviewed_at    TEXT,
        used_version   TEXT,
        used_at        TEXT
      );
      CREATE INDEX idx_submissions_status_created ON submissions(status, created_at);
      CREATE INDEX idx_submissions_contributor_created ON submissions(contributor_id, created_at);
      CREATE INDEX idx_submissions_reviewed ON submissions(reviewed_at) WHERE reviewed_at IS NOT NULL;
      CREATE INDEX idx_submissions_idem ON submissions(contributor_id, json_extract(client_json, '$.idem'))
        WHERE json_extract(client_json, '$.idem') IS NOT NULL;

      CREATE TABLE photos (
        id            TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
        n             INTEGER NOT NULL,
        key           TEXT NOT NULL,
        preview_key   TEXT,
        mime          TEXT NOT NULL,
        bytes         INTEGER NOT NULL,
        width         INTEGER,
        height        INTEGER,
        exif_json     TEXT,
        lat           REAL,
        lon           REAL,
        enu_x         REAL,
        enu_z         REAL,
        taken_at      TEXT,
        heading       REAL,
        UNIQUE (submission_id, n)
      );

      CREATE TABLE audit (
        id     INTEGER PRIMARY KEY AUTOINCREMENT,
        at     TEXT NOT NULL,
        actor  TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        detail TEXT
      );
      CREATE INDEX idx_audit_at ON audit(at);
    `,
  },
  {
    version: 2,
    name: "atomic idempotency keys and a durable queue of files to delete",
    sql: `
      -- a retried upload must never create a second submission, even when two copies race: make the key unique.
      -- (a database that already holds duplicate keys keeps the earliest and loses the key on the later rows)
      UPDATE submissions SET client_json = json_remove(client_json, '$.idem')
        WHERE json_extract(client_json, '$.idem') IS NOT NULL
          AND rowid NOT IN (SELECT MIN(rowid) FROM submissions WHERE json_extract(client_json, '$.idem') IS NOT NULL
                            GROUP BY contributor_id, json_extract(client_json, '$.idem'));
      DROP INDEX IF EXISTS idx_submissions_idem;
      CREATE UNIQUE INDEX idx_submissions_idem ON submissions(contributor_id, json_extract(client_json, '$.idem'))
        WHERE json_extract(client_json, '$.idem') IS NOT NULL;

      -- files whose rows are already gone but that the store could not delete yet (retried until they are)
      CREATE TABLE pending_deletes (
        key        TEXT PRIMARY KEY,
        queued_at  TEXT NOT NULL,
        attempts   INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
    `,
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Apply every migration newer than the database's `user_version`.
 * @param {Database} db
 * @returns {number} how many migrations ran
 */
export function migrate(db) {
  const current = db.query("PRAGMA user_version").get().user_version;
  if (current > SCHEMA_VERSION) throw new Error(`database schema v${current} is newer than this service understands (v${SCHEMA_VERSION}); refusing to start`);
  let ran = 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
    })();
    ran++;
  }
  return ran;
}

/**
 * Open (creating if needed) the database at `path` with WAL, foreign keys and a busy timeout, and migrate it.
 * `":memory:"` gives a private in-memory database (tests).
 * @param {string} path
 * @returns {Database}
 */
export function openDb(path) {
  if (path !== ":memory:") makeDataDir(dirname(resolve(path)));
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  try {
    migrate(db);
  } catch (e) {
    db.close();
    throw e;
  }
  return db;
}
