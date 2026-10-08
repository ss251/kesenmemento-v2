// Contributor backend: CSV for people who open it in Excel.
//
//   * UTF-8 with a byte-order mark: without it Excel on Windows decodes the file as the system code page and
//     Japanese nicknames turn into mojibake.
//   * CRLF line ends and RFC 4180 quoting (a cell with a comma, quote or line break is quoted; quotes double).
//   * Spreadsheet formula injection guard: a text cell that starts with = + - @ tab or CR gets a leading
//     apostrophe, so a nickname like =HYPERLINK(...) is shown as text instead of being evaluated.
//   * クルーNo. is 14 digits: Excel would show 1.23457E+13 and drop a leading zero. In "excel" mode the cell is
//     written as ="12345678901234", a formula whose value is that text, which Excel (and Google Sheets) keep as
//     text. Scripts can ask for plain digits instead.

export const BOM = "\uFEFF";

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One text cell, quoted when needed and neutralised against formula injection.
 * @param {unknown} value
 */
export function textCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A number cell: finite numbers only, written plainly. */
export function numberCell(value) {
  return Number.isFinite(value) ? String(value) : "";
}

/**
 * A 14-digit identifier. `excel: true` -> ="12345678901234" (kept as text by Excel); false -> 12345678901234.
 * Anything that is not exactly 14 digits is written as an empty cell: the value is validated at input, and
 * must never become a formula through this path.
 */
export function crewNoCell(value, excel = true) {
  if (typeof value !== "string" || !/^[0-9]{14}$/.test(value)) return "";
  return excel ? `="${value}"` : value;
}

/**
 * The crew-number export: header `crew_no,nickname,points,accepted`, one row per クルーNo.
 * @param {Array<{crewNo: string, nickname: string, points: number, accepted: number}>} rows
 * @param {{excel?: boolean}} [opts]
 * @returns {string} the whole file, BOM first
 */
export function crewCsv(rows, { excel = true } = {}) {
  const lines = ["crew_no,nickname,points,accepted"];
  for (const r of rows) lines.push([crewNoCell(r.crewNo, excel), textCell(r.nickname), numberCell(r.points), numberCell(r.accepted)].join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}
