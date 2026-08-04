/** The recovery drag coefficients an importer falls back to when a design file states none — in ONE
 *  place, each with where its figure comes from and how often it actually fires.
 *
 *  **Five uncited literals across three adapters is what this replaces**: `lib/ork/adapt.ts` 0.8 and
 *  0.75, `lib/rkt/adapt.ts` 0.8 and 0.75, `lib/rasaero/adapt.ts` 0.8. Each was a bare number in a
 *  `parseNum(..., 0.8)` argument, so the value a flyer's descent was computed from appeared nowhere a
 *  reader would look and was attributed to nobody. `DESIGN.md` §6 requires a reference value to name
 *  its source; these are reference values in the strictest sense — they set descent rate, arrival
 *  speed and landing energy, which is the number an RSO and a waiver check.
 *
 *  **A source of `null` is a real answer here, not an omission.** `lib/sim/flutter.ts` already
 *  establishes the pattern: six of its fourteen shear moduli have no published value and say so in
 *  words rather than borrowing a plausible one. The same applies to a canopy coefficient nobody
 *  measured for the shape in question.
 *
 *  **Nothing here changes a flown number**, and that is deliberate. R9's decomposition forbids moving
 *  any coefficient before its increment 3 attributes the corpus's 8.3% median ground-hit-velocity
 *  error — and the measurements below are most of the reason why: **four of the five fire on zero
 *  real files**, so changing them would be a change nothing in the corpus can see, which is exactly
 *  the speculative fix `MAINTAINING.md` forbids. The one that does fire is the `.ork` canopy's, on 17
 *  of the corpus's 24 parachute nodes — and it is also the only one with a defensible source.
 */

/** One fallback coefficient, with its provenance and the corpus measurement that says whether it
 *  matters. */
export interface RecoveryCdDefault {
  /** The coefficient itself. */
  readonly cd: number;
  /** Where the figure comes from, or `null` when nothing publishes one for this case. */
  readonly source: string | null;
  /** Why this value, in one sentence — the thing R9 has to be able to put on a surface. */
  readonly basis: string;
  /** How often this default is actually reached across the real-design corpus, measured 2026-08-03.
   *  A default that fires on nothing is not a lever; a default that fires on 17 canopies is. */
  readonly corpusHits: number;
}

/** OpenRocket writes `auto` when the flyer has not overridden the coefficient, and `auto` means "use
 *  OpenRocket's own default", which is 0.8 (`Parachute.java`, `cdAutomatic = true`). So this is not
 *  Loft picking a number — it is Loft resolving a value the file explicitly delegated, to the figure
 *  the tool that wrote the file would have used. That makes the .ork case the ONLY one of the five
 *  with a defensible source, and it is also the only one that fires: 17 of the 24 parachute nodes
 *  across the corpus's 25 OpenRocket designs say `auto`.
 *
 *  OpenRocket's own source carries `// TODO: HIGH: Better parachute CD estimate?` beside it, which is
 *  worth stating rather than hiding: the figure is defensible as *what the file meant*, not as a
 *  measured coefficient. */
export const ORK_PARACHUTE_CD: RecoveryCdDefault = {
  cd: 0.8,
  source: "OpenRocket's own default for an `auto` coefficient (Parachute.java, cdAutomatic)",
  basis:
    "The file delegated the choice to OpenRocket, so Loft resolves it to the figure OpenRocket itself would have flown — not to a coefficient of Loft's own choosing.",
  corpusHits: 17,
};

/** A streamer's coefficient where an `.ork` states none.
 *
 *  **NOT sourced, and the first draft of this file wrongly said it was.** The canopy's delegation
 *  argument is backed by an actual reading of `Parachute.java`, recorded in `COMPETITION.md` row 35;
 *  nothing in this repository records reading `Streamer.java`, so attributing 0.75 to "OpenRocket's
 *  own streamer default" would have been a citation invented by symmetry with the line above it —
 *  which is precisely the failure `MAINTAINING.md` warns about for competitor claims. It is plausible
 *  that OpenRocket delegates a streamer coefficient the same way; it is not verified, and a source
 *  string is a claim. */
export const ORK_STREAMER_CD: RecoveryCdDefault = {
  cd: 0.75,
  source: null,
  basis:
    "No published basis that has been verified. Presumed to mirror the canopy's `auto` delegation, but nothing here records reading OpenRocket's streamer default, and an unread source is not a citation.",
  corpusHits: 0,
};

