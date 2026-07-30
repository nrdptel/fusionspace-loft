/** Undo and redo over the whole edit bag.
 *
 *  Every what-if in Loft is a value in ONE object applied to a pristine design, so a history is a stack of
 *  those objects rather than a diff of the rocket. That is the whole reason this is small: nothing has to be
 *  inverted, and stepping back cannot drift, because each entry rebuilds the model from the design as
 *  imported. Removals already relied on the property (dropping the last id restores the design before that
 *  deletion); this generalises it to every edit.
 *
 *  It matters because the only way back used to be "Reset to as-designed", which discards everything at
 *  once. Ten flights into a trim session that is a stack of decisions and one all-or-nothing exit — and the
 *  drag handles made it worse, since a handle cannot be un-dragged by retyping a number the way a field can.
 *
 *  **Coalescing is not a nicety here, it is the difference between a usable history and an unusable one.**
 *  `Num` calls its change handler on EVERY KEYSTROKE, so typing "1500" commits four edits (1, 15, 150,
 *  1500), and a diagram handle commits one per pointer move — dozens in a single drag. Without coalescing,
 *  undo walks back through a flyer's typing one character at a time. Consecutive edits that touch the same
 *  field within `COALESCE_MS` therefore collapse into the one step a flyer would call a change.
 */

/** How close together two edits to the same field have to be to count as one step. Comfortably longer than
 *  a keystroke or a pointer move, comfortably shorter than a decision. */
export const COALESCE_MS = 800;

/** How many steps back the history keeps. Each entry is a small flat object, so the cap is about keeping a
 *  session's memory bounded rather than about cost per step. Deep enough that a long trim session is not
 *  truncated in practice. */
export const MAX_HISTORY = 100;

export interface EditHistory<E> {
  /** States before the current one, oldest first. `past[past.length - 1]` is one undo away. */
  past: readonly E[];
  /** States undone and available to redo, most-recently-undone last. */
  future: readonly E[];
  /** The fields the last commit touched and when, so a run of edits to one field is one step. Absent
   *  after an undo, a redo or a reset, each of which deliberately ends the run: redoing and then typing
   *  must not fold the typing into the redone step. */
  pending?: { keys: string; at: number };
}

export function emptyHistory<E>(): EditHistory<E> {
  return { past: [], future: [] };
}

/** A stable signature for the fields a patch touches. */
function keysOf(patch: object): string {
  return Object.keys(patch).sort().join(",");
}

/** Record that `current` is being replaced by an edit touching `patch`'s fields at time `now`.
 *
 *  Returns the history to keep. The caller applies the patch itself — this module never merges edits,
 *  because the app's own merge semantics (a patch spread over the previous bag, where an explicit
 *  `undefined` means "cleared") are its business and duplicating them here is how the two would drift. */
export function commitEdit<E extends object>(
  history: EditHistory<E>,
  current: E,
  patch: object,
  now: number,
): EditHistory<E> {
  const keys = keysOf(patch);
  const p = history.pending;
  // Same field(s), still within the window: this is more of the same change, so the step already on the
  // stack is the one to come back to. Only the clock moves, which is what lets a long drag or a
  // four-keystroke number stay one step however many commits it makes.
  if (p && p.keys === keys && now - p.at <= COALESCE_MS) {
    return { ...history, pending: { keys, at: now } };
  }
  const past = [...history.past, current].slice(-MAX_HISTORY);
  // A new edit invalidates anything that was undone: the flyer has taken a different branch, and offering
  // to redo a state that no longer follows from the current one would put back an edit they did not make.
  return { past, future: [], pending: { keys, at: now } };
}

/** Record a whole-bag replacement — "Reset to as-designed", or any action that is one step by nature.
 *
 *  Distinct from `commitEdit` because it must never coalesce: a reset is a decision, not a keystroke, and
 *  folding it into the edit before it would make the one thing a flyer most wants back unreachable. */
export function commitReplacement<E extends object>(history: EditHistory<E>, current: E): EditHistory<E> {
  return { past: [...history.past, current].slice(-MAX_HISTORY), future: [], pending: undefined };
}

export const canUndo = <E>(h: EditHistory<E>): boolean => h.past.length > 0;
export const canRedo = <E>(h: EditHistory<E>): boolean => h.future.length > 0;

/** Step back. Returns the state to apply and the history to keep, or null when there is nothing to undo. */
export function undoEdit<E extends object>(
  history: EditHistory<E>,
  current: E,
): { edits: E; history: EditHistory<E> } | null {
  if (!history.past.length) return null;
  const edits = history.past[history.past.length - 1];
  return {
    edits,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, current],
      // Ends the coalescing run: typing straight after an undo is a new step, not a continuation of the
      // one that was just stepped out of.
      pending: undefined,
    },
  };
}

/** Step forward again. Null when there is nothing to redo. */
export function redoEdit<E extends object>(
  history: EditHistory<E>,
  current: E,
): { edits: E; history: EditHistory<E> } | null {
  if (!history.future.length) return null;
  const edits = history.future[history.future.length - 1];
  return {
    edits,
    history: {
      past: [...history.past, current].slice(-MAX_HISTORY),
      future: history.future.slice(0, -1),
      pending: undefined,
    },
  };
}
