import { describe, it, expect } from "vitest";
import { listWords, rangeWords, refusedMessage, conditionsPhrase } from "./what-if";

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

  it("distinguishes a floor the field takes from one it does not", () => {
    // The difference between these two sentences is the difference between a rail 0 m long being
    // offered as a legal launch setup and being refused, so the words have to carry it.
    expect(rangeWords(0, undefined, true)).toBe("more than 0");
    expect(rangeWords(0, 20, true)).toBe("more than 0, up to 20");
    // Absent or false leaves the inclusive wording exactly as it was — every existing field reads
    // the same sentence it read before.
    expect(rangeWords(0, 20, false)).toBe("0 to 20");
    expect(rangeWords(0, 20)).toBe("0 to 20");
    // No lower bound means there is no floor to qualify, exclusive or not.
    expect(rangeWords(undefined, 12, true)).toBe("up to 12");
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

describe("conditionsPhrase", () => {
  const none = { railEdited: false, elevationEdited: false, windEdited: false, today: false, defaulted: false };

  it("names the file when the flyer changed nothing", () => {
    expect(conditionsPhrase(none, { wind: true })).toBe("the design's stored launch conditions");
    expect(conditionsPhrase(undefined, { wind: true })).toBe("the design's stored launch conditions");
  });

  it("does not credit the flyer for a field this panel never reads", () => {
    // The two sweeps fly ballistic and `runFlight` zeroes the wind for a ballistic run, so a
    // surface-wind edit changes not one row. One shared flag flipped their captions to "the launch
    // conditions you set" while the whole rail-exit column was bit-identical.
    expect(conditionsPhrase({ ...none, windEdited: true }, { wind: false })).toBe(
      "the design's stored launch conditions",
    );
    expect(conditionsPhrase({ ...none, windEdited: true }, { wind: true })).toBe("the launch conditions you set");
  });

  it("credits the flyer for the fields every panel does read", () => {
    for (const src of [{ ...none, railEdited: true }, { ...none, elevationEdited: true }]) {
      expect(conditionsPhrase(src, { wind: false })).toBe("the launch conditions you set");
      expect(conditionsPhrase(src, { wind: true })).toBe("the launch conditions you set");
    }
  });

  it("does not call a fetched forecast something the flyer set", () => {
    // `onWeather` CLEARS the two edits it overrides and the panel greys both fields, so under
    // today's weather the flyer has set none of it.
    expect(conditionsPhrase({ ...none, today: true }, { wind: true })).toBe("today's weather at your site");
    expect(conditionsPhrase({ ...none, today: true, railEdited: true }, { wind: true })).toBe(
      "the launch conditions you set, over today's weather at your site",
    );
  });

  it("does not call Loft's own defaults the design's stored conditions", () => {
    // The Conditions panel says so in amber on the same page; claiming otherwise a screen away is
    // the page contradicting itself about whose numbers are being flown.
    expect(conditionsPhrase({ ...none, defaulted: true }, { wind: true })).toBe(
      "Loft's own default launch conditions — this design states none",
    );
    // An edit outranks it: those conditions ARE the flyer's now.
    expect(conditionsPhrase({ ...none, defaulted: true, railEdited: true }, { wind: true })).toBe(
      "the launch conditions you set",
    );
  });
});
