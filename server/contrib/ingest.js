// Contributor backend: POST /submissions, the multipart ingestion pipeline.
//
// Order of work, cheapest and most defensive first:
//   1. auth, content type, idempotent replay (a retry waits for a copy still running), one upload per contributor
//      and a few per network, rate limits, daily quotas (count and bytes), free-space guard: no body read yet
//   2. a byte-weighted memory budget is taken for the body (its declared size), then the body is read with a hard
//      cap, a minimum speed and a deadline (a trickling upload is cut off, and holds its budget only briefly)
//   3. the processing gate; multipart delimiters are counted before the parser runs
//   4. text fields validated (consent, category, kind, note, lang, pose)
//   5. every file checked: count, size limits, magic bytes (the client's content type is ignored)
//   6. images decoded: screenshot thumbnail, photo previews (EXIF stripped), EXIF extracted
//   7. files stored privately, then the rows inserted in one transaction that re-checks the daily quota; on any
//      failure the files already written are removed (queued durably first, so a crash or an outage cannot
//      orphan them): all or nothing
import { PRIVACY_VERSION } from "./config.js";
import { HttpError, badRequest, tooMany, json, readBody, countMultipartParts, multipartBoundary } from "./http.js";
import { GateBusyError } from "./limits.js";
import { sniffImage, inspectImage, makeThumb, processPhoto } from "./images.js";
import { cleanNote, parseCategory, parseKind, parseLang, parsePose, isConsent } from "./validate.js";
import { iso, randomBase32, stripUnsafeChars } from "./util.js";

const DAY_MS = 24 * 3600 * 1000;
const PHOTO_FIELD = /^photos?(?:\[\d*\])?$/;
const IDEM_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;
const MAX_TEXT_PART = 64 * 1024;

/** Validate the optional Idempotency-Key header (8-80 safe characters). */
function idempotencyKey(req) {
  const v = req.headers.get("idempotency-key");
  if (v === null) return null;
  if (!IDEM_KEY.test(v.trim())) throw badRequest("invalid_idempotency_key", "Idempotency-Key must be 8-80 characters: letters, digits and . _ : -");
  return v.trim();
}

const created = (row, photos) => ({ id: row.id, status: row.status, kind: row.kind, photos, createdAt: row.created_at });
const replay = (repo, row) => json({ ...created(row, repo.getPhotos(row.id).length), replayed: true }, 200, { "idempotent-replayed": "true" });
const busy = (e) => (e instanceof GateBusyError ? new HttpError(503, "server_busy", "the server is busy, try again in a moment", { headers: { "retry-after": "10" } }) : e);

/**
 * @param {import("./app.js").Ctx} c
 * @returns {Promise<Response>}
 */
