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
/** A grid with its caveats above the header, which is where a spreadsheet can live with them.
 *
 *  **An export is a grid of cells and nothing else, so a note rendered beside a table does not
 *  travel with it** — and a file of confident numbers with the caveat stripped is the same wrong
 *  claim one step further from the flyer. This ledger lists that shape repeatedly; the validation
 *  panel is the most recent, naming the metrics it withheld on screen while exporting rows that said
 *  nothing about them.
 *
 *  **Above the header, not below the last row**, and that is the whole reason this is a named
 *  function rather than a spread at each call site. A spreadsheet's own tooling — sort, filter, a
 *  chart range — takes the first row as the header and everything under it as data, so a footnote
 *  appended at the bottom becomes a data row that sorts into the middle of the numbers it is trying
 *  to qualify. Each line is its own single-cell row for the same reason: a caveat packed into the
 *  header row would shift every column.
 *
 *  No preamble returns the grid exactly as it was, so a table that has nothing extra to say exports
 *  byte-for-byte what it always did. */
export function withPreamble(preamble: string[] | undefined, grid: CsvCell[][]): CsvCell[][] {
  if (!preamble?.length) return grid;
  return [...preamble.map((line): CsvCell[] => [line]), ...grid];
}

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
