// LINE webhook signatures.
//
// x-line-signature is base64(HMAC-SHA256(channelSecret, rawBody)). Compare it to the raw request
// bytes with a timing-safe compare. A missing, empty, or wrong-length header is a rejection.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * The signature LINE would send for these exact bytes.
 * @param {Buffer | Uint8Array | string} rawBody
 * @param {string} channelSecret
 */
export function signBody(rawBody, channelSecret) {
  return createHmac("sha256", channelSecret).update(rawBody).digest("base64");
}

/**
 * Constant-time string compare via SHA-256 digests, so the lengths of the inputs do not decide the path.
 * @param {string} a
 * @param {string} b
 */
export function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a), "utf8").digest();
  const hb = createHash("sha256").update(String(b), "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * @param {Buffer | Uint8Array} rawBody the untouched request body
 * @param {string | null | undefined} header the x-line-signature header
 * @param {string} channelSecret
 * @returns {boolean}
 */
export function verifySignature(rawBody, header, channelSecret) {
  if (typeof header !== "string" || header.length === 0 || !channelSecret) return false;
  const expected = signBody(rawBody, channelSecret);
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
