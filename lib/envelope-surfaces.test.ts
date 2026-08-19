import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every surface handed a Loft-computed flight has to say when that flight left the drag model's
 *  validated envelope — a census, for the same reason the static-margin one is a census, and written
 *  because the defect arrived a second time on a surface nothing was counting.
 *
 *  **The rule.** `lib/sim/envelope.ts` holds one bound (`VALIDATED_MACH_CEILING`, M0.8) and one
 *  sentence (`transonicReason`), and its own docblock states why they live together: *"A caveat in
 *  one place and a confident claim in another is worse than either alone."* Above that Mach the drag
 *  model is a bounded parametric estimate rather than a solution, and 9 of 109 flown stored
 *  simulations in the real-design corpus leave the envelope, reaching M1.67.
 *
 *  **Why this exists, and why it is not the shape of the first fix.** `envelope.ts` was extracted
 *  when the caveat reached exactly one surface, and the six that were missing it are named in its
 *  docblock. Every one was fixed, and `lib/sim/extrapolated-reach.test.ts` pins that fix — but it
 *  pins the CARRIERS, because that defect was a fact that never left the solver: the sweep-row and
 *  Monte-Carlo-sample types had no field to hold the flag. A check on the carriers cannot see a
 *  component that is handed the flag and renders nothing.
 *
 *  **So nothing saw `components/ValidationPanel.tsx`, found 2026-08-19.** It publishes
 *  `mean abs. error N%` — the single number a flyer quotes as Loft's accuracy — bare, on a flight
 *  that may be entirely outside the validated model. `components/DragCrossCheck.tsx` renders
 *  DIRECTLY BELOW it off the same flight and says *"Loft's curve, and the mean gap measured against
 *  it, are rough above that"*. Two agreement figures, one screen, one hedged and one not: exactly
 *  the arrangement `envelope.ts` was extracted to prevent, on the surface called "Validation".
 *
 *  **What is counted, and why THAT.** Not "files importing a flight type" — `ValidationPanel` names
 *  none, which is how it stayed invisible; it takes the comparison already computed. Not "files
 *  importing `@/lib/sim/*`" — before its fix `ValidationPanel` imported nothing from there either, so
 *  that census would have passed over the very defect it was written for. What is counted is the set
 *  of components `components/ResultsView.tsx` hands flight-derived data to. `ResultsView` is the one
 *  component that owns the flight; anything it passes `result`, `run`, `report`, `summary` or
 *  `flightData` to is, by construction, a surface publishing what the solver produced — and the list
 *  is read out of its JSX, so a surface added later joins the census whether or not anyone remembers
 *  this file exists.
 *
 *  **The prop list carries `doc`, `simIndex` and `designKey` too, and the first draft of this file
 *  did not.** Four of the sixteen members — the two sweeps, the dispersion and the RocketPy
 *  cross-check — are handed the DESIGN and fly the solver themselves rather than being handed a
 *  finished flight. Those four are named in `envelope.ts`'s own list of six, so a census that missed
 *  them missed the majority of the thing it is about, and a new surface written in this file's
 *  dominant prop style would have joined nothing.
 *
 *  **And the tag scan is brace-aware rather than a regex to the next `>`.** An arrow function in a
 *  prop (`onPick={(i) => setI(i)}`) contains a `>`, so a non-nesting pattern truncates the attribute
 *  list there — which made membership depend on the ORDER a call site happened to write its props
 *  in. Both holes were found by this change's own pre-push review, in the file written to stop
 *  exactly this class of blindness.
 *
 *  It cannot prove a surface asks CORRECTLY. That is what a human writing a line here is for. What it
 *  does is make sure a human has looked at every one, and go red when a new one appears. */

const ROOT = process.cwd();
const RESULTS_VIEW = "components/ResultsView.tsx";

/** Comments stripped: several of these files discuss the envelope at length — including this
 *  defect's own history — and a mention in a docblock is neither a rendering nor a call site. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The props that carry a flight, or the design a surface will fly itself. Both kinds publish
 *  drag-model output; only the second kind runs the solver on its own. */
