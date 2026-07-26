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
/** The same caveat compressed to a tag, for a surface with no room for a sentence — a `<select>`
 *  option, a table cell. It says which of the two applies and nothing more; the full sentence is
 *  still on the comparison panel the option leads to. A surface quoting a stored number without
 *  either is presenting an earlier version of the rocket, or a figure the tool never computed, as
 *  that tool's answer. */
export function storedTag(status: string | undefined): string | null {
  switch (status) {
    case "outdated":
      return "outdated";
    case "notsimulated":
    case "loaded":
      return "not run";
    default:
      return null;
  }
}

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
