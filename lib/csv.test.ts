import { describe, it, expect } from "vitest";
import { toCsv, toTsv, withPreamble } from "./csv";

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });

  it("renders numbers without thousands separators, and drops non-finite values", () => {
    expect(toCsv([["x", 1556, 3.14]])).toBe("x,1556,3.14");
    expect(toCsv([[NaN, Infinity]])).toBe(",");
  });

  it("quotes fields containing a comma, quote, or newline and doubles embedded quotes", () => {
    expect(toCsv([["a,b", 'he said "hi"', "line1\nline2"]])).toBe('"a,b","he said ""hi""","line1\nline2"');
  });

  it("leaves ordinary text unquoted", () => {
    expect(toCsv([["H128W", "AeroTech"]])).toBe("H128W,AeroTech");
  });
});

describe("toTsv", () => {
  it("joins cells with tabs and rows with newlines, ready to paste", () => {
    expect(toTsv([["a", "b"], [1, 2]])).toBe("a\tb\n1\t2");
  });

  it("writes a blank for a value that isn't a number", () => {
    expect(toTsv([[NaN, Infinity, 0]])).toBe("\t\t0");
  });

  it("quotes only what would break a paste, and never lets a tab split a cell", () => {
    expect(toTsv([["plain"]])).toBe("plain");
    expect(toTsv([["a,b"]])).toBe("a,b"); // a comma is fine in a tab-separated cell
    expect(toTsv([['say "hi"']])).toBe('"say ""hi"""');
    expect(toTsv([["two\nlines"]])).toBe('"two\nlines"');
    expect(toTsv([["a\tb"]])).toBe('"a b"');
  });
});

/** The caveat has to reach the file, and it has to land where a spreadsheet can live with it.
 *
 *  An export is a grid of cells and nothing else, so a note rendered beside a table does not travel
 *  with it — and this repo's ledger lists that shape repeatedly, most recently the validation panel
 *  naming the metrics it withheld on screen while exporting rows that said nothing about them. */
describe("withPreamble", () => {
  const grid = [
    ["Metric", "Stored", "Loft"],
    ["Apogee", 100, 101],
  ];

  it("puts each caveat above the header, one cell per line", () => {
    const out = withPreamble(["Not compared — deployment velocity: nothing opened", "Second note"], grid);
    expect(out).toEqual([
      ["Not compared — deployment velocity: nothing opened"],
      ["Second note"],
      ["Metric", "Stored", "Loft"],
      ["Apogee", 100, 101],
    ]);
  });

  /** **Above, not below**, and this is the case that says why. A spreadsheet takes the first row as
   *  the header and everything under it as data, so a footnote appended at the end becomes a data
   *  row that sorts into the middle of the numbers it is trying to qualify. */
  it("leaves the header as the first row a spreadsheet would read after the notes", () => {
    const out = withPreamble(["note"], grid);
    expect(out[0]).toEqual(["note"]);
    expect(out[1]).toEqual(["Metric", "Stored", "Loft"]);
    expect(out[out.length - 1]).toEqual(["Apogee", 100, 101]);
  });

  it("changes nothing for a table with nothing extra to say", () => {
    expect(withPreamble(undefined, grid)).toEqual(grid);
    expect(withPreamble([], grid)).toEqual(grid);
  });

  it("survives the serialiser it exists to feed", () => {
    // A comma and a quote in a caveat must not break the columns underneath it.
    const csv = toCsv(withPreamble(['Not compared — flight time: still descending, "capped"'], grid));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"Not compared — flight time: still descending, ""capped"""');
    expect(lines[1]).toBe("Metric,Stored,Loft");
  });
});
