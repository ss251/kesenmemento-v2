// Contributor backend: the admin API (/api/contrib/v1/admin/*). Every route here requires
// `Authorization: Bearer <ADMIN_TOKEN>`. Contract: docs/contrib/API.md.
import { badRequest, notFound, json, readJson } from "./http.js";
import { API } from "./routes-public.js";
import { isSubmissionKey, mimeForKey } from "./storage.js";
import { toAdminListItem, toAdminDetail, toFeedItem, toAuditEntry } from "./repo.js";
import { crewCsv } from "./csv.js";
import {
  parseStatus, parseKind, parseCategory, parsePoints, parseVersion, cleanReviewerNote, cleanNickname, defaultNickname,
  parseDateRange, parseIntParam, maskCrewNo,
} from "./validate.js";
import { iso } from "./util.js";

const SUBMISSION_ID = /^[a-z0-9]{8,40}$/;
const CONTRIBUTOR_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,39}$/;
const JST_MS = 9 * 3600 * 1000;

const audit = (c, action, target = null, detail = null) => c.repo.audit({ at: iso(c.now()), actor: c.actor, action, target, detail });

function submissionId(c) {
  if (!SUBMISSION_ID.test(c.params.id)) throw notFound("no such submission");
  return c.params.id;
}
function contributorId(c) {
  if (!CONTRIBUTOR_ID.test(c.params.id)) throw notFound("no such contributor");
  return c.params.id;
}
const detailOf = (c, id) => {
  const d = c.repo.getAdminDetail(id);
  if (!d) throw notFound("no such submission");
  return toAdminDetail(d, maskCrewNo);
};

/** GET /admin/submissions?status=&kind=&category=&q=&limit=&offset=&sort= -> {items, total, limit, offset} */
function listSubmissions(c) {
  const q = c.query;
  const status = q.get("status");
  let st = null;
  if (status && status !== "all") { const r = parseStatus(status); if (!r.ok) throw badRequest(r.error, r.message); st = r.value; }
  const k = parseKind(q.get("kind")); if (!k.ok) throw badRequest(k.error, k.message);
  let cat = null;
  if (q.get("category")) { const r = parseCategory(q.get("category")); if (!r.ok) throw badRequest(r.error, r.message); cat = r.value; }
  const text = (q.get("q") ?? "").trim().slice(0, 100);
  const cid = q.get("contributor");
  if (cid && !CONTRIBUTOR_ID.test(cid)) throw badRequest("invalid_contributor", "contributor is not a valid id");
  const limit = parseIntParam(q.get("limit"), 25, 1, 100);
  const offset = parseIntParam(q.get("offset"), 0, 0, 1_000_000);
  const sort = q.get("sort") === "oldest" ? "oldest" : "newest";
  const { rows, total } = c.repo.listAdmin({ status: st, kind: k.value, category: cat, contributorId: cid || null, q: text || null, limit, offset, sort });
  return json({ items: rows.map(toAdminListItem), total, limit, offset }, 200, { "x-total-count": String(total) });
}

/** GET /admin/submissions/:id -> the full record with photo URLs */
function getSubmission(c) { return json(detailOf(c, submissionId(c))); }

/**
 * POST /admin/submissions/:id {status, points?, reviewerNote?, version?} -> the updated record.
 * `points` defaults to 5 for an issue and 20 for a fix when accepting; `version` (tag or commit) is stored with `used`.
 */
async function reviewSubmission(c) {
  const id = submissionId(c);
  const body = await readJson(c.req);
  const status = parseStatus(body.status); if (!status.ok) throw badRequest(status.error, status.message);
  const points = parsePoints(body.points); if (!points.ok) throw badRequest(points.error, points.message);
  const version = parseVersion(body.version); if (!version.ok) throw badRequest(version.error, version.message);
  let reviewerNote;
  if (Object.hasOwn(body, "reviewerNote")) { const r = cleanReviewerNote(body.reviewerNote); if (!r.ok) throw badRequest(r.error, r.message); reviewerNote = r.value; }
  const res = c.repo.review(id, {
    status: status.value, points: points.value, reviewerNote, version: status.value === "used" ? version.value : null,
    nowIso: iso(c.now()), defaultPoints: c.config.points,
  });
  if (!res) throw notFound("no such submission");
  const { before, after } = res;
  audit(c, "submission.review", id, {
    from: before.status, to: after.status, points: [before.points, after.points],
    ...(after.status === "used" ? { version: after.used_version } : {}), noteChanged: (before.reviewer_note ?? "") !== (after.reviewer_note ?? ""),
  });
  return json(detailOf(c, id));
}

