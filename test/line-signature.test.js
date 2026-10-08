// Signature: good, bad, tampered, empty. The compare is on the raw bytes.
import { describe, expect, test } from "bun:test";
import { signBody, verifySignature } from "../server/line/signature.js";

const secret = "channel-secret-test-value";

describe("LINE webhook signature", () => {
  test("a good signature matches the raw body", () => {
    const body = Buffer.from(JSON.stringify({ events: [{ type: "follow" }] }), "utf8");
    expect(verifySignature(body, signBody(body, secret), secret)).toBe(true);
  });

  test("a bad signature is rejected", () => {
    const body = Buffer.from("{}", "utf8");
    expect(verifySignature(body, signBody(body, "other-secret"), secret)).toBe(false);
  });

  test("a tampered body is rejected", () => {
    const body = Buffer.from('{"events":[]}', "utf8");
    const sig = signBody(body, secret);
    const tampered = Buffer.from('{"events":[{"type":"follow"}]}', "utf8");
    expect(verifySignature(tampered, sig, secret)).toBe(false);
  });

  test("an empty or missing signature is rejected", () => {
    const body = Buffer.from("{}", "utf8");
    expect(verifySignature(body, "", secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });

  test("the signature is over the bytes, not a re-serialised object", () => {
    const raw = Buffer.from('{"text":"Ａ"}', "utf8");
    const sig = signBody(raw, secret);
    expect(verifySignature(raw, sig, secret)).toBe(true);
    expect(verifySignature(Buffer.from('{"text":"A"}', "utf8"), sig, secret)).toBe(false);
  });
});
