/** Why a flight figure is a sentinel rather than a measurement.
 *
 *  `FlightSummary` reports 0 for a figure whose EVENT never happened — the ground-hit velocity of a
 *  flight that never reached the ground, the deployment velocity of a flight where nothing opened —
 *  and the docblocks on `landed` and `deployments` say so: *"a sentinel, not a measurement"*, and
 *  *"Surfaces must withhold them rather than render the zeros"*.
 *
 *  That rule only holds if every surface applies the same test with the same words, and it did not:
 *  the Flight card withheld four readouts while the validation table published the same zeros as
 *  −100% differences against the source tool. The reasons live here so a surface can only get
 *  them from one place, and a new surface has to walk past the rule to break it. */

import type { FlightSummary } from "./simulate";
import type { Rocket } from "../model/types";
import { flattenRocket } from "../model/geometry";

/** The condition, phrased for a reader: why this flight has no landing figures, or `undefined` when
 *  it reached the ground.
 *
 *  **The two non-landing outcomes are different facts and used to share one sentence.** A rocket
 *  still descending at the 1,200 s cap is a real prediction about a very slow descent. An integrator
 *  that ran out of steps is Loft failing, not the rocket floating — measured on `demo-single-deploy.ork`
 *  with a 25 m main, the run stops at 1.3 s because an enormous canopy drives the adaptive step to
 *  nothing — and telling a flyer it "did not land inside the time cap" points them at a canopy size
 *  when the answer is that the number should not be trusted at all. */
export function notLandedWhy(s: Pick<FlightSummary, "landed" | "notLandedReason">): string | undefined {
  if (s.landed) return undefined;
  return s.notLandedReason === "step-budget"
    ? "the solver could not integrate this descent — the canopy is large enough that the step size collapses, so no landing figure is available. Try a smaller recovery size."
    : "still descending at the 1,200 s cap, so it has no landing figures — the recovery is large enough that this flight does not finish";
}

/** Why this flight has no deployment figures, or `undefined` when something opened.
 *
 *  Separate from `notLandedWhy` because the two conditions are independent: a flight can land
 *  perfectly well with nothing out (a ballistic arrival is still an arrival), and that is exactly the
 *  case the corpus caught. */
export function noDeploymentWhy(s: Pick<FlightSummary, "deployments">): string | undefined {
  return s.deployments > 0
    ? undefined
    : "nothing opened on this flight, so there is no deployment speed to report";
}

/** Why every DESCENT figure on this design is rough, or `undefined` when the design states its own
 *  canopy drag.
 *
 *  A canopy whose Cd Loft supplied is a real assumption about the number a recovery is judged on, and
 *  a Cd a designer typed is the designer's own claim and not Loft's to caveat — `Parachute.cdFrom` is
 *  what tells them apart, and marking both would make the flag mean nothing. Measured across the
 *  corpus: **40 of 92 flights are flown on a fallback**, so this is a caveat a flyer meets often
 *  enough to be worth being accurate about.
 *
 *  **It lives here for the reason `notLandedWhy` does, and it moved here because the same split had
 *  already happened.** It was a local string in `components/ResultsView.tsx`, and two surfaces read
 *  the same fallback and never asked: the dispersion panel badges nothing for it, so RECOVERY RADIUS
 *  (95%) and the landing-speed band — the figures a flyer sizes a field and a waiver with — printed
 *  unqualified beside a /flight card where the identical quantities wear an EXTRAPOLATED badge; and
 *  the Drift from pad tile sat between two badged neighbours carrying no badge of its own, while
 *  drift is wind times time under that same canopy. One string, one condition, one place, and a new
 *  surface has to walk past the rule to break it. */
export function descentRoughWhy(rocket: Rocket | null | undefined): string | undefined {
  if (!rocket) return undefined;
  const fallback = flattenRocket(rocket)
    .map((p) => p.component)
    .some((c) => (c.kind === "parachute" || c.kind === "streamer") && c.cdFrom === "default");
  return fallback
    ? "the canopy's drag coefficient is Loft's fallback, not a figure this design states — the descent figures below follow it, so treat them as rough and try the range on /design"
    : undefined;
}
