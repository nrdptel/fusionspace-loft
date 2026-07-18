/** Tiny CSV serialiser for exporting Loft's analysis tables (motor sweep, parameter sweep, mass
 *  breakdown). Client-side only — the data never leaves the browser except when the flyer saves it.
 *  Follows RFC 4180: a field is quoted when it contains a comma, quote, or newline, and embedded
 *  quotes are doubled. */

export type CsvCell = string | number;

function escapeCell(cell: CsvCell): string {
  const s = typeof cell === "number" ? (Number.isFinite(cell) ? String(cell) : "") : cell;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise a grid of rows (the first row is normally the header) to a CSV string with CRLF line
 *  endings, as spreadsheets expect. */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}