/** POST /admin/submissions/mark-used {ids: [...], version} -> {version, updated, skipped, notFound} */
async function markUsed(c) {
  const body = await readJson(c.req, 128 * 1024);
  const version = parseVersion(body.version);
  if (!version.ok) throw badRequest(version.error, version.message);
  if (!version.value) throw badRequest("version_required", "version (a release tag or commit) is required");
  if (!Array.isArray(body.ids) || body.ids.length === 0) throw badRequest("invalid_ids", "ids must be a non-empty array of submission ids");
  if (body.ids.length > 500) throw badRequest("invalid_ids", "at most 500 ids per call");
  if (!body.ids.every((i) => typeof i === "string" && SUBMISSION_ID.test(i))) throw badRequest("invalid_ids", "ids must be submission ids");
  const ids = [...new Set(body.ids)];
  const r = c.repo.markUsed(ids, version.value, iso(c.now()));
  for (const id of r.updated) audit(c, "submission.used", id, { version: version.value, bulk: true });
  audit(c, "submissions.mark_used", null, { version: version.value, requested: ids.length, updated: r.updated.length, skipped: r.skipped.length, notFound: r.notFound.length });
  return json({ version: version.value, ...r });
}

/** DELETE /admin/submissions/:id: erase one submission and its files (privacy: deletion on request). */
async function deleteSubmission(c) {
  const id = submissionId(c);
  const cur = c.repo.getSubmission(id);
  if (!cur) throw notFound("no such submission");
  const { keys } = c.repo.deleteSubmission(id, iso(c.now()));
  const { removed, failed } = await c.purge(keys); // files the store cannot delete stay queued and are retried
  audit(c, "submission.delete", id, { contributor: cur.contributor_id, files: keys.length, leftover: failed });
  return json({ ok: true, deletedFiles: removed });
}

/** POST /admin/contributors/:id {banned?, nickname?} -> {id, nickname, banned}: ban or unban, or reset an offensive nickname. */
async function updateContributor(c) {
  const id = contributorId(c);
  const cur = c.repo.getContributor(id);
  if (!cur) throw notFound("no such contributor");
  const body = await readJson(c.req);
  if (Object.hasOwn(body, "banned")) {
    if (typeof body.banned !== "boolean") throw badRequest("invalid_banned", "banned must be true or false");
    c.repo.setBanned(id, body.banned);
    audit(c, body.banned ? "contributor.ban" : "contributor.unban", id);
  }
  if (Object.hasOwn(body, "nickname")) {
    const r = cleanNickname(body.nickname); if (!r.ok) throw badRequest(r.error, r.message);
    c.repo.updateProfile(id, { nickname: r.value ?? defaultNickname(id) });
    audit(c, "contributor.nickname", id, { reset: r.value === null });
  }
  const now = c.repo.getContributor(id);
  return json({ id, nickname: now.nickname, banned: Boolean(now.banned) });
}

/** DELETE /admin/contributors/:id: erase a contributor with everything they sent. */
async function deleteContributor(c) {
  const id = contributorId(c);
  if (!c.repo.getContributor(id)) throw notFound("no such contributor");
  const { keys } = c.repo.deleteContributor(id, iso(c.now()));
  const { removed, failed } = await c.purge(keys);
  audit(c, "contributor.delete", id, { files: keys.length, leftover: failed });
  return json({ ok: true, deletedFiles: removed });
}

