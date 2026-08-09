/** Undo and redo over the whole edit history.
 *
 *  Every what-if in Loft is a value in one bag applied to the pristine imported design, so a point in
 *  the history is just a copy of that bag — there is nothing to diff and nothing to invert. What this
 *  module adds is the three things a stack of snapshots does not give you for free: a LABEL, so the
 *  control can say what it is about to undo rather than asking the flyer to remember; RUN COALESCING,
 *  so one drag of a fin handle is one undo and not the two hundred frames it fired; and a DEPTH cap, so
 *  a long session cannot grow the stack without bound.
 *
 *  It is generic over the state it carries and knows nothing about React, the solver, or any file
 *  format — the app decides what a snapshot contains and when to take one.
 *
 *  Why undo matters more here than in a text editor: a parametric edit is recoverable by retyping the
 *  number, and a structural one is not. Removing a part, or clearing every what-if at once, throws away
 *  work that exists nowhere else. Before this the only way back from either was "Reset to as-designed",
 *  which discards everything — a way out of one state that walks into a worse one. */

/** One point the flyer can go back to. */
export interface HistoryStep<S> {
  /** The state to restore when this step is undone. */
  state: S;
  /** What the action that LEFT this state did, in the flyer's words — "removing Payload Bay", "fin
   *  span". Read straight into the control's text, so it is prose and not a field name. */
  label: string;
  /** Which run of same-kind edits this step opened. Two commits carrying the same key close together
   *  are one gesture — a drag, a number typed digit by digit — and share this one step. Empty never
   *  coalesces, which is how a run is closed deliberately (see `undo`/`redo`). */
  key: string;
  /** When the run this step opened was last extended (ms). The coalescing window is measured between
   *  CONSECUTIVE commits, not from the start of the run, so a slow drag stays one step however long
   *  the flyer holds the handle. */
  at: number;
}

export interface History<S> {
  /** Oldest first; the last entry is what one undo returns to. */
  past: readonly HistoryStep<S>[];
  /** Nearest first; the first entry is what one redo goes back to. */
  future: readonly HistoryStep<S>[];
}

export const EMPTY_HISTORY: History<never> = { past: [], future: [] };

/** How long a run stays open between commits. Long enough to cover a hesitant digit-by-digit entry
 *  into a number field, short enough that a deliberate second edit of the same field — read the
 *  flight, then adjust — is its own undo. Frames of a drag arrive ~16 ms apart, so a drag is never in
 *  danger of splitting. */
export const COALESCE_MS = 900;

/** How many steps back the flyer can go. Snapshots are small objects (a few dozen scalars), so this is
 *  bounded for tidiness rather than for memory: past a hundred edits, "undo" is not how anyone gets
 *  back to where they were — "Reset to as-designed" is, and it is one step away and itself undoable. */
export const HISTORY_DEPTH = 100;

/** Record that the app is about to move OFF `before`, and return the history that describes it.
 *
 *  `key` is what decides whether this extends the run already open or starts a new step. Callers that
 *  must never merge — each removal is separately undoable, because a deleted part is the one thing
 *  retyping cannot bring back — pass a key unique to the action.
 *
 *  Committing anything discards the redo stack, which is what every editor does and what the flyer
 *  expects: once you edit from a point you undid back to, the branch you left is gone. */
export function commit<S>(h: History<S>, before: S, label: string, key: string, at: number): History<S> {
  const open = h.past[h.past.length - 1];
  if (open && key !== "" && open.key === key && at - open.at <= COALESCE_MS) {
    // Same run: the open step already holds the state from BEFORE the gesture began, which is the
    // whole point — undoing a drag returns to where the handle was grabbed, not to the previous
    // frame. Only the clock moves, so the run stays open while the flyer keeps going.
    return { past: [...h.past.slice(0, -1), { ...open, at }], future: [] };
  }
  const past = [...h.past, { state: before, label, key, at }];
  return { past: past.length > HISTORY_DEPTH ? past.slice(past.length - HISTORY_DEPTH) : past, future: [] };
}

/** Close the run that is open, so the next commit starts a new step whatever the clock says.
 *
 *  The time window is a fallback for boundaries the app cannot see; this is for the ones it can. The
 *  case that forced it: picking another fin set changes the state without recording anything (a
 *  selection is not an undoable act), so nothing closed the run — and a span dragged on set A, a pick
 *  of set B, and a span dragged on set B all carried the key `finSpan` within the window and merged
 *  into ONE step. Measured on that sequence: one undo landed on `{finSetId: "A"}`, taking back both
 *  gestures and re-aiming the fields at the first part. */
export function endRun<S>(h: History<S>): History<S> {
  return h.past.length ? { ...h, past: closeRun(h.past) } : h;
}

/** Step back one action. Returns the state to restore and the history that follows it, or null when
 *  there is nothing to undo. `present` is what the app is showing now — it becomes the redo step. */
export function undo<S>(h: History<S>, present: S): { history: History<S>; state: S } | null {
  const step = h.past[h.past.length - 1];
  if (!step) return null;
  return {
    // Closing the run the restored step belongs to (`key: ""`) is not tidiness. Undo a drag and then
    // start the same drag again inside the window and the new commit would otherwise match the key of
    // the step below it and merge into it, swallowing the second gesture silently.
    history: { past: closeRun(h.past.slice(0, -1)), future: [{ ...step, state: present }, ...h.future] },
    state: step.state,
  };
}

