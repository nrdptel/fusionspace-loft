/** What a source tool says about its own stored run.
 *
 *  A design file's simulations are not all the tool's current answer, and the file says which is
 *  which. OpenRocket writes a status on every simulation; three values change what a comparison
 *  against it means, so each is said out loud rather than shown as "<Tool> vs Loft" and left to
 *  imply a current, solver-produced prediction:
 *
 *    - `external` — results that did NOT come from the tool's simulator (handled separately, since
 *      it changes the panel's heading as well as its caveat);
 *    - `outdated` — a real run, but from before the design was last edited, so it describes an
 *      earlier version of the rocket;
 *    - `notsimulated` / `loaded` — figures the file carries for a simulation the tool does not
 *      consider run.
 *
 *  Across the real-design corpus this is not a rare edge: 11 of 91 stored OpenRocket runs are
 *  outdated and 7 more are marked not simulated, including both files whose stored apogees Loft
 *  disagrees with most. */
export function storedCaveat(status: string | undefined, tool: string): string | null {
  switch (status) {
    case "outdated":
      return `${tool} marks this run as outdated — it was computed before the design was last changed, so it may describe an earlier version of this rocket.`;
    case "notsimulated":
    case "loaded":
      return `${tool} marks this simulation as not run, so these are figures the file carries rather than that tool's answer for the design as it now stands.`;
    default:
      return null;
  }
}
