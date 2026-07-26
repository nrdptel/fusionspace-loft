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

/** The same grid as tab-separated text, which is what a spreadsheet, a forum post and a chat window
 *  all paste correctly — a file download is the wrong shape for "put these numbers in my build
 *  thread". A tab can't appear in any cell Loft produces (they are numbers and short labels), so a
 *  cell only needs quoting when it carries a newline or a quote. */
export function toTsv(rows: CsvCell[][]): string {
  const cell = (c: CsvCell): string => {
    const s = typeof c === "number" ? (Number.isFinite(c) ? String(c) : "") : c;
    return /["\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""').replace(/\t/g, " ")}"` : s;
  };
  return rows.map((row) => row.map(cell).join("\t")).join("\n");
}