const FLIGHT_PROPS = /\b(?:result|run|report|summary|flightData|doc|simIndex|designKey)=\{/;

/** Every component `ResultsView` hands flight-derived data to, and what each does about the envelope.
 *
 *  Adding an entry is a claim that somebody checked it. Removing one is a claim it is no longer handed
 *  a flight. Neither is something to do to make a red test go green. */
const FLIGHT_SURFACES: Record<string, string> = {
  RocketSummary:
    "the metric tiles — computes `transonicReason` itself off the run it is given (ResultsView.tsx) " +
    "and marks the tiles that carry it",
  WhatIfDelta:
    "the what-if comparison card — in ResultsView, under the same `extrapolatedWhy` the tiles use; a " +
    "CHANGE between two flights is rough whenever either end is",
  ValidationPanel:
    "the stored-tool comparison, and the mean absolute error in its own header — takes the flag and " +
    "the Mach as props rather than re-deriving them from a rounded figure, and marks the GAP rather " +
    "than either column, because the stored tool's numbers carry that tool's caveats and are not " +
    "Loft's to qualify. THIS IS THE SURFACE THIS FILE EXISTS FOR",
  DragCrossCheck:
    "the per-step drag and altitude overlay and the mean gap — same treatment, same reasoning, and it " +
    "is the surface that got this right first",
  PhaseTable:
    "a staged flight's own timeline — every time and altitude in it comes off the same integration, " +
    "and it renders inside ResultsView beneath the marked tiles",
  FlightViz:
    "the flight-path PICTURE, and it deliberately renders no marker of its own. It publishes no " +
    "figure: it draws the arc and the phase colours, and every number a flyer reads on that route is " +
    "rendered by ResultsView, which marks them. Listed rather than exempted silently because the " +
    "trajectory IS drag-model output, so the day it prints a number of its own this line is what will " +
    "say so",
  MonteCarlo:
    "the dispersion — flies the solver itself off the design, and marks the band with " +
    "`transonicPopulationReason`, which counts how many of the 300 left the envelope rather than " +
    "flattening it to a flag. One of the six named in `envelope.ts`'s docblock",
  MotorSweep:
    "the candidate table — same, per row, counted over the candidates",
  ParameterSweep:
    "the swept curve — same, counted over the points, and `lib/sim/sweep.ts` carries the flag PER " +
    "POINT because one curve can cross the boundary partway along",
  RocketpyCrossCheck:
    "the Loft-vs-RocketPy comparison — runs its own `runFlight` and marks Loft's half from it",
  MotorStatsCaption:
    "the motor's own printed data — manufacturer figures, not Loft's integration, so the envelope has " +
    "nothing to say about them",
  NoPropulsionNotice:
    "a refusal, not a figure — it renders when there is no flight to qualify",
  StabilityTrimHint:
    "prescriptive advice off CG/CP, which are geometry and mass rather than drag; the envelope bounds " +
    "the DRAG model, and the static margin carries its own two withholding gates (see " +
    "lib/margin-surfaces.test.ts)",
  FlutterFixHint:
    "fin-flutter advice — its own aeroelastic model with its own stated basis, not the drag curve",
  RecoverySizingHint:
    "descent-rate advice under a deployed canopy, which is subsonic by construction",
  BoosterDescentNote:
    "the same for a spent booster, and for the same reason",
};

describe("every surface ResultsView hands a flight to", () => {
  const source = readFileSync(join(ROOT, RESULTS_VIEW), "utf8");

  it("has been looked at, and the set of them is exactly the one recorded here", () => {
    const bare = strip(source);
    // A denominator: a regex that matched nothing would report an empty set and print like a pass.
    expect(bare.length, "ResultsView.tsx did not read — the census has no source").toBeGreaterThan(10_000);

    const handed = new Set<string>();
    for (const m of bare.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)) {
      // Walk to the tag's own closing `>`, counting braces, so a `>` inside a prop expression does
      // not end the attribute list early.
      let i = m.index + m[0].length;
      let depth = 0;
      let attrs = "";
      for (; i < bare.length; i++) {
        const c = bare[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0) break;
        attrs += c;
      }
      if (FLIGHT_PROPS.test(attrs)) handed.add(m[1]);
    }

    expect(
      [...handed].sort(),
      "ResultsView hands a flight to a surface that is not in FLIGHT_SURFACES — say what it does " +
        "about the validated envelope, then add it",
    ).toEqual(Object.keys(FLIGHT_SURFACES).sort());
  });

  it("marks the envelope on every surface that publishes a drag-model figure", () => {
    // The mechanical half, applied to the members that live in their OWN file — the ones inside
    // ResultsView.tsx share its imports, so a per-file grep cannot tell them apart. `ValidationPanel`
    // failed this for its whole life while the panel rendered immediately below it passed.
    // DERIVED from the census, never listed: a member that lives in its own file is checked because
    // it is a member, so a surface test 1 forces into `FLIGHT_SURFACES` cannot then opt out of the
    // only half of this file that can catch a MISSING caveat. The members defined inside
    // `ResultsView.tsx` are excluded because they share its imports, so a per-file grep answers for
    // the file rather than for them.
    const own = Object.keys(FLIGHT_SURFACES)
      .filter((name) => existsSync(join(ROOT, `components/${name}.tsx`)))
      .sort();
    expect(own.length, "no member resolves to its own file — the derivation is not working").toBeGreaterThan(3);
    const silent = own.filter((name) => {
      const text = strip(readFileSync(join(ROOT, `components/${name}.tsx`), "utf8"));
      return !/\b(?:transonicReason|extrapolatedTransonic|Extrapolated|transonicPopulationReason)\b/.test(text);
    });
    expect(silent, "these publish a Loft figure and never mention the validated envelope").toEqual([
      "FlightViz",
    ]);
    // FlightViz is the one absence, and it is LISTED rather than matched by a pattern, because the
    // argument for it is about what that component RENDERS — a picture, not a figure — and no grep
    // can check that. See its entry above.
  });

  it("keeps the sentence and the bound in one place, so no surface can word it its own way", () => {
    // The other half of `envelope.ts`'s argument. A surface hand-rolling its own wording would pass
    // the check above — it would say "extrapolated" — while telling a flyer something the solver did
    // not.
    const files = ["ResultsView", "ValidationPanel", "DragCrossCheck", "RocketpyCrossCheck", "MonteCarlo"];
    const offenders = files.filter((name) => {
      const raw = readFileSync(join(ROOT, `components/${name}.tsx`), "utf8");
      return /\btransonicReason\b/.test(strip(raw)) && !/from "@\/lib\/sim\/envelope"/.test(raw);
    });
    expect(offenders, "these use the transonic sentence without taking it from lib/sim/envelope").toEqual([]);
  });
});
