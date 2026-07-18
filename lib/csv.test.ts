import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

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
