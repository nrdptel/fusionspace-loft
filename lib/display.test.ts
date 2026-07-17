import { describe, it, expect } from "vitest";
import { changePercent, changeAbsolute } from "./display";

describe("changePercent", () => {
  it("computes a signed percentage from baseline to current", () => {
    // 1000 → 812 is −18.8% → rounds to −19% (≥10% magnitude drops the decimal).
    expect(changePercent(1000, 812)).toEqual({ text: "−19%", dir: -1 });
    // A rise keeps a leading +.
    expect(changePercent(800, 1000)).toEqual({ text: "+25%", dir: 1 });
  });

  it("keeps one decimal for small magnitudes, none for large", () => {
    expect(changePercent(1000, 1042).text).toBe("+4.2%");
    expect(changePercent(1000, 958).text).toBe("−4.2%");
    expect(changePercent(1000, 1180).text).toBe("+18%");
  });

  it("reads a change that rounds to zero as a plain 0%, never a signed +0%", () => {
    const c = changePercent(1000, 1000.2);
    expect(c.text).toBe("0%");
    expect(c.dir).toBe(0);
  });

  it("returns an em dash when the baseline is ~0 (percentage undefined)", () => {
    expect(changePercent(0, 5)).toEqual({ text: "—", dir: 0 });
    expect(changePercent(NaN, 5)).toEqual({ text: "—", dir: 0 });
    expect(changePercent(5, NaN)).toEqual({ text: "—", dir: 0 });
  });
});

describe("changeAbsolute", () => {
  it("computes a signed absolute change in the given unit", () => {
    expect(changeAbsolute(2.1, 3.0, "cal")).toEqual({ text: "+0.9 cal", dir: 1 });
    expect(changeAbsolute(3.0, 2.1, "cal")).toEqual({ text: "−0.9 cal", dir: -1 });
  });

  it("honors the requested precision and omits a blank unit", () => {
    expect(changeAbsolute(1.234, 1.239, "", 3).text).toBe("+0.005");
  });

  it("reads no change as 0 with dir 0", () => {
    const c = changeAbsolute(2.5, 2.5, "cal");
    expect(c.dir).toBe(0);
    expect(c.text).toBe("0 cal");
  });

  it("returns an em dash for non-finite inputs", () => {
    expect(changeAbsolute(NaN, 1, "cal")).toEqual({ text: "—", dir: 0 });
  });
});