export async function ingestSubmission(c) {
  const { req, config, repo, counter, volume, now, user, ip, bodyBudget, processGate, server, uploads, inflight, freeBytes, log } = c;

  const contentType = req.headers.get("content-type") ?? "";
  const boundary = multipartBoundary(contentType);
  if (!boundary) throw new HttpError(415, "unsupported_media_type", "send the submission as multipart/form-data");
  if (user.banned) throw new HttpError(403, "banned", "this contributor can no longer submit");

  // a retried request returns the original instead of creating a duplicate; if the first copy is still running,
  // wait for it to finish and look again (two copies racing must not both insert)
  const idem = idempotencyKey(req);
  const idemKey = idem ? `${user.id}:${idem}` : null;
  if (idem) {
    for (let i = 0; i < 3; i++) {
      const prev = repo.findByIdempotencyKey(user.id, idem);
      if (prev) return replay(repo, prev);
      const running = inflight.get(idemKey);
      if (!running) break;
      await running;
    }
  }

  // one upload at a time per contributor, a few per network: a slot cannot be hogged by many connections
  if (uploads.byUser.has(user.id)) throw new HttpError(409, "upload_in_progress", "an upload from this contributor is already in progress", { headers: { "retry-after": "5" } });
  if ((uploads.byIp.get(ip) ?? 0) >= config.maxUploadsPerIp) throw tooMany(5000, "rate_limited", "too many uploads at once from this network, try again in a moment");

  // every attempt counts (even a rejected one costs CPU); only successes count towards the daily quotas
  const attempt = counter.take(`submit:${ip}`, config.limits.submitAttemptsPerHourIp, 3600_000);
  if (!attempt.ok) throw tooMany(attempt.retryAfterMs, "rate_limited", "too many upload attempts from this network, try again later");
  const sinceIso = iso(now() - DAY_MS);
  const wait = () => { const oldest = repo.oldestSince(user.id, sinceIso); return oldest ? Date.parse(oldest) + DAY_MS - now() : DAY_MS; };
  if (repo.countSince(user.id, sinceIso) >= config.dailyLimit) throw tooMany(wait(), "daily_limit", `daily limit of ${config.dailyLimit} submissions reached`);
  if (counter.count(`day:${ip}`, DAY_MS) >= config.ipDailyLimit) throw tooMany(counter.retryAfter(`day:${ip}`, config.ipDailyLimit, DAY_MS), "daily_limit", "daily limit for this network reached");
  const cl = Number(req.headers.get("content-length"));
  const declared = Number.isFinite(cl) && cl > 0 ? cl : null;
  if (declared !== null && declared > config.maxBodyBytes) throw new HttpError(413, "payload_too_large", `request body is larger than ${config.maxBodyBytes} bytes`);
  // upload volume: padded images are valid files, so a count limit alone would let one contributor fill the volume
  if (repo.bytesSince(user.id, sinceIso) + (declared ?? 0) > config.dailyBytes) throw tooMany(wait(), "daily_limit", "daily upload volume reached");
  if (volume.sum(`day:${ip}`, DAY_MS) + (declared ?? 0) > config.ipDailyBytes) throw tooMany(volume.oldestAge(`day:${ip}`, DAY_MS), "daily_limit", "daily upload volume for this network reached");
  // keep room for the database and the admin's moderation writes: stop taking uploads before the volume is full
  const free = freeBytes();
  if (free !== null && free - (declared ?? 0) < config.minFreeBytes) {
    log.error("storage.low", { count: Math.floor(free / 1048576) });
    throw new HttpError(503, "storage_full", "the server has run out of storage space; try again later", { headers: { "retry-after": "3600" } });
  }

  // register this upload, then 2. take memory budget for its body and read it, 3. process it
  uploads.byUser.add(user.id);
  uploads.byIp.set(ip, (uploads.byIp.get(ip) ?? 0) + 1);
  let finish;
  const running = new Promise((resolve) => { finish = resolve; });
  if (idemKey) inflight.set(idemKey, running);
  let releaseBudget, releaseProcess;
  try {
    try { releaseBudget = await bodyBudget.acquire(Math.min(declared ?? config.maxBodyBytes, config.maxBodyBytes)); } catch (e) { throw busy(e); }
    try { server?.timeout?.(req, 30); } catch { /* not a Bun server (tests) */ } // a silent connection is dropped after 30 s while the body arrives...
    const box = { bytes: /** @type {Uint8Array | null} */ (null) }; // a holder, so processBody can drop the raw body once parsed
    box.bytes = await readBody(req, config.maxBodyBytes, { minBytesPerSec: config.uploadMinBytesPerSec, graceMs: config.uploadGraceMs, deadlineMs: config.uploadDeadlineMs });
    try { server?.timeout?.(req, 120); } catch { /* not a Bun server */ } // ...and may be quiet for longer while the images are processed
    try { releaseProcess = await processGate.acquire(); } catch (e) { throw busy(e); }
    return await processBody(c, box, boundary, contentType, idem, sinceIso);
  } finally {
    releaseProcess?.();
    releaseBudget?.();
    uploads.byUser.delete(user.id);
    const n = (uploads.byIp.get(ip) ?? 1) - 1;
    if (n <= 0) uploads.byIp.delete(ip); else uploads.byIp.set(ip, n);
    if (idemKey) inflight.delete(idemKey);
    finish();
  }
}