/** RockSim's parachute screen has **no drag-coefficient field at all** — the coefficient is implied
 *  by the chosen Shape and never shown (RockSim v8 Program Guide; `UNVERIFIED` for v10/v11). So there
 *  is no RockSim default to resolve a missing value TO, and 0.8 here is Loft's own choice, matched to
 *  the OpenRocket figure only so two importers do not disagree about the same silence.
 *
 *  **It fires on nothing.** All 5 parachutes across the corpus's RockSim designs state a
 *  `DragCoefficient` explicitly, so this value has never been flown by any corpus design. */
export const RKT_PARACHUTE_CD: RecoveryCdDefault = {
  cd: 0.8,
  source: null,
  basis:
    "No published basis. RockSim exposes no parachute Cd field, so there is no source value to resolve to; matched to the OpenRocket default so two importers do not disagree about the same silence.",
  corpusHits: 0,
};

/** RockSim's streamer screen DOES expose a coefficient, unlike its parachute screen — so a missing one
 *  is a gap in the file rather than a field that does not exist. Still no published figure to fall
 *  back to. */
export const RKT_STREAMER_CD: RecoveryCdDefault = {
  cd: 0.75,
  source: null,
  basis: "No published basis; matched to the OpenRocket streamer default for consistency between importers.",
  corpusHits: 0,
};

/** **RASAero II publishes a default AND its basis, and Loft's fallback is not it.** The RASAero II
 *  Users Manual states a default parachute Cd of **1.33**, "based on a study of high power rocket
 *  descent rates as a function of parachute size", with the reference area pinned as the canopy laid
 *  flat. Loft falls back to 0.8.
 *
 *  **It is left at 0.8 deliberately, and the measurement is why.** All 4 recovery devices across the
 *  corpus's RASAero designs state their own `CD`, so this default fires on **zero** real files —
 *  changing it would move no flown number and could not be validated against anything. Moving it to
 *  1.33 is the obvious candidate, and it is R9's to take **after** its increment 3 attributes the
 *  ground-hit-velocity error, not before: `MAINTAINING.md` is explicit that a change which fires on
 *  no real file is worse than none.
 *
 *  Recorded here rather than filed away, because the next session to look at this will otherwise
 *  rediscover the same discrepancy and have to re-derive the same reason for not acting on it. */
export const RASAERO_PARACHUTE_CD: RecoveryCdDefault = {
  cd: 0.8,
  source: null,
  basis:
    "No published basis for THIS value. RASAero II's own documented default is 1.33 with a stated derivation; Loft's 0.8 is matched to the OpenRocket figure instead. Left unchanged because it is reached by 0 of the corpus's RASAero designs, so moving it would change no flown number — see R9.",
  corpusHits: 0,
};

/** The canopy Loft itself authors — the starter design's main, and the drogue the dual-deploy
 *  editor adds when a flyer types a drogue diameter.
 *
 *  **Not a fallback, which is why it is named separately.** The five above resolve a value a FILE
 *  declined to state; this one has no file behind it at all. Both were bare `cd: 0.8` literals with
 *  no provenance — `lib/model/starter.ts` and the drogue applier in `lib/model/edit.ts` — and the
 *  increment that consolidated the adapter fallbacks missed them precisely because they are not
 *  adapter code. A flyer building from scratch in Loft was flying an unattributed coefficient with
 *  nothing on any surface able to say whose it was.
 *
 *  The value matches `ORK_PARACHUTE_CD` deliberately: a rocket authored in Loft and the same rocket
 *  round-tripped through an `.ork` that states no `cd` should not descend differently. Its basis is
 *  the weaker one, though, and says so — OpenRocket's figure is defensible as *what a file meant*
 *  when it delegated the choice, and nothing delegates anything here. */
export const LOFT_AUTHORED_PARACHUTE_CD: RecoveryCdDefault = {
  cd: 0.8,
  source: null,
  basis:
    "No published basis. Matched to the figure OpenRocket resolves an unstated coefficient to, so a design authored in Loft and the same design saved and reopened as an .ork descend the same way.",
  corpusHits: 0,
};

/** Every fallback, for the checks that assert the whole set at once. */
export const RECOVERY_CD_DEFAULTS: readonly RecoveryCdDefault[] = [
  ORK_PARACHUTE_CD,
  ORK_STREAMER_CD,
  RKT_PARACHUTE_CD,
  RKT_STREAMER_CD,
  RASAERO_PARACHUTE_CD,
];
