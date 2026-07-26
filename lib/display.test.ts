import { describe, it, expect } from "vitest";
import { changePercent, changeAbsolute, decimalsFor, energy, flutterMargin, fmtSmall, lengthMm } from "./display";
import { RECOMMENDED_FLUTTER_MARGIN } from "./sim/flutter";

describe("energy", () => {
  it("shows joules in metric and foot-pounds-force in imperial", () => {
    // 100 J → 100 J metric; ×0.737562 → ~74 ft·lbf imperial.
    expect(energy(100, "metric")).toEqual({ value: "100", unit: "J" });
    expect(energy(100, "imperial")).toEqual({ value: "74", unit: "ft·lbf" });
  });
  it("keeps a decimal only for small values", () => {
    expect(energy(4.5, "metric")).toEqual({ value: "4.5", unit: "J" });
    // 5 J ≈ 3.7 ft·lbf — still small, so a decimal is kept in imperial too.
    expect(energy(5, "imperial")).toEqual({ value: "3.7", unit: "ft·lbf" });
  });
});

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

describe("fmtSmall / lengthMm / flutterMargin", () => {
  it("keeps a value that would round away, in both unit systems", () => {
    // The 0.254 mm (0.010 in) balsa fin Cherokee-E-5055.ork specifies. Whole millimetres and tenths
    // of an inch both round it to nothing, which reads as a missing dimension rather than a thin fin.
    expect(lengthMm(0.000254, "metric")).toEqual({ value: "0.3", unit: "mm" });
    expect(lengthMm(0.000254, "imperial")).toEqual({ value: "0.01", unit: "in" });
  });

  it("leaves ordinary dimensions at their usual precision", () => {
    expect(lengthMm(0.038, "metric")).toEqual({ value: "38", unit: "mm" });
    expect(lengthMm(1.2, "metric")).toEqual({ value: "1,200", unit: "mm" });
    expect(lengthMm(0.038, "imperial")).toEqual({ value: "1.5", unit: "in" });
  });

  it("states a bound rather than a zero when a value is below what it can say", () => {
    expect(fmtSmall(1e-9, 1)).toBe("<0.00001");
    // The same sign glyph an ordinary value gets, so the two read alike in one column.
    expect(fmtSmall(-1e-9, 1)).toBe("-<0.00001");
    expect(fmtSmall(-0.04, 1).startsWith("-")).toBe(true);
    expect(fmtSmall(0, 1)).toBe("0");
    expect(fmtSmall(NaN, 1)).toBe("—");
  });

  it("tells thin flutter margins apart instead of printing them all as 0×", () => {
    // Cherokee-E-5055's five stored configurations land between these; at one decimal every one of
    // them read "0×", so the worst margins in the corpus were indistinguishable on a safety flag.
    expect(flutterMargin(0.011813876548032825)).toBe("0.01×");
    expect(flutterMargin(0.04872690796526505)).toBe("0.05×");
    expect(flutterMargin(1.4)).toBe("1.4×");
    expect(flutterMargin(RECOMMENDED_FLUTTER_MARGIN)).toBe("1.5×");
  });

  it("reports the precision a pair of values needs, for a row formatted at one scale", () => {
    // The what-if row shows base, current and the change between them; taking the widest keeps the
    // delta from reading "0" beside two values that plainly differ.
    expect(decimalsFor(1.4, 1)).toBe(1);
    expect(decimalsFor(0.0118, 1)).toBe(2);
    expect(Math.max(decimalsFor(0.0118, 1), decimalsFor(0.0487, 1))).toBe(2);
    expect(changeAbsolute(0.0118, 0.0487, "×", 2).text).toBe("+0.04 ×");
  });

  it("widens for the change as well as the ends, so the row can't contradict itself", () => {
    // The precision the two ENDS need is not enough: at one decimal 1.44 → 1.46 renders as
    // "1.4 → 1.5" with a change of "0", which is exactly the disagreement the shared precision is
    // meant to prevent. The row's rule is max(base, cur, difference).
    const row = (base: number, cur: number) => {
      const dp = Math.max(decimalsFor(base, 1), decimalsFor(cur, 1), decimalsFor(cur - base, 1));
      return [fmtSmall(base, dp), fmtSmall(cur, dp), changeAbsolute(base, cur, "×", dp).text];
    };
    expect(row(1.44, 1.46)).toEqual(["1.44", "1.46", "+0.02 ×"]);
    expect(row(0.0149, 0.0151)).toEqual(["0.0149", "0.0151", "+0.0002 ×"]);
    // An ordinary change is unaffected — the widening only fires when it has to.
    expect(row(1.2, 1.9)).toEqual(["1.2", "1.9", "+0.7 ×"]);
    // No change at all still reads as a plain 0, not a spurious precision.
    expect(row(1.4, 1.4)).toEqual(["1.4", "1.4", "0 ×"]);
  });
});
