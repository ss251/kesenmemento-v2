// LINE API client: endpoints, retry, quota, and image bytes.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createLineApi, quotaLeft, LineApiError } from "../server/line/api.js";
import { prepareImage, sampleJpeg, MAX_IMAGE_BYTES } from "../server/line/media.js";

function pngWithExif() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(3, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("eXIf", Buffer.from("FAKEGPS")), chunk("IEND", Buffer.alloc(0))]);
}

function jsonResponse(status, body) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("LINE API client", () => {
  test("reply, push, content, quota and bot info hit the documented URLs", async () => {
    const calls = [];
    const api = createLineApi({
      token: "test-token",
      apiBase: "https://api.line.me",
      dataBase: "https://api-data.line.me",
      fetch: async (url, opts) => {
        calls.push({ url: String(url), opts });
        if (String(url).includes("/content")) return new Response(sampleJpeg(), { status: 200 });
        if (String(url).includes("/quota/consumption")) return jsonResponse(200, { totalUsage: 3 });
        if (String(url).includes("/quota")) return jsonResponse(200, { type: "limited", value: 200 });
        if (String(url).endsWith("/v2/bot/info")) return jsonResponse(200, { basicId: "@216ru", userId: "Ubot", displayName: "ケセンメメント" });
        return jsonResponse(200, { sentMessages: [{ id: "1" }] });
      },
    });
    await api.reply("reply-token", [{ type: "text", text: "hi" }]);
    await api.push("Uuser", [{ type: "text", text: "fixed" }]);
    const bytes = await api.content("abc/def");
    await api.quota();
    await api.consumption();
    const info = await api.botInfo();
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.line.me/v2/bot/message/reply",
      "https://api.line.me/v2/bot/message/push",
      "https://api-data.line.me/v2/bot/message/abc%2Fdef/content",
      "https://api.line.me/v2/bot/message/quota",
      "https://api.line.me/v2/bot/message/quota/consumption",
      "https://api.line.me/v2/bot/info",
    ]);
    expect(calls[0].opts.headers.authorization).toBe("Bearer test-token");
    expect(calls[0].opts.headers["x-line-retry-key"]).toBeUndefined();
    expect(calls[1].opts.headers["x-line-retry-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls.every((c) => c.opts.redirect === "error")).toBe(true);
    expect(bytes[0]).toBe(0xff);
    expect(info.basicId).toBe("@216ru");
  });

  test("a 5xx is retried once, a 4xx is not, and a push keeps its retry key", async () => {
    let n = 0;
    const keys = [];
    const api = createLineApi({
      token: "t",
      fetch: async (_url, opts) => {
        n++;
        keys.push(opts.headers["x-line-retry-key"]);
        if (n === 1) return new Response("no", { status: 500 });
        return jsonResponse(200, {});
      },
    });
    await api.push("U1", [{ type: "text", text: "hi" }]);
    expect(n).toBe(2);
    expect(keys[0]).toBe(keys[1]);

    let m = 0;
    const once = createLineApi({
      token: "t",
      fetch: async () => {
        m++;
        return new Response("no", { status: 400 });
      },
    });
    await expect(once.reply("tok", [{ type: "text", text: "a" }])).rejects.toBeInstanceOf(LineApiError);
    expect(m).toBe(1);

    let net = 0;
    const flaky = createLineApi({
      token: "t",
      fetch: async () => {
        net++;
        if (net === 1) throw new Error("socket");
        return jsonResponse(200, {});
      },
    });
    await flaky.reply("tok", [{ type: "text", text: "a" }]);
    expect(net).toBe(2);
  });

  test("quota left treats limited, unlimited and exhausted plans", () => {
    expect(quotaLeft({ type: "limited", value: 200 }, { totalUsage: 12 })).toEqual({ limited: true, used: 12, value: 200, left: 188 });
    expect(quotaLeft({ type: "none" }, { totalUsage: 5 })).toMatchObject({ limited: false, used: 5, left: null });
    expect(quotaLeft({ type: "limited", value: 200 }, { totalUsage: 240 }).left).toBe(0);
  });

  test("JPEG APP1 is removed and the header size is kept; a non-image is refused", () => {
    const jpeg = sampleJpeg({ exif: true, w: 12, h: 9 });
    expect(jpeg.toString("latin1")).toContain("Exif");
    const out = prepareImage(jpeg);
    expect(out.mime).toBe("image/jpeg");
    expect(out.w).toBe(12);
    expect(out.h).toBe(9);
    expect(out.bytes.toString("latin1")).not.toContain("Exif");
    expect(out.bytes.toString("latin1")).not.toContain("FAKEGPS");
    expect(() => prepareImage(Buffer.from("hello"))).toThrow();
    expect(() => prepareImage(Buffer.alloc(MAX_IMAGE_BYTES + 1, 0xff))).toThrow();
    const png = pngWithExif();
    const stripped = prepareImage(png);
    expect(stripped.mime).toBe("image/png");
    expect(stripped.w).toBe(3);
    expect(stripped.h).toBe(2);
    expect(stripped.bytes.toString("latin1")).not.toContain("FAKEGPS");
    expect(stripped.bytes.toString("latin1")).not.toContain("eXIf");
  });

  test("the client never calls the profile API", () => {
    const src = readFileSync(new URL("../server/line/api.js", import.meta.url), "utf8");
    expect(src).not.toContain("/v2/bot/profile");
    expect(src).not.toContain("/v2/profile");
  });
});