/** Step forward again, undoing an undo. Null when there is nothing to redo. */
export function redo<S>(h: History<S>, present: S): { history: History<S>; state: S } | null {
  const step = h.future[0];
  if (!step) return null;
  return {
    history: {
      past: [...h.past, { ...step, state: present, key: "" }],
      future: h.future.slice(1),
    },
    state: step.state,
  };
}

/** What one undo would take back, or null when the stack is empty — the control's own label, so the
 *  button can read "Undo removing Payload Bay" instead of asking the flyer what they last did. */
export function undoLabel<S>(h: History<S>): string | null {
  return h.past[h.past.length - 1]?.label ?? null;
}

/** What one redo would put back, or null. */
export function redoLabel<S>(h: History<S>): string | null {
  return h.future[0]?.label ?? null;
}

/** Mark the newest step's run closed so the next commit cannot merge into it. */
function closeRun<S>(past: readonly HistoryStep<S>[]): HistoryStep<S>[] {
  if (!past.length) return [...past];
  return [...past.slice(0, -1), { ...past[past.length - 1], key: "" }];
}

/** What each edit field is called when an undo control names it.
 *
 *  ONE registry, in the model rather than in the panel that happens to render each field, because the
 *  undo control is not next to the field it is describing — it sits in the design's header, and the
 *  edit it is about to take back may have come from a number box, a drag handle on the diagram, or a
 *  keyboard nudge. Three spellings of "fin span" would give three different undo labels for the same
 *  action depending on where the flyer made it.
 *
 *  A field with no entry here still gets a label — `describeEdit` spaces out its name — so a field
 *  added to the editor later is never announced as "Undo undefined". The registry is for prose that
 *  the field name alone does not give: units, plurals, and the two or three that read as jargon. */
export const EDIT_ACTIONS: Readonly<Record<string, string>> = {
  // Fins
  finSpan: "the fin span",
  finCount: "the fin count",
  finRootChord: "the fin root chord",
  finTipChord: "the fin tip chord",
  finSweepLength: "the fin sweep",
  finStation: "the fin position",
  finThickness: "the fin thickness",
  finCrossSection: "the fin cross-section",
  finMaterial: "the fin material",
  // Airframe
  // Spacing the field name out would give "the catalog body tube", which is the internal name for
  // the record and not what the flyer did. The gesture is choosing a real commercial part.
  catalogBodyTube: "the catalogue tube",
  catalogNoseCone: "the catalogue nose cone",
  catalogParachute: "the catalogue parachute",
  noseLength: "the nose length",
  noseShape: "the nose shape",
  bodyLength: "the body length",
  bodyDiameter: "the body diameter",
  finish: "the surface finish",
  airframeMaterial: "the airframe material",
  boattailLength: "the boattail",
  boattailAftDiameter: "the boattail diameter",
  transitionLength: "the transition length",
  transitionAftDiameter: "the transition exit",
  // The internal structure. The axial one is deliberately NOT "the length": the aim covers a plate
  // (a centring ring, a bulkhead, an engine block) as well as a tube, and the panel labels it
  // `Thickness` on the one and `Length` on the other. An undo control cannot know which part is in
  // hand, so it names the part rather than the dimension's two words.
  internalLength: "the internal part's size",
  internalOuterDiameter: "the internal part's outer diameter",
  internalInnerDiameter: "the internal part's bore",
  // The external fittings. The diameter names what it IS rather than what it measures, because on a
  // lug or a button it is the frontal size the drag model squares rather than a dimension a flyer
  // would call a width.
  fittingMass: "the fitting's mass",
  fittingLength: "the fitting's length",
  fittingDiameter: "the fitting's diameter",
  fittingCount: "how many of the fitting there are",
  massObjectMass: "the mass",
  massObjectStation: "the mass position",
  // Mass and motor
  payloadMassKg: "the payload mass",
  payloadStation: "the payload position",
  motorClusterCount: "the motor count",
  motorSwap: "the motor",
  ballastKg: "the nose ballast",
  // Recovery
  mainParachuteDiameter: "the parachute size",
  parachuteCd: "the canopy drag coefficient",
  mainDeployAltitude: "the main deployment altitude",
  drogueDiameter: "the drogue size",
  recoveryCdScale: "the recovery drag",
  // Launch conditions
  rodLength: "the rail length",
  rodAngleDeg: "the rail angle",
  windSpeed: "the surface wind",
  launchAltitude: "the field elevation",
};

/** Name what a patch of edits did, for the undo control.
 *
 *  A patch touching one field is named after it. A patch touching several is deliberately vague —
 *  "the design" — rather than listing them: those come from switching scenario or clearing everything,
 *  where the honest description is not a list of fields. Callers with something better to say (which
 *  part was removed, that this was the reset) pass their own label instead. */
export function describeEdit(patch: Record<string, unknown>): string {
  const keys = Object.keys(patch);
  if (keys.length !== 1) return "the design";
  return EDIT_ACTIONS[keys[0]] ?? `the ${spaceOut(keys[0])}`;
}

/** "finSweepLength" → "fin sweep length". The fallback for a field the registry does not name, so a
 *  field added to the editor is announced imperfectly rather than not at all. */
function spaceOut(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
