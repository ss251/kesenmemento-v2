// Contributor backend: credentials.
//
// Contributors are anonymous. Creating one returns a token `<id>.<secret>`: the id is public, the secret is 32
// random bytes. The database keeps only HMAC-SHA256(TOKEN_SECRET, secret), so a database leak alone cannot be
// replayed, and every comparison is constant-time. The admin token is compared as SHA-256 digests (fixed length)
// with timingSafeEqual, so neither its value nor its length leaks through timing.
import { randomBytes } from "node:crypto";
import { hmacHex, isBase64Url, safeEqualHex, safeEqualStr } from "./util.js";

/**
 * @param {{tokenSecret: string, adminToken: string}} keys
 */
export function createAuth({ tokenSecret, adminToken }) {
  const hashSecret = (secret) => hmacHex(tokenSecret, "token:" + secret);
  const hashCode = (code) => hmacHex(tokenSecret, "transfer:" + code);
  // compared against when the id is unknown so "no such contributor" and "wrong secret" cost the same
  const DUMMY_HASH = hashSecret("no-such-contributor");

  return {
    hashSecret,
    hashCode,

    /**
     * Mint a token for a contributor id.
     * @returns {{token: string, hash: string}} `token` goes to the client once; `hash` is what gets stored
     */
    newToken(contributorId) {
      const secret = randomBytes(32).toString("base64url");
      return { token: `${contributorId}.${secret}`, hash: hashSecret(secret) };
    },

    /**
     * The credential from `Authorization: Bearer <credential>`, or null.
     * @param {Request} req
     */
    bearer(req) {
      const h = req.headers.get("authorization");
      if (!h || h.length > 400) return null;
      const m = /^Bearer[ \t]+([^\s]+)$/i.exec(h.trim());
      return m ? m[1] : null;
    },

    /** Split `<id>.<secret>`; null when it is not shaped like a contributor token. */
    parseToken(credential) {
      if (typeof credential !== "string") return null;
      const dot = credential.indexOf(".");
      if (dot < 0) return null;
      const id = credential.slice(0, dot), secret = credential.slice(dot + 1);
      return isBase64Url(id, 8, 40) && isBase64Url(secret, 20, 100) ? { id, secret } : null;
    },

    /**
     * The stored hash that `secret` matches, or null. Every candidate is compared (no early exit on position), so
     * which device's token it was does not show in the timing.
     * @param {string} secret
     * @param {string[]} storedHashes
     */
    match(secret, storedHashes) {
      const h = hashSecret(secret);
      let hit = null;
      for (const s of storedHashes.length ? storedHashes : [DUMMY_HASH]) if (safeEqualHex(h, s) && storedHashes.length) hit = s;
      return hit;
    },

    /**
     * Does `secret` match one of the stored hashes? Every candidate is compared (no early exit on position).
     * @param {string} secret
     * @param {string[]} storedHashes may be empty (unknown id): a dummy comparison keeps the timing alike
     */
    matches(secret, storedHashes) {
      const h = hashSecret(secret);
      let hit = false;
      for (const s of storedHashes.length ? storedHashes : [DUMMY_HASH]) if (safeEqualHex(h, s)) hit = true;
      return hit && storedHashes.length > 0;
    },

    /** Constant-time check of an admin credential against ADMIN_TOKEN. */
    isAdmin(credential) {
      return typeof credential === "string" && credential.length > 0 && safeEqualStr(credential, adminToken);
    },
  };
}
