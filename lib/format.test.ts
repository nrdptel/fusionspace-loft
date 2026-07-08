import { describe, it, expect } from "vitest";
import { round, fmt, fmtMass } from "./format";

describe("round", () => {
  it("rounds to the given number of decimals (default 2)", () => {
    expect(round(1.23456)).toBe(1.23);
    expect(round(1.23456, 3)).toBe(1.235);
    expect(round(1.5, 0)).toBe(2);
  });

  it("is half-up (toward +∞), pinned so the behavior can't drift silently", () => {
    expect(round(0.005, 2)).toBe(0.01);
    expect(round(2.5, 0)).toBe(3);
    expect(round(-2.5, 0)).toBe(-2); // half-up: -2.5 → -2, not -3
  });

  it("never returns negative zero", () => {
    expect(Object.is(round(-0.001), 0)).toBe(true);
    expect(Object.is(round(-0.4, 0), 0)).toBe(true);
    expect(Object.is(round(-0), 0)).toBe(true);
  });

  it("maps non-finite inputs to 0", () => {
    expect(round(NaN)).toBe(0);
    expect(round(Infinity)).toBe(0);
    expect(round(-Infinity)).toBe(0);
  });
});

describe("fmt", () => {
  it("shows an em dash for non-finite values", () => {
    expect(fmt(NaN)).toBe("—");
    expect(fmt(Infinity)).toBe("—");
    expect(fmt(-Infinity)).toBe("—");
  });

  it("pins the en-US locale separator (avoids a hydration mismatch)", () => {
    expect(fmt(1234.5, 1)).toBe("1,234.5");
    expect(fmt(1.87)).toBe("1.87");
  });

  it("never renders a negative zero", () => {
    expect(fmt(-0.0004, 3)).toBe("0");
    expect(fmt(-0, 2)).toBe("0");
  });

  it("trims to the requested precision", () => {
    expect(fmt(3.14159, 2)).toBe("3.14");
    expect(fmt(3, 2)).toBe("3");
  });
});

describe("fmtMass", () => {
  it("shows an em dash for zero, negative, and non-finite mass", () => {
    expect(fmtMass(0)).toBe("—");
    expect(fmtMass(-1)).toBe("—");
    expect(fmtMass(-0)).toBe("—");
    expect(fmtMass(NaN)).toBe("—");
    expect(fmtMass(Infinity)).toBe("—");
  });

  it("formats a normal charge to two decimals", () => {
    expect(fmtMass(0.93)).toBe("0.93");
    expect(fmtMass(1.5)).toBe("1.50");
    expect(fmtMass(12)).toBe("12.00");
  });

  it("never shows a misleading '0.00' for a real but tiny charge", () => {
    // A positive charge below display precision must read as "<0.01", not "0.00"
    // (which would look like no charge on a tool where under-sizing is the danger).
    expect(fmtMass(0.003)).toBe("<0.01");
    expect(fmtMass(0.004)).toBe("<0.01");
    expect(fmtMass(0.001)).not.toBe("0.00");
    // …but a charge of 0.01 g or more shows the number.
    expect(fmtMass(0.01)).toBe("0.01");
    expect(fmtMass(0.02)).toBe("0.02");
  });
});
