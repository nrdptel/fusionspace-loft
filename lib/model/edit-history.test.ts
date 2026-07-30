import { describe, it, expect } from "vitest";
import {
  COALESCE_MS,
  MAX_HISTORY,
  canRedo,
  canUndo,
  commitEdit,
  commitReplacement,
  emptyHistory,
  redoEdit,
  undoEdit,
  type EditHistory,
} from "./edit-history";

type E = Record<string, unknown>;

/** Drive a sequence of edits the way the app does: commit the history, then apply the patch. */
function run(steps: Array<{ patch: E; at: number }>): { history: EditHistory<E>; edits: E } {
  let history = emptyHistory<E>();
  let edits: E = {};
  for (const s of steps) {
    history = commitEdit(history, edits, s.patch, s.at);
    edits = { ...edits, ...s.patch };
  }
  return { history, edits };
}

describe("edit history — the basics", () => {
  it("has nothing to undo or redo when empty", () => {
    const h = emptyHistory<E>();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undoEdit(h, {})).toBeNull();
    expect(redoEdit(h, {})).toBeNull();
  });

  it("steps back to the exact previous bag, then forward again", () => {
    const { history, edits } = run([
      { patch: { finSpan: 0.05 }, at: 0 },
      { patch: { bodyLength: 0.6 }, at: 5000 },
    ]);
    expect(edits).toEqual({ finSpan: 0.05, bodyLength: 0.6 });
    expect(canUndo(history)).toBe(true);

    const back = undoEdit(history, edits)!;
    expect(back.edits).toEqual({ finSpan: 0.05 });
    expect(canRedo(back.history)).toBe(true);

    const again = undoEdit(back.history, back.edits)!;
    expect(again.edits).toEqual({});
    expect(canUndo(again.history)).toBe(false);

    // Forward: the same states, in order.
    const fwd1 = redoEdit(again.history, again.edits)!;
    expect(fwd1.edits).toEqual({ finSpan: 0.05 });
    const fwd2 = redoEdit(fwd1.history, fwd1.edits)!;
    expect(fwd2.edits).toEqual({ finSpan: 0.05, bodyLength: 0.6 });
    expect(canRedo(fwd2.history)).toBe(false);
  });

  it("a new edit after an undo drops the redo branch", () => {
    // The flyer has taken a different branch. Offering to redo a state that no longer follows from the
    // current one would put back an edit they did not make.
    const { history, edits } = run([
      { patch: { finSpan: 0.05 }, at: 0 },
      { patch: { bodyLength: 0.6 }, at: 5000 },
    ]);
    const back = undoEdit(history, edits)!;
    expect(canRedo(back.history)).toBe(true);

    const h2 = commitEdit(back.history, back.edits, { noseLength: 0.2 }, 10000);
    expect(canRedo(h2)).toBe(false);
    // ...and undo still goes back the way it came.
    const back2 = undoEdit(h2, { ...back.edits, noseLength: 0.2 })!;
    expect(back2.edits).toEqual({ finSpan: 0.05 });
  });
});

