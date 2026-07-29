import { describe, it, expect } from "vitest";
import { listWords, rangeWords, refusedMessage } from "./what-if";

describe("rangeWords", () => {
  it("says a missing bound in words rather than leaving a dash", () => {
    // "0 to –" reads as a range that failed to load. Nearly every design field is floored at zero
    // and open above, so this is the common case, not the edge one.
    expect(rangeWords(0, undefined)).toBe("0 or more");
    expect(rangeWords(undefined, 12)).toBe("up to 12");
    expect(rangeWords(1, 12)).toBe("1 to 12");
    expect(rangeWords(undefined, undefined)).toBeUndefined();
  });

  it("keeps a zero lower bound, which is falsy and easy to drop", () => {
    expect(rangeWords(0, 100)).toBe("0 to 100");
  });
});

describe("refusedMessage", () => {
  it("names what is being flown instead, which is the half that matters", () => {
    expect(refusedMessage("-3", "0 or more", "60")).toBe(
      "-3 isn't a value this can fly (0 or more) — flying 60.",
    );
  });

  it("still says something useful when the field has no range or nothing to name", () => {
    expect(refusedMessage("abc", undefined, "60")).toBe("abc isn't a value this can fly — flying 60.");
    expect(refusedMessage("-3", "0 or more", undefined)).toBe("-3 isn't a value this can fly (0 or more).");
    expect(refusedMessage("-3")).toBe("-3 isn't a value this can fly.");
  });

  it("uses a plain apostrophe, the one a screen reader and a test both expect", () => {
    expect(refusedMessage("-3")).toContain("isn't");
    expect(refusedMessage("-3")).not.toContain("’");
  });
});

describe("listWords", () => {
  it("reads as a sentence at every length", () => {
    expect(listWords([])).toBe("");
    expect(listWords(["rail length"])).toBe("rail length");
    expect(listWords(["rail length", "surface wind"])).toBe("rail length and surface wind");
    expect(listWords(["rail length", "rail angle", "surface wind"])).toBe(
      "rail length, rail angle, and surface wind",
    );
    // The from-scratch case: a design that stores no launch setup at all.
    expect(listWords(["rail length", "rail angle", "surface wind", "field elevation"])).toBe(
      "rail length, rail angle, surface wind, and field elevation",
    );
  });
});
