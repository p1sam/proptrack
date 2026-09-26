/**
 * CSV writing with a spreadsheet formula-injection guard. Pure — no I/O, unit-tested.
 *
 * A cell whose text starts with = + - @ TAB or CR can be interpreted as a formula by Excel,
 * LibreOffice or Google Sheets. Such cells are prefixed with a single quote, which the
 * spreadsheet shows as plain text. Pure numbers ("-12.5", "+3", "1e5") are left untouched so
 * negative P&L stays numeric.
 */

export type CsvValue = string | number | boolean | null | undefined | Date;

const PURE_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const DANGEROUS_START = /^[=+\-@\t\r]/;

export function guardFormula(text: string): string {
  if (!DANGEROUS_START.test(text)) return text;
  if (PURE_NUMBER.test(text)) return text;
  return `'${text}`;
}

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "number") text = Number.isFinite(value) ? String(value) : "";
  else if (typeof value === "boolean") text = value ? "true" : "false";
  else if (value instanceof Date) text = value.toISOString();
  else text = guardFormula(value);
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serialise rows with a header line. CRLF line endings and a UTF-8 BOM so Excel opens it cleanly. */
export function toCsv(header: string[], rows: CsvValue[][], opts: { bom?: boolean } = {}): string {
  const lines = [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  return `${opts.bom === false ? "" : "﻿"}${lines.join("\r\n")}\r\n`;
}