/** Steps 3-7: parse, validate, decode, store, insert. Holds the processing gate (taken by the caller). */
async function processBody(c, box, boundary, contentType, idem, sinceIso) {
  const { req, config, repo, storage, counter, volume, now, user, ip, log } = c;
  const decode = { maxPixels: config.maxPixels };

  const bodyBytes = box.bytes.length;
  if (countMultipartParts(box.bytes, boundary) > config.maxPhotos + 24) throw badRequest("too_many_parts", "the form has too many parts");
  let form;
  try { form = await new Response(box.bytes, { headers: { "content-type": contentType } }).formData(); } catch { throw badRequest("invalid_multipart", "the multipart body could not be parsed"); }
  box.bytes = null; // the parsed parts hold the data now: let the raw copy go

  // ---- text fields (every text part is bounded before any cleaning work is done on it)
  const text = async (name) => {
    const v = form.get(name);
    if (v === null) return undefined;
    if (typeof v === "string") {
      if (v.length > MAX_TEXT_PART) throw badRequest(`invalid_${name}`, `${name} is too large`);
      return v;
    }
    if (v.size > MAX_TEXT_PART) throw badRequest(`invalid_${name}`, `${name} is too large`);
    return v.text();
  };
  if (!isConsent(await text("consent"))) throw badRequest("consent_required", "consent=1 is required: the contributor must accept the privacy notice");
  const category = parseCategory(await text("category")); if (!category.ok) throw badRequest(category.error, category.message);
  const kindIn = parseKind(await text("kind")); if (!kindIn.ok) throw badRequest(kindIn.error, kindIn.message);
  const note = cleanNote(await text("note")); if (!note.ok) throw badRequest(note.error, note.message);
  const lang = parseLang(await text("lang")); if (!lang.ok) throw badRequest(lang.error, lang.message);
  const poseRaw = await text("pose");
  let pose = null;
  if (poseRaw !== undefined && poseRaw.trim() !== "") { const p = parsePose(poseRaw); if (!p.ok) throw badRequest(p.error, p.message); pose = p.value; }

  // ---- files: collect, count, size, magic bytes
  const photoFiles = [], shotFiles = [];
  for (const [name, v] of form.entries()) {
    if (typeof v === "string" || v.size === 0) continue; // an empty file input sends an empty part: ignore it
    if (PHOTO_FIELD.test(name)) photoFiles.push(v);
    else if (name === "screenshot") shotFiles.push(v);
  }
  if (photoFiles.length > config.maxPhotos) throw badRequest("too_many_photos", `at most ${config.maxPhotos} photos per submission`, { max: config.maxPhotos });
  if (shotFiles.length > 1) throw badRequest("invalid_screenshot", "send one screenshot");

  const kind = kindIn.value ?? (photoFiles.length ? "fix" : "issue");
  if (kind === "fix" && photoFiles.length === 0) throw badRequest("fix_needs_photos", "a fix needs at least one on-site photo; send kind=issue for a report without photos");
  if (!note.value && !photoFiles.length && !shotFiles.length) throw badRequest("empty_submission", "send a note, a screenshot or at least one photo");

  /** @type {Array<{bytes: Uint8Array, kind: import("./images.js").ImageKind}>} */
  const photoBlobs = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const f = photoFiles[i];
    if (f.size > config.maxPhotoBytes) throw new HttpError(413, "photo_too_large", `photo ${i + 1} is larger than ${config.maxPhotoBytes} bytes`, { extra: { index: i, max: config.maxPhotoBytes } });
    const b = new Uint8Array(await f.arrayBuffer());
    const k = sniffImage(b);
    if (!k) throw new HttpError(415, "invalid_image", `photo ${i + 1} is not a JPEG, PNG, WebP or HEIC image`, { extra: { field: "photos", index: i } });
    photoBlobs.push({ bytes: b, kind: k });
  }
  let shot = null;
  if (shotFiles.length) {
    const f = shotFiles[0];
    if (f.size > config.maxShotBytes) throw new HttpError(413, "screenshot_too_large", `the screenshot is larger than ${config.maxShotBytes} bytes`, { extra: { max: config.maxShotBytes } });
    const b = new Uint8Array(await f.arrayBuffer());
    const k = sniffImage(b);
    if (!k || (k.type !== "png" && k.type !== "jpeg")) throw new HttpError(415, "invalid_image", "the screenshot must be a PNG or JPEG image", { extra: { field: "screenshot" } });
    shot = { bytes: b, kind: k };
  }

  // ---- decode
  const warnings = [];
  let shotInfo = null, shotThumb = null;
  if (shot) {
    const info = await inspectImage(shot.bytes, decode);
    if (!info.ok) throw new HttpError(415, "unreadable_image", "the screenshot could not be decoded", { extra: { field: "screenshot" } });
    const t = await makeThumb(shot.bytes, 360, decode);
    shotInfo = { mime: shot.kind.mime, bytes: shot.bytes.length, width: info.width, height: info.height };
    if (t.ok) shotThumb = t.bytes; else warnings.push("screenshot-thumbnail-failed");
  }
  const photos = [];
  for (let i = 0; i < photoBlobs.length; i++) {
    const r = await processPhoto(photoBlobs[i].bytes, photoBlobs[i].kind, decode);
    if (!r.ok) throw new HttpError(415, "unreadable_image", `photo ${i + 1} could not be decoded`, { extra: { field: "photos", index: i } });
    if (r.notes.length) warnings.push(`photo-${i + 1}: ${r.notes[0].split(":")[0]}`);
    photos.push(r);
  }

  // ---- store files, then rows
  const id = randomBase32(16, true);
  const createdAt = iso(now());
  const dir = `submissions/${createdAt.slice(0, 4)}/${createdAt.slice(5, 7)}/${id}`;
  const written = [];
  const put = async (key, data, contentType) => { await storage.put(key, data, { contentType }); written.push(key); };
  const photoRows = [];
  try {
    let screenshotKey = null;
    if (shot) {
      screenshotKey = `${dir}/screenshot.${shot.kind.ext}`;
      await put(screenshotKey, shot.bytes, shot.kind.mime);
      if (shotThumb) { shotInfo.thumbKey = `${dir}/screenshot.thumb.jpg`; await put(shotInfo.thumbKey, shotThumb, "image/jpeg"); }
    }
    for (let i = 0; i < photos.length; i++) {
      const n = i + 1, k = photoBlobs[i].kind, p = photos[i];
      const key = `${dir}/photo-${n}.${k.ext}`;
      await put(key, photoBlobs[i].bytes, k.mime);
      let previewKey = null;
      if (p.preview) { previewKey = `${dir}/photo-${n}.preview.jpg`; await put(previewKey, p.preview.bytes, "image/jpeg"); }
      photoRows.push({
        id: randomBase32(10, true), n, key, previewKey, mime: k.mime, bytes: photoBlobs[i].bytes.length, width: p.width, height: p.height,
        exifJson: JSON.stringify(p.exif.exif), lat: p.exif.lat, lon: p.exif.lon, enuX: p.exif.enuX, enuZ: p.exif.enuZ, takenAt: p.exif.takenAt, heading: p.exif.heading,
      });
    }
    const origin = req.headers.get("origin");
    const client = {
      ua: stripUnsafeChars(req.headers.get("user-agent") ?? "").slice(0, 200),
      origin: origin && config.allowedOrigins.includes(origin) ? origin : null,
      consent: { given: true, version: PRIVACY_VERSION },
      ...(shotInfo ? { screenshot: shotInfo } : {}),
      bodyBytes,
      ...(warnings.length ? { warnings } : {}),
      ...(idem ? { idem } : {}),
    };
    const sub = { id, contributorId: user.id, createdAt, kind, category: category.value, note: note.value, lang: lang.value, poseJson: pose ? JSON.stringify(pose) : null, screenshotKey, clientJson: JSON.stringify(client) };
    const r = repo.insertSubmission({ sub, photos: photoRows, quota: { sinceIso, limit: config.dailyLimit } });
    if (!r.ok) throw tooMany(DAY_MS, "daily_limit", `daily limit of ${config.dailyLimit} submissions reached`);
  } catch (e) {
    // queue the written files for deletion first (durable), then try to delete them now
    if (written.length) {
      try { repo.queueDeletes(written, iso(now())); } catch { /* the database itself is failing: nothing more to record */ }
      await c.purge(written);
    }
    // two copies of one retried upload raced past the lookup: the unique key refused the second; return the first
    if (idem && /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) {
      const prev = repo.findByIdempotencyKey(user.id, idem);
      if (prev) return replay(repo, prev);
    }
    throw e;
  }

  counter.add(`day:${ip}`, DAY_MS);
  volume.add(`day:${ip}`, bodyBytes, DAY_MS);
  log.info("submission.created", { kind, photos: photos.length, bytes: bodyBytes });
  return json({ id, status: "new", kind, photos: photos.length, createdAt }, 201);
}
