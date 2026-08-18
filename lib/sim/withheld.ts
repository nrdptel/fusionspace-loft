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

/** Why this design has no static margin, or `undefined` when Barrowman's method returns a centre of
 *  pressure that means something.
 *
 *  **The margin is `(X_cp − X_cg) / d`, and `X_cp` is not always defined.** Barrowman's CP is the
 *  line of action of the resultant normal force — `Σ(CNα·x) / Σ(CNα)` — and a contracting transition
 *  is the one part that contributes NEGATIVE `CNα`. As the sum approaches zero the aerodynamic
 *  loads become a pure couple, which has no line of action at all, and the quotient runs away: the
 *  "CP" it returns is a number about no rocket, and the margin computed from it inherits that.
 *
 *  **The test is the convex hull of the contributions, and it is exact rather than a heuristic.** A
 *  weighted average with non-negative weights always lies between the smallest and largest of the
 *  points it averages. So a CP outside `[min xᵢ, max xᵢ]` PROVES that some weight is negative and
 *  that the sum is small against the moment — which is the near-couple, and the only way this can
 *  happen. Nothing else has to be judged.
 *
 *  **A first version tested the AIRFRAME's length instead, and the fin-position sweep caught it.**
 *  `parameterSweep` slides a fin set to 1,005 mm on a 950 mm rocket, so the CP dutifully follows the
 *  fins to 953.6 mm — past the tail, with CNα a healthy 18.5 /rad and every contribution positive.
 *  That CP is arithmetically right for the rocket being described; what is wrong there is that the
 *  editor let a fin set hang in space behind the airframe, which is a different defect and is filed
 *  as one. Withholding it here would have hidden a real bug behind a caveat about a different one.
 *
 *  **Measured, because "a corner case" is what this looked like until it was driven.** On the
 *  35-design corpus exactly one file trips it — `Show-off.CDX1`, summed CNα −1.93 /rad, CP 913.4 mm
 *  against contributions spanning 9.8–583.3 mm, published as a **12.81 cal** static margin, which is
 *  the "high" band and reads as *strongly over-stable* for a rocket with no restoring force
 *  anywhere. That one is downstream of a parse defect, so the honest reachability number is the
 *  editor's: from the from-scratch starter, **two typed fields** — a 150 mm boattail closing to
 *  20 mm, and the fin span taken to 20 mm, both inside the range the Design workspace offers — put
 *  the CP at **−258.0 mm**, 258 mm ahead of the nose tip, with CNα still POSITIVE at 1.545. So the
 *  test cannot be `cnAlpha > 0` alone either.
 *
 *  Loft's answer to an undefined figure is to withhold it and say why — never to publish a
 *  plausible-looking one. `simulate.ts` also raises this as a flight warning, because a flyer who
 *  reaches it has usually just made an edit and a withheld cell alone does not say what to undo. */
export function noCpWhy(s: {
  cnAlpha: number;
  cp: number;
  contributions: readonly { cnAlpha: number; x: number }[];
}): string | undefined {
  // A design carrying no normal force at all — no nose cone and no fin set — is a different fact
  // from a taper cancelling one, and "less taper" is advice it cannot act on. Reachable in the
  // editor by removing both, and the reason has to be true there too. Tested first because the hull
  // below is empty in that case and would otherwise decide it by accident.
  if (!s.contributions.some((c) => c.cnAlpha !== 0)) {
    return "nothing on this design carries normal force — with no nose cone and no fin set there is no centre of pressure, and so no static margin to state";
  }
  const xs = s.contributions.filter((c) => c.cnAlpha !== 0).map((c) => c.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  // A hair of slack, because `lo` and `hi` are themselves floating-point stations and a CP that IS
  // one of them (a single-contribution design — a nose cone and nothing else) must not be withheld
  // by a rounding bit. 1 µm is far below any station this model resolves.
  const EPS = 1e-6;
  if (s.cnAlpha > 0 && s.cp >= lo - EPS && s.cp <= hi + EPS) return undefined;
  return `the tail taper removes almost as much normal force as the nose and fins add — summed CNα ${s.cnAlpha.toFixed(2)} /rad puts the centre of pressure outside the span of the parts that produce it, where it is not a point on this rocket and no margin can be measured from it. More fin area, or less taper, brings it back.`;
}
