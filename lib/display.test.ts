import { describe, it, expect } from "vitest";
import { changePercent, changeAbsolute, decimalsFor, dynamicPressure, energy, flutterMargin, fmtEditable, fmtSmall, lengthMm, mass, roundTripDecimals, storedRunLabels } from "./display";
import { mToFt, mpsToMph } from "./units";
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

describe("dynamicPressure", () => {
  it("shows kilopascals in metric and psi in imperial", () => {
    // 25,500 Pa: 25.5 kPa metric; ÷6894.757 → 3.70 psi imperial. This is the one Flight-card stat of
    // sixteen that used to read kPa whichever system was selected.
    expect(dynamicPressure(25_500, "metric")).toEqual({ value: "25.5", unit: "kPa" });
    expect(dynamicPressure(25_500, "imperial")).toEqual({ value: "3.7", unit: "psi" });
  });
  it("keeps enough precision for a low-power flight", () => {
    // A small Estes-class max-Q is a fraction of a psi; a whole number there would read as zero.
    expect(dynamicPressure(2_000, "imperial")).toEqual({ value: "0.29", unit: "psi" });
    expect(dynamicPressure(2_000, "metric")).toEqual({ value: "2", unit: "kPa" });
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

  it("never prints a real part's mass as a flat zero", () => {
    // **SEV-1, 2026-08-18.** A fixed 3 dp of kg / 2 dp of lb rounded real parts away: measured across
    // the 35-design corpus, **39 of 481 parts with a mass rendered `0 kg` and 91 rendered `0 lb`, on
    // 18 of the 35 designs** — on the table whose own job is confirming an import against a build
    // sheet, beside a percent column saying the same part is up to 3.55% of dry mass.
    //
    // The three cases are the real ones, in the units they were measured in: a 0.328 g centring ring
    // (`3D printable nose cone and fins.ork`), a 0.080 g launch lug (`Base drag hack`), and a 2.000 g
    // wadding — the 3.55% one, which metric already showed and imperial did not.
    expect(mass(0.000328, "metric")).toEqual({ value: "0.0003", unit: "kg" });
    expect(mass(0.000328, "imperial")).toEqual({ value: "0.001", unit: "lb" });
    expect(mass(0.00008, "metric")).toEqual({ value: "0.0001", unit: "kg" });
    expect(mass(0.002, "imperial")).toEqual({ value: "0.004", unit: "lb" });

    // Ordinary masses are untouched — `fmt` and `fmtSmall` agree above the threshold, so this
    // changed 39 cells and 91, not every mass in the app. Without this the case above would pass on
    // a formatter that had simply grown every column.
    expect(mass(1.234, "metric")).toEqual({ value: "1.234", unit: "kg" });
    expect(mass(8.265, "metric")).toEqual({ value: "8.265", unit: "kg" });
    expect(mass(0.4536, "imperial")).toEqual({ value: "1", unit: "lb" });

    // A true zero is still a plain zero: a part that genuinely weighs nothing is a different fact
    // from one that rounds away, and `fmtSmall` is the function that tells them apart.
    expect(mass(0, "metric")).toEqual({ value: "0", unit: "kg" });
    expect(mass(0, "imperial")).toEqual({ value: "0", unit: "lb" });
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

describe("storedRunLabels", () => {
  const run = (simIndex: number, motors: string[], name: string, storedApogeeM?: number) => ({
    simIndex,
    motors,
    name,
    storedApogeeM,
  });

  it("leaves distinct runs alone", () => {
    expect(
      storedRunLabels([run(0, ["H128W"], "Simulation 1", 300), run(1, ["G40W"], "Simulation 2", 180)], "metric"),
    ).toEqual(["H128W · 300 m", "G40W · 180 m"]);
  });

  it("names the run when motor and apogee repeat", () => {
    // `Clustered motors.ork`: two genuinely different configurations, both stored at 307 m.
    expect(
      storedRunLabels([run(3, ["C6"], "Simulation 4", 307), run(4, ["C6"], "Simulation 5", 307)], "metric"),
    ).toEqual(["C6 · 307 m · Simulation 4", "C6 · 307 m · Simulation 5"]);
  });

  it("falls back to the run's position when the name repeats too", () => {
    // `FullScaleModelTH.rkt` stores fifteen runs of one motor and reuses "L1940X-P" across them.
    expect(
      storedRunLabels(
        [run(3, ["L1940X"], "L1940X-P", 2105), run(7, ["L1940X"], "L1940X-P", 2105)],
        "metric",
      ),
    ).toEqual(["L1940X · 2,105 m · L1940X-P · #4", "L1940X · 2,105 m · L1940X-P · #8"]);
  });

  it("never returns two identical labels, even for runs identical in every field", () => {
    // Varying only `simIndex` would make this tautological — that is the field the tiebreaker uses.
    // These six runs agree on everything, including their index, so distinctness has to come from
    // the function itself.
    const runs = Array.from({ length: 6 }, () => run(0, ["L1940X"], "same", 2100));
    const labels = storedRunLabels(runs, "imperial");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("does not repeat a name the label already carries", () => {
    // RASAero names each run after its own motor, and an .ork whose configuration didn't resolve
    // falls back to the name for the motor half — so appending it blindly read "J90W · 1,200 m · J90W".
    expect(
      storedRunLabels([run(0, ["J90W"], "J90W", 1200), run(1, ["J90W"], "J90W", 1200)], "metric"),
    ).toEqual(["J90W · 1,200 m · #1", "J90W · 1,200 m · #2"]);
    expect(
      storedRunLabels([run(0, [], "Simulation", 307), run(1, [], "Simulation", 307)], "metric"),
    ).toEqual(["Simulation · 307 m · #1", "Simulation · 307 m · #2"]);
    // And the backstop still holds when a run's own name reads like another's position marker.
    expect(
      new Set(
        storedRunLabels(
          [run(0, ["C6"], "Sim", 307), run(1, ["C6"], "Sim", 307), run(2, ["C6"], "Sim · #2", 307)],
          "metric",
        ),
      ).size,
    ).toBe(3);
  });

  it("withholds an apogee it doesn't actually have rather than printing an em dash", () => {
    expect(storedRunLabels([run(0, ["C6"], "s", NaN)], "metric")).toEqual(["C6"]);
    expect(storedRunLabels([run(0, ["C6"], "s", Infinity)], "metric")).toEqual(["C6"]);
    expect(storedRunLabels([{ simIndex: 0, motors: ["C6"], name: "s", storedApogeeM: undefined }], "metric")).toEqual(["C6"]);
  });

  it("marks a stored apogee the source tool doesn't stand behind", () => {
    // 18 of the corpus's 108 picker options quote a run marked outdated or never run — all five on
    // USLI2025-FULLSCALE. Unmarked, they read as the tool's current answer for the design on screen.
    expect(
      storedRunLabels(
        [
          { simIndex: 0, motors: ["L1000"], name: "a", storedApogeeM: 1500, status: "uptodate" },
          { simIndex: 1, motors: ["L1000"], name: "b", storedApogeeM: 1400, status: "outdated" },
          { simIndex: 2, motors: ["L1000"], name: "c", storedApogeeM: 1300, status: "notsimulated" },
        ],
        "metric",
      ),
    ).toEqual(["L1000 · 1,500 m", "L1000 · 1,400 m (outdated)", "L1000 · 1,300 m (not run)"]);
  });

  it("falls back to the run's name when it has no motors and no stored apogee", () => {
    expect(storedRunLabels([run(0, [], "Simulation 1")], "metric")).toEqual(["Simulation 1"]);
    expect(storedRunLabels([run(0, [], "")], "metric")).toEqual(["Configuration"]);
  });
});

describe("roundTripDecimals / fmtEditable", () => {
  it("leaves a number alone when the field's own precision already states it", () => {
    // 10 ft of rail, 4 m/s of wind: nothing to add, and adding it would be noise.
    expect(fmtEditable(10, 1)).toBe("10.0");
    expect(fmtEditable(4, 0)).toBe("4");
    expect(roundTripDecimals(2.5, 1)).toBe(1);
  });

  it("grows precision until the advertised number is the flown one", () => {
    // The measured trap: 0.599 m/s of surface wind on Show-off.CDX1, in imperial. Whole mph
    // advertised "1" — 25% under the 1.34 mph actually being flown.
    const mph = mpsToMph(0.599);
    expect(mph.toFixed(0)).toBe("1"); // what it used to say
    expect(fmtEditable(mph, 0)).toBe("1.34");
    expect(Math.abs(Number(fmtEditable(mph, 0)) - mph) / mph).toBeLessThanOrEqual(0.001);
  });

  it("does the same for a rail length that is a round number in the other system", () => {
    // 3.048 m is exactly 10 ft. Metric at 1 dp advertised "3.0" — 1.6% short.
    expect((3.048).toFixed(1)).toBe("3.0");
    expect(fmtEditable(3.048, 1)).toBe("3.05");
    expect(fmtEditable(mToFt(3.048), 1)).toBe("10.0");
  });

  it("never grows past its cap, and treats zero and non-finite values as the plain case", () => {
    // Below what the cap can state, it stops rather than printing forever — and says the closest
    // number it has, which is a limit of the field and not a claim about the flight.
    expect(roundTripDecimals(0.00033, 1)).toBe(5);
    expect(fmtEditable(0.00033, 1)).toBe("0.00033");
    // 0.1% is reached at three decimals for a third of a unit, so the cap never comes into it.
    expect(roundTripDecimals(1 / 3, 1)).toBe(3);
    expect(roundTripDecimals(0, 1)).toBe(1);
    expect(roundTripDecimals(Number.NaN, 1)).toBe(1);
    expect(fmtEditable(Number.POSITIVE_INFINITY, 1)).toBe("");
  });

  it("keeps the result parseable by the field that reads it back", () => {
    // `fmt` would group thousands, and Number("16,400") is NaN — so a field elevation at the top of
    // its range has to come out as digits and a point, nothing else.
    for (const v of [16400, 1234.5678, 0.599, 3.048, 90]) {
      expect(fmtEditable(v, 1)).toMatch(/^-?\d+(\.\d+)?$/);
      expect(Number.isFinite(Number(fmtEditable(v, 1)))).toBe(true);
    }
  });

  it("holds the round trip within tolerance across a sweep of real values", () => {
    // A blanket guarantee rather than five spot checks: for anything a Conditions field can hold,
    // reading the advertised number back lands within 0.1% of what is flown.
    for (let mps = 0.05; mps <= 40; mps += 0.05) {
      const shown = Number(fmtEditable(mpsToMph(mps), 0));
      expect(Math.abs(shown - mpsToMph(mps)) / mpsToMph(mps)).toBeLessThanOrEqual(0.001);
    }
  });
});
