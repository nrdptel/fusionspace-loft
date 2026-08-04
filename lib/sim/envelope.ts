/** The drag model's validated envelope, and the one place the app says a number has left it.
 *
 *  **This module exists because the wording lived at a single call site, and that is exactly how the
 *  caveat came to be missing from six surfaces.** `FlightResult.extrapolatedTransonic` has been set
 *  since the treatment existed, and one component — the flight card — turned it into a sentence.
 *  Every other surface that flies the same solver rendered its numbers as though they were
 *  validated: both sweeps, the dispersion, the stored-flight drag cross-check, the RocketPy
 *  cross-check, and the design summary strip that sits above all four routes. Measured on the
 *  real-design corpus, 9 of 109 flown stored simulations leave this envelope, reaching M1.67.
 *
 *  A caveat in one place and a confident claim in another is worse than either alone, so the bound
 *  and the sentence are exported together and every surface asks this module rather than writing its
 *  own. `lib/sim/simulate.ts` raises a `transonic` caution in the same words for the same reason. */

/** Above this Mach number the drag model is a bounded parametric estimate rather than a solution:
 *  it follows the correct shape (a transonic rise to a peak near M1.15, then a supersonic decline)
 *  but there is no shock or CFD model behind it, and the drag-rise Mach is fixed rather than derived.
 *  `/docs/limitations` carries the full statement. */
export const VALIDATED_MACH_CEILING = 0.8;

/** Why a single flight's numbers are rough, or `undefined` while it is inside the envelope.
 *
 *  Takes the flag rather than deriving it from the Mach number, because the flag is what the solver
 *  actually integrated against — a surface that re-derived it from a rounded `maxMach` could
 *  disagree with the flight it is describing at the boundary. */
export function transonicReason(extrapolated: boolean, maxMach: number): string | undefined {
  if (!extrapolated) return undefined;
  return `this flight reaches M${maxMach.toFixed(2)}, outside the drag model's validated subsonic envelope (M ≤ ${VALIDATED_MACH_CEILING}) — treat it as rough`;
}

/** Why a POPULATION of flights is rough — a dispersion, a sweep curve, a table of candidates.
 *
 *  Counted rather than flagged, because "12 of 300" and "300 of 300" are different claims about the
 *  same set and a surface that flattened them would say the same thing about both. `noun` names what
 *  was counted in the flyer's own terms ("dispersed flights", "candidates"), and `whatIsRough` names
 *  what to distrust, since a table, a curve and a band each want a different ending. */
export function transonicPopulationReason(
  hot: number,
  total: number,
  noun: string,
  whatIsRough: string,
): string | undefined {
  if (hot <= 0 || total <= 0) return undefined;
  const which = hot === total ? `every one of ${total} ${noun}` : `${hot} of ${total} ${noun}`;
  return `${which} reaches past M${VALIDATED_MACH_CEILING}, outside the drag model's validated subsonic envelope — ${whatIsRough}`;
}
