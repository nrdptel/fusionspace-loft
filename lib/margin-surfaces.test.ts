import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every surface that publishes a static margin has to gate it the same way — a census, because the
 *  same defect has now arrived twice from two different directions.
 *
 *  **The rule.** The static margin is `(X_cp − X_cg) / d_ref`, and `X_cg` is the LOADED centre of
 *  gravity. A configuration with an unresolved motor is missing that motor's mass from it, so the
 *  margin is not merely imprecise — it is a different rocket's number, and it errs in the reassuring
 *  direction: measured on `demo-single-deploy.ork` with its motor made unresolvable, 4.065 → 5.921
 *  cal, +46%. The flight summary has therefore withheld it under `!motorsComplete` since that was
 *  measured.
 *
 *  **Why a census and not a proof.** `hasPropulsion` is `some(match)` and `motorsComplete` is
 *  `every(match)`, and both are legitimate gates for DIFFERENT things: a partial configuration still
 *  produces an apogee Loft stands behind, which is why the sweeps and the dispersion are offered at
 *  all. So "is this surface gated correctly" cannot be answered by grepping for one predicate — it
 *  needs a human to have looked. What this test does is make sure a human HAS looked at every one:
 *  the set of files presenting the figure is asserted exactly, so a new surface, or an old one that
 *  starts presenting it, fails until it is added here with a note saying how it is gated.
 *
 *  Both defects this exists for were real, shipped, and found by a reviewer rather than by the gate:
 *  `lib/sim/sweep.ts` published a whole curve of the figure directly under the cell withholding it
 *  (1.098 / 1.290 / 1.487 cal on a two-mount design), and `WhatIfDelta` published two margins AND a
 *  signed change between them — the second of which is wrong in a way the first is not, because the
 *  two flights resolve their motors independently and a motor-swap what-if gives a complete current
 *  flight against an incomplete baseline.
 */

const ROOT = process.cwd();

function tsxUnder(dir: string): string[] {
  const out: string[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) out.push(p);
    }
  })(join(ROOT, dir));
  return out;
}

/** Every file that puts a static margin in front of a flyer, and how each one is gated.
 *
 *  Adding a file here is a claim that somebody checked it. Removing one is a claim that it no longer
 *  presents the figure. Neither is something to do to make a red test go green. */
const MARGIN_SURFACES: Record<string, string> = {
  "components/ResultsView.tsx":
    "the summary strip and the what-if comparison card — both `run.motorsComplete`, and the card also " +
    "requires `baseline.motorsComplete` because it prints a CHANGE between two independently-resolved flights",
  "components/GeometryInspector.tsx":
    "the diagram's CG/CP marks and its accessible name — the caller passes `marginCal` only when " +
    "`run.motorsComplete`, and the panel says why when it is absent",
  "components/ParameterSweep.tsx":
    "the swept curve and its CSV — the metric is removed from the picker, and the reason printed, when " +
    "the caller passes `marginWithheld`",
  "components/MotorSweep.tsx":
    "the Margin column — safe because every row is flown with a `motorSwap`, and a swap replaces every " +
    "instance in the configuration, so the set is always complete (asserted in lib/sim/sweep.test.ts)",
  "components/RocketpyCrossCheck.tsx":
    "the Loft-vs-RocketPy comparison row — its caller in ResultsView gates the whole panel on " +
    "`run.motorsComplete` and says why in a comment; this was the surface that got it RIGHT first, " +
    "and the two fixed on 2026-08-08 are the ones that did not copy it",
  "components/RocketDiagram.tsx":
    "the CG/CP marks and the drawing's accessible name — it takes `marginCal` as an optional prop and " +
    "renders nothing when it is absent, and GeometryInspector's caller passes it only under " +
    "`run.motorsComplete`",
  "app/docs/validation/page.tsx":
    "the published RocketPy-vs-Loft validation table — not a flyer's flight at all. It flies the " +
    "committed reference designs at build time, whose motors are part of the fixture, so there is no " +
    "unresolved-motor state to reach; a design that could not resolve its motor would fail the " +
    "validation build long before this row rendered",
};

describe("every surface that publishes a static margin", () => {
  const files = tsxUnder("components")
    .concat(tsxUnder("app"))
    .map((p) => ({ path: p.slice(ROOT.length + 1), text: readFileSync(p, "utf8") }));

  it("has been looked at, and the set of them is exactly the one recorded here", () => {
    // A denominator: a walk that read nothing would report an empty set and print exactly like a pass.
    expect(files.length, "the walk found no sources — it is not reading the tree").toBeGreaterThan(20);

    // Comments are stripped first. Several of these files DISCUSS the margin at length in docblocks —
    // including this defect's own history — and a mention is not a rendering.
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const presenting = files
      .filter((f) => /\b(?:staticMarginCal|marginCal)\b/.test(strip(f.text)))
      .map((f) => f.path)
      .sort();

    expect(
      presenting,
      "a surface presents a static margin and is not in MARGIN_SURFACES — say how it is gated, then add it",
    ).toEqual(Object.keys(MARGIN_SURFACES).sort());
  });

  it("gates it on the predicate that means every motor resolved, never on the one that means some did", () => {
    // The narrow, mechanical half: any file presenting the figure must at least KNOW about
    // `motorsComplete` — or, where it does not read a flight directly, take the withheld reason from
    // a caller that does. `hasPropulsion` alone is the shape of both shipped defects.
    const offenders = Object.keys(MARGIN_SURFACES).sort().filter((path) => {
      const text = readFileSync(join(ROOT, path), "utf8");
      return !/\bmotorsComplete\b/.test(text) && !/\bmarginWithheld\b/.test(text);
    });
    expect(
      offenders,
      "these present a static margin without ever consulting motorsComplete or a withheld reason from a caller",
    ).toEqual([
      "app/docs/validation/page.tsx",
      "components/GeometryInspector.tsx",
      "components/MotorSweep.tsx",
      "components/RocketDiagram.tsx",
      "components/RocketpyCrossCheck.tsx",
    ]);
    // These five are legitimate absences and they are LISTED rather than exempted silently, because
    // each is absent for its own reason and the reasons are not interchangeable. Three are handed a
    // number by a caller that does the gating and render nothing without it — `GeometryInspector` and
    // `RocketDiagram` take `marginCal` as an optional prop that `ResultsView` passes only under
    // `run.motorsComplete`, and `RocketpyCrossCheck` sits behind a panel-level gate its caller states
    // in a comment. One never sees a flight at all (`MotorSweep` reads engine rows, and
    // `lib/sim/sweep.ts` withholds there). One is not a flyer's flight (`app/docs/validation` flies
    // committed fixtures at build time).
    //
    // **The pattern worth naming: "the caller gates it" is only safe while the surface renders NOTHING
    // when the number is absent.** That is why both prop-takers are `marginCal?: number` rather than a
    // number with a fallback — a `?? 0` in either would print a margin of zero calibers, which is a
    // worse failure than the one this whole census exists to stop. If any of these starts reading a
    // `FlightRun` directly, this assertion is where that has to be argued rather than quietly absorbed.
  });
});
