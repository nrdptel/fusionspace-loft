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

/** Why there is no stored comparison AT ALL — which is a different statement from one that exists
 *  and carries a caveat, and needs its own sentence.
 *
 *  A design file can carry a simulation that holds only its SETUP. OpenRocket saves a simulation's
 *  launch conditions whether or not it has ever been run; a `.rkt` can carry a configuration with no
 *  `<SimulationResults>`. Loft then has nothing to put beside its own numbers and the panel is
 *  simply absent — which reads as a capability Loft lacks rather than as a fact about the file, and
 *  the import screen has just promised the opposite in as many words.
 *
 *  This is not a rare shape on the way in. All three bundled `.ork` samples are exactly it: each
 *  carries `<simulation status="external">` with no `<flightdata>` at all. So the comparison that
 *  copy leads with is missing on every default first run, while 27 of the 27 real in-the-wild
 *  `.ork` designs in the corpus carry stored results and show it.
 *
 *  @param statuses the source tool's own status for each stored simulation, in file order
 *  @param tool     the tool that wrote the file, named by the importer — never assumed */
export function noStoredResultsReason(statuses: (string | undefined)[], tool: string): string | null {
  const n = statuses.length;
  if (n === 0) return null;
  const held =
    n === 1
      ? "a simulation that holds its launch setup and no results"
      : `${n} simulations that hold their launch setup and no results`;
  // Say what the FILE says, where it says anything — the same rule the caveats above follow. An
  // `external` simulation with nothing in it is the file stating that these were never its own
  // simulator's numbers, which is worth passing on rather than flattening into "no results".
  const said = statuses.every((s) => s === "external")
    ? `, marked in it as not ${tool}'s own simulator output`
    : statuses.some((s) => s === "notsimulated" || s === "loaded")
      ? `, which ${tool} marks as not run`
      : "";
  return (
    `This design carries ${held}${said}, so there is nothing stored in the file to put beside Loft's ` +
    `own numbers above. Import a design whose ${tool} simulation has been run and the comparison ` +
    `appears here — or open the RocketPy cross-check under Analyze, which flies the design in an ` +
    `independent solver and needs nothing stored in the file.`
  );
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
