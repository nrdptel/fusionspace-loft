import { describe, it, expect } from "vitest";
import { toCsv, toTsv } from "./csv";

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
