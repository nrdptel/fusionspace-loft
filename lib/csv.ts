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

/** A displayed quantity as a CSV cell: the digits, without the thousands separator and without the
 *  unit — and the header that has to travel with it.
 *
 *  **Derived from the SAME `Quantity` the cell renders, and that is the point rather than tidiness.**
 *  A column whose export converts separately from its cell has two sources of truth for one number,
 *  and they drift the moment one of them learns about a unit toggle. Measured 2026-08-11: the parts
 *  table rendered `d.lengthMm(xFore, units)` on screen and exported `xFore * 1000` — so in Imperial a
 *  flyer read *12.8 in* and pasted *323.8* into a build sheet, 25.4x off, under a header reading
 *  `Station` with no unit anywhere in the file. The flight-phases table did the same with raw SI
 *  altitude and speed. Taking both from one call makes that class of drift unrepresentable.
 *
 *  The unit moves to the HEADER because a CSV cell cannot be both a number a spreadsheet will sum and
 *  a string carrying its unit — which is what `Column.csvLabel` already exists for, and what
 *  `PartPicker` had been doing by hand all along. */
export function csvQuantity(q: { value: string; unit: string }): CsvCell {
  const n = Number(q.value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : "";
}

/** `Station` + `mm` → `Station (mm)`. The unit is read off the quantity the column actually renders,
 *  so a header cannot name a unit the cells are not in. A unitless quantity keeps its bare label. */
export function csvHeader(label: string, q: { unit: string }): string {
  return q.unit ? `${label} (${q.unit})` : label;
}
