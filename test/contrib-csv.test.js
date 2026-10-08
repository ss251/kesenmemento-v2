// Contributor backend: the crew-number CSV must open cleanly in Excel.
import { describe, test, expect } from "bun:test";
import { crewCsv, textCell, numberCell, crewNoCell, BOM } from "../server/contrib/csv.js";

const bytes = (s) => new TextEncoder().encode(s);

describe("file layout", () => {
  const rows = [
    { crewNo: "12345678901234", nickname: "さくら", points: 25, accepted: 3 },
    { crewNo: "00001234567890", nickname: "Taro, \"Cap\" Kesen", points: 10, accepted: 1 },
  ];
  test("starts with the UTF-8 byte-order mark, so Excel decodes Japanese correctly", () => {
    const b = bytes(crewCsv(rows));
    expect([...b.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(BOM).toBe(String.fromCodePoint(0xfeff));
    expect(new TextDecoder().decode(b.slice(3)).startsWith("crew_no,")).toBe(true);
  });
  test("the header is exactly crew_no,nickname,points,accepted and lines end with CRLF", () => {
    const text = crewCsv(rows);
    const lines = text.slice(1).split("\r\n");
    expect(lines[0]).toBe("crew_no,nickname,points,accepted");
    expect(lines).toHaveLength(4); // header, two rows, and the empty string after the final CRLF
    expect(lines[3]).toBe("");
    expect(text).not.toMatch(/[^\r]\n/); // no bare LF
  });
  test("an empty export is just the header", () => {
    expect(crewCsv([])).toBe(String.fromCodePoint(0xfeff) + "crew_no,nickname,points,accepted\r\n");
  });
  test("Japanese text survives a UTF-8 round trip", () => {
    const text = new TextDecoder().decode(bytes(crewCsv(rows)));
    expect(text).toContain("さくら");
  });
});

describe("クルーNo. cells", () => {
  test("excel mode (the default) writes =\"14 digits\" so Excel keeps the number as text: no 1.23457E+13, no lost leading zero", () => {
    expect(crewNoCell("12345678901234")).toBe('="12345678901234"');
    expect(crewNoCell("00001234567890", true)).toBe('="00001234567890"');
    expect(crewCsv([{ crewNo: "00001234567890", nickname: "a", points: 1, accepted: 1 }])).toContain('="00001234567890",a,1,1');
  });
  test("plain mode writes the bare digits for scripts", () => {
    expect(crewNoCell("12345678901234", false)).toBe("12345678901234");
    expect(crewCsv([{ crewNo: "12345678901234", nickname: "a", points: 1, accepted: 1 }], { excel: false })).toContain("\r\n12345678901234,a,1,1");
  });
  test("anything that is not exactly 14 digits is written empty and can never become a formula", () => {
    for (const bad of ["1234", "1234567890123x", "=1+1", '12345678901234"; DROP', null, undefined, 12345678901234, ""]) {
      expect(crewNoCell(bad)).toBe("");
      expect(crewNoCell(bad, false)).toBe("");
    }
  });
});

describe("quoting", () => {
  test("a cell with a comma, quote or line break is quoted and quotes are doubled (RFC 4180)", () => {
    expect(textCell("plain")).toBe("plain");
    expect(textCell("a,b")).toBe('"a,b"');
    expect(textCell('say "hi"')).toBe('"say ""hi"""');
    expect(textCell("two\nlines")).toBe('"two\nlines"');
    expect(textCell("cr\rhere")).toBe('"cr\rhere"');
    expect(textCell(" padded ")).toBe('" padded "');
    expect(textCell(null)).toBe("");
    expect(textCell(undefined)).toBe("");
    expect(textCell(5)).toBe("5");
  });
  test("numbers are written plainly and non-finite values are empty", () => {
    expect(numberCell(25)).toBe("25");
    expect(numberCell(0)).toBe("0");
    for (const bad of [NaN, Infinity, undefined, null, "5"]) expect(numberCell(bad)).toBe("");
  });
});

describe("spreadsheet formula injection", () => {
  test("a text cell starting with = + - @ tab or CR is made inert with a leading apostrophe", () => {
    for (const evil of ['=HYPERLINK("http://evil.example","click")', "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
      const cell = textCell(evil);
      const inner = cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
      expect(inner.startsWith("'")).toBe(true);
      expect(inner.slice(1)).toBe(evil);
    }
  });
  test("a nickname that tries it ends up as text in the export", () => {
    const text = crewCsv([{ crewNo: "12345678901234", nickname: "=cmd|' /C calc'!A0", points: 1, accepted: 1 }]);
    expect(text).toContain(",'=cmd|' /C calc'!A0,");
    expect(text).not.toMatch(/,=cmd/);
  });
  test("ordinary text is untouched: an apostrophe or a hyphen elsewhere is fine", () => {
    expect(textCell("O'Neil")).toBe("O'Neil");
    expect(textCell("a-b")).toBe("a-b");
    expect(textCell("さくら=1")).toBe("さくら=1");
  });
});