describe("edit history — coalescing, which is what makes it usable", () => {
  it("folds a number typed digit by digit into ONE step", () => {
    // `Num` fires on every keystroke, so typing "1500" into the field-elevation box commits four edits.
    // Without coalescing, undo walks back through a flyer's typing one character at a time.
    const { history, edits } = run([
      { patch: { launchAltitude: 1 }, at: 0 },
      { patch: { launchAltitude: 15 }, at: 120 },
      { patch: { launchAltitude: 150 }, at: 260 },
      { patch: { launchAltitude: 1500 }, at: 400 },
    ]);
    expect(edits).toEqual({ launchAltitude: 1500 });
    expect(history.past.length).toBe(1);

    // One undo returns to before the number was typed at all.
    const back = undoEdit(history, edits)!;
    expect(back.edits).toEqual({});
    expect(canUndo(back.history)).toBe(false);
  });

  it("folds a whole drag into one step", () => {
    // A diagram handle commits one edit per pointer move — dozens in a drag. Same field, milliseconds
    // apart, so it is one step: a handle cannot be un-dragged by retyping a number the way a field can,
    // which is the reason undo had to exist for it at all.
    const steps = Array.from({ length: 40 }, (_, i) => ({ patch: { finStation: 0.4 + i * 0.002 }, at: i * 16 }));
    const { history } = run(steps);
    expect(history.past.length).toBe(1);
    expect(history.past[0]).toEqual({});
  });

  it("does NOT fold two edits to DIFFERENT fields, however fast", () => {
    const { history } = run([
      { patch: { finSpan: 0.05 }, at: 0 },
      { patch: { bodyLength: 0.6 }, at: 10 },
    ]);
    expect(history.past.length).toBe(2);
  });

  it("does NOT fold the same field once the flyer has paused", () => {
    const { history, edits } = run([
      { patch: { finSpan: 0.05 }, at: 0 },
      { patch: { finSpan: 0.077 }, at: COALESCE_MS + 1 },
    ]);
    expect(history.past.length).toBe(2);
    // So both values are reachable: 0.077 → 0.05 → nothing.
    const b1 = undoEdit(history, edits)!;
    expect(b1.edits).toEqual({ finSpan: 0.05 });
    const b2 = undoEdit(b1.history, b1.edits)!;
    expect(b2.edits).toEqual({});
  });

  it("coalesces on the boundary and breaks one millisecond past it", () => {
    expect(run([{ patch: { a: 1 }, at: 0 }, { patch: { a: 2 }, at: COALESCE_MS }]).history.past.length).toBe(1);
    expect(run([{ patch: { a: 1 }, at: 0 }, { patch: { a: 2 }, at: COALESCE_MS + 1 }]).history.past.length).toBe(2);
  });

  it("does not coalesce across an undo", () => {
    // Typing straight after stepping back is a new step, not a continuation of the one just stepped out of
    // — otherwise the undo becomes unreachable the moment the flyer touches the same field again.
    const { history, edits } = run([
      { patch: { finSpan: 0.05 }, at: 0 },
      { patch: { finSpan: 0.077 }, at: 5000 },
    ]);
    const back = undoEdit(history, edits)!;
    const h2 = commitEdit(back.history, back.edits, { finSpan: 0.06 }, 5010);
    expect(h2.past.length).toBe(back.history.past.length + 1);
  });

  it("does not coalesce across a redo", () => {
    const { history, edits } = run([{ patch: { finSpan: 0.05 }, at: 0 }]);
    const back = undoEdit(history, edits)!;
    const fwd = redoEdit(back.history, back.edits)!;
    const h2 = commitEdit(fwd.history, fwd.edits, { finSpan: 0.06 }, 20);
    expect(h2.past.length).toBe(fwd.history.past.length + 1);
  });
});

describe("edit history — a reset is one step, and it comes back", () => {
  it("makes 'Reset to as-designed' undoable", () => {
    // The one control that used to be a one-way door for everything: it discards every what-if at once.
    const { history, edits } = run([
      { patch: { finSpan: 0.077 }, at: 0 },
      { patch: { ballastKg: 0.02 }, at: 5000 },
    ]);
    const afterReset = commitReplacement(history, edits);
    const back = undoEdit(afterReset, {})!;
    expect(back.edits).toEqual({ finSpan: 0.077, ballastKg: 0.02 });
  });

  it("never coalesces a reset into the edit before it", () => {
    const { history, edits } = run([{ patch: { finSpan: 0.077 }, at: 0 }]);
    // Same instant, and it still becomes its own step — a reset is a decision, not a keystroke.
    const afterReset = commitReplacement(history, edits);
    expect(afterReset.past.length).toBe(history.past.length + 1);
    expect(afterReset.pending).toBeUndefined();
  });
});

describe("edit history — bounds", () => {
  it("keeps the stack bounded and drops the OLDEST step", () => {
    let history = emptyHistory<E>();
    let edits: E = {};
    for (let i = 0; i < MAX_HISTORY + 25; i++) {
      // Distinct fields so nothing coalesces.
      history = commitEdit(history, edits, { [`f${i}`]: i }, i * 10_000);
      edits = { ...edits, [`f${i}`]: i };
    }
    expect(history.past.length).toBe(MAX_HISTORY);
    // The most recent step is still one undo away — the cap must never cost the newest history.
    const back = undoEdit(history, edits)!;
    expect(back.edits[`f${MAX_HISTORY + 23}`]).toBe(MAX_HISTORY + 23);
    expect(back.edits[`f${MAX_HISTORY + 24}`]).toBeUndefined();
  });

  it("never hands back a mutated bag — the entries are the states as they were", () => {
    const first: E = { finSpan: 0.05 };
    let history = commitEdit(emptyHistory<E>(), first, { bodyLength: 0.6 }, 0);
    const current = { ...first, bodyLength: 0.6 };
    history = commitEdit(history, current, { noseLength: 0.2 }, 5000);
    const back = undoEdit(history, { ...current, noseLength: 0.2 })!;
    expect(back.edits).toEqual({ finSpan: 0.05, bodyLength: 0.6 });
    // The oldest entry is untouched by anything that happened after it.
    expect(history.past[0]).toEqual({ finSpan: 0.05 });
  });
});
