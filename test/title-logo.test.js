// The title mark is a build artefact: tools/anime/title-logo.mjs must reproduce the committed SVGs byte for byte.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logoSvg } from "../tools/anime/title-logo.mjs";

const ROOT = join(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

describe("the title logo", () => {
  test("the sun variant (山吹, the default) matches the committed SVG", () => {
    expect(logoSvg("sun", "stack")).toBe(read("src/anime/assets/loader/title-logo-sun.svg"));
  });
  test("the sea variant (生成り, a build option) matches the committed SVG", () => {
    expect(logoSvg("sea", "stack")).toBe(read("src/anime/assets/loader/title-logo-sea.svg"));
  });
  test("the page inlines the sun mark, and neither file embeds a font", () => {
    const html = read("src/anime/index.html");
    const region = html.match(/<!--klc:logo-->([\s\S]*?)<!--\/klc:logo-->/)[1];
    expect(region).toBe(read("src/anime/assets/loader/title-logo-sun.svg").trim());
    for (const name of ["title-logo-sun.svg", "title-logo-sea.svg"]) {
      const svg = read(`src/anime/assets/loader/${name}`);
      expect(svg).not.toMatch(/@font-face|data:font|woff|ttf/i);
      expect(svg).toContain("ケセンメメント");
    }
    expect(read("THIRD-PARTY-NOTICES")).toContain("Dela Gothic Project Authors");
    expect(read("THIRD-PARTY-NOTICES")).toContain("SIL OPEN FONT LICENSE");
  });
});