/** GET /admin/files/<key> -> the file, streamed. Only keys recorded for a submission are served. */
async function getFile(c) {
  const key = c.params.key;
  if (!isSubmissionKey(key) || !c.repo.keyKnown(key)) throw notFound("no such file");
  const f = await c.storage.open(key);
  if (!f) throw notFound("no such file");
  const name = key.split("/").pop();
  const download = c.query.get("download") === "1";
  return new Response(f.body, {
    headers: {
      "content-type": mimeForKey(key), "content-length": String(f.size),
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "cache-control": "private, max-age=300",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}

/** GET /admin/export/crew.csv?from=&to=&excel=0 -> text/csv (UTF-8 BOM). Dates are JST days unless a full timestamp is given. */
function exportCrew(c) {
  const range = parseDateRange(c.query.get("from"), c.query.get("to"));
  if (!range.ok) throw badRequest(range.error, range.message);
  const excel = !/^(?:0|false|no)$/i.test(c.query.get("excel") ?? "");
  const rows = c.repo.crewExport(range.value);
  audit(c, "export.crew", null, { from: c.query.get("from") || null, to: c.query.get("to") || null, rows: rows.length, excel });
  const stamp = new Date(c.now() + JST_MS).toISOString().slice(0, 10);
  return new Response(crewCsv(rows, { excel }), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="crew-${stamp}.csv"`, "cache-control": "no-store" },
  });
}

/** GET /admin/export/submissions.json?status=accepted&from=&to= -> the pipeline feed */
function exportFeed(c) {
  const rawStatus = c.query.get("status") ?? "accepted";
  let status = null;
  if (rawStatus !== "all") { const r = parseStatus(rawStatus); if (!r.ok) throw badRequest(r.error, r.message); status = r.value; }
  const range = parseDateRange(c.query.get("from"), c.query.get("to"));
  if (!range.ok) throw badRequest(range.error, range.message);
  const items = c.repo.feed({ status, ...range.value }).map(toFeedItem);
  audit(c, "export.feed", null, { status: rawStatus, count: items.length });
  return json({ generatedAt: iso(c.now()), status: rawStatus, count: items.length, submissions: items });
}

/** GET /admin/stats -> counts for the admin header */
function stats(c) { return json({ ...c.repo.stats(), pendingDeletes: c.repo.pendingDeleteCount(), points: c.config.points, generatedAt: iso(c.now()) }); }

/** GET /admin/audit?limit=&offset= -> {items, total, limit, offset} */
function auditLog(c) {
  const limit = parseIntParam(c.query.get("limit"), 50, 1, 200);
  const offset = parseIntParam(c.query.get("offset"), 0, 0, 1_000_000);
  const { rows, total } = c.repo.listAudit({ limit, offset });
  return json({ items: rows.map(toAuditEntry), total, limit, offset });
}

const A = `${API}/admin`;
/** @type {Array<{method: string, path: string, label: string, auth: "admin", handler: Function}>} */
export const adminRoutes = [
  // literal "mark-used" must stay before the :id route
  { method: "POST", path: `${A}/submissions/mark-used`, label: "admin.submissions.mark_used", auth: "admin", handler: markUsed },
  { method: "GET", path: `${A}/submissions`, label: "admin.submissions.list", auth: "admin", handler: listSubmissions },
  { method: "GET", path: `${A}/submissions/:id`, label: "admin.submissions.get", auth: "admin", handler: getSubmission },
  { method: "POST", path: `${A}/submissions/:id`, label: "admin.submissions.review", auth: "admin", handler: reviewSubmission },
  { method: "DELETE", path: `${A}/submissions/:id`, label: "admin.submissions.delete", auth: "admin", handler: deleteSubmission },
  { method: "POST", path: `${A}/contributors/:id`, label: "admin.contributors.update", auth: "admin", handler: updateContributor },
  { method: "DELETE", path: `${A}/contributors/:id`, label: "admin.contributors.delete", auth: "admin", handler: deleteContributor },
  { method: "GET", path: `${A}/files/*key`, label: "admin.files.get", auth: "admin", handler: getFile },
  { method: "GET", path: `${A}/export/crew.csv`, label: "admin.export.crew", auth: "admin", handler: exportCrew },
  { method: "GET", path: `${A}/export/submissions.json`, label: "admin.export.feed", auth: "admin", handler: exportFeed },
  { method: "GET", path: `${A}/stats`, label: "admin.stats", auth: "admin", handler: stats },
  { method: "GET", path: `${A}/audit`, label: "admin.audit", auth: "admin", handler: auditLog },
];
