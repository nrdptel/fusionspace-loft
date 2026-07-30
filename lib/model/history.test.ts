import { describe, it, expect } from "vitest";
import {
  commit,
  undo,
  redo,
  undoLabel,
  redoLabel,
  endRun,
  describeEdit,
  EDIT_ACTIONS,
  EMPTY_HISTORY,
  COALESCE_MS,
  HISTORY_DEPTH,
  type History,
} from "./history";
import { AIM_SLOTS } from "./edit";

/** The app's what-if bag, reduced to what these tests need to tell two states apart. */
type S = Record<string, unknown>;
const empty = EMPTY_HISTORY as History<S>;

describe("the undo stack", () => {
  it("takes one edit back, and puts it forward again", () => {
    const s0: S = {};
    const s1: S = { finSpan: 0.06 };
    const h = commit(empty, s0, "the fin span", "finSpan", 1_000);
    expect(undoLabel(h)).toBe("the fin span");
    expect(redoLabel(h)).toBe(null);

    const back = undo(h, s1)!;
    expect(back.state).toBe(s0);
    expect(undoLabel(back.history)).toBe(null);
    expect(redoLabel(back.history)).toBe("the fin span");

    const forward = redo(back.history, back.state)!;
    expect(forward.state).toBe(s1);
    expect(undoLabel(forward.history)).toBe("the fin span");
    expect(redoLabel(forward.history)).toBe(null);
  });

  it("has nothing to undo or redo when it is empty", () => {
    expect(undo(empty, {})).toBe(null);
    expect(redo(empty, {})).toBe(null);
    expect(undoLabel(empty)).toBe(null);
    expect(redoLabel(empty)).toBe(null);
  });

  it("walks back through several edits in order, newest first", () => {
    const states: S[] = [{}, { a: 1 }, { a: 1, b: 2 }, { a: 1, b: 2, c: 3 }];
    let h = empty;
    h = commit(h, states[0], "a", "a", 0);
    h = commit(h, states[1], "b", "b", 2_000);
    h = commit(h, states[2], "c", "c", 4_000);

    let present = states[3];
    for (const expected of ["c", "b", "a"]) {
      expect(undoLabel(h)).toBe(expected);
      const step = undo(h, present)!;
      h = step.history;
      present = step.state;
    }
    expect(present).toBe(states[0]);
    expect(undo(h, present)).toBe(null);
  });

  it("drops the branch you left as soon as you edit from an undone point", () => {
    // What every editor does, and what the flyer expects: undo back two steps, make a different
    // change, and the future you abandoned is gone rather than sitting there ready to overwrite it.
    let h = commit(empty, { a: 1 }, "a", "a", 0);
    const back = undo(h, { a: 2 })!;
    expect(redoLabel(back.history)).toBe("a");
    h = commit(back.history, back.state, "b", "b", 1_000);
    expect(redoLabel(h)).toBe(null);
  });
});

describe("a gesture is one undo, not the frames it fired", () => {
  it("merges commits that carry the same key inside the window", () => {
    // A fin-span drag applies a patch on every animation frame — ~16 ms apart, hundreds per drag —
    // and a number typed digit by digit applies one per keystroke. Either would bury the rest of the
    // history under one gesture, and each undo would move the handle a pixel.
    const grabbed: S = { finSpan: 0.019 };
    let h = commit(empty, grabbed, "the fin span", "finSpan", 1_000);
    for (let t = 1_016; t <= 3_000; t += 16) h = commit(h, { finSpan: t / 1e5 }, "the fin span", "finSpan", t);
    expect(h.past).toHaveLength(1);

    // And it returns to where the handle was GRABBED, not to the frame before the last one.
    expect(undo(h, { finSpan: 0.06 })!.state).toBe(grabbed);
  });

  it("starts a new step once the flyer pauses", () => {
    let h = commit(empty, { finSpan: 0.019 }, "the fin span", "finSpan", 1_000);
    h = commit(h, { finSpan: 0.04 }, "the fin span", "finSpan", 1_000 + COALESCE_MS + 1);
    expect(h.past).toHaveLength(2);
  });

  it("starts a new step when the flyer moves to another field", () => {
    let h = commit(empty, {}, "the fin span", "finSpan", 1_000);
    h = commit(h, { finSpan: 0.04 }, "the nose length", "noseLength", 1_010);
    expect(h.past).toHaveLength(2);
    expect(undoLabel(h)).toBe("the nose length");
  });

  it("never merges two removals, however fast they are made", () => {
    // Each deletion has to be separately undoable — it is the one edit retyping a number cannot
    // bring back — so removals pass a key unique to the part rather than the field name they share.
    let h = commit(empty, {}, "removing the fin set", "remove:fins-1", 1_000);
    h = commit(h, { removedIds: ["fins-1"] }, "removing the nose weight", "remove:mass-2", 1_010);
    expect(h.past).toHaveLength(2);
    expect(undoLabel(h)).toBe("removing the nose weight");
  });

  it("does not merge a new gesture into the step an undo just restored", () => {
    // The trap in a time-and-key rule: drag the span, undo it, then grab the same handle again
    // within the window. Without closing the run the second gesture merges into the step below it
    // and vanishes — one undo would take back two drags, and the flyer would never see the first.
    let h = commit(empty, { finSpan: 0.019 }, "the fin span", "finSpan", 1_000);
    h = commit(h, { finSpan: 0.03 }, "the fin span", "finSpan", 5_000);
    expect(h.past).toHaveLength(2);

    const back = undo(h, { finSpan: 0.05 })!;
    const again = commit(back.history, back.state, "the fin span", "finSpan", 5_100);
    expect(again.past).toHaveLength(2);
    expect(undo(again, { finSpan: 0.07 })!.state).toEqual({ finSpan: 0.03 });
  });

  it("closes the run at a boundary the app knows and the clock does not", () => {
    // The defect this exists for, reproduced before it was fixed: picking another fin set changes the
    // state without recording anything — a selection is not an undoable act — so nothing closed the
    // run, and a span dragged on set A, a pick of set B, and a span dragged on set B all carried the
    // key `finSpan` inside the window and merged into ONE step. One undo landed on `{finSetId: "A"}`,
    // taking back both gestures and re-aiming the fields at the first part.
    const onA = { finSetId: "A" };
    let h = commit(empty, onA, "the fin span", "finSpan", 1_000);
    h = endRun(h); // the pick
    h = commit(h, { finSetId: "B", finSpan: 0.05 }, "the fin span", "finSpan", 1_100);
    expect(h.past).toHaveLength(2);
    expect(undo(h, { finSetId: "B", finSpan: 0.08 })!.state).toEqual({ finSetId: "B", finSpan: 0.05 });
  });

  it("leaves an empty history alone when a run is closed", () => {
    expect(endRun(empty)).toBe(empty);
  });

  it("does not merge a new gesture into the step a redo just pushed", () => {
    const h = commit(empty, { finSpan: 0.019 }, "the fin span", "finSpan", 1_000);
    const back = undo(h, { finSpan: 0.03 })!;
    const forward = redo(back.history, back.state)!;
    const next = commit(forward.history, forward.state, "the fin span", "finSpan", 1_050);
    expect(next.past).toHaveLength(2);
  });
});

describe("the stack is bounded", () => {
  it("keeps the newest steps and drops the oldest", () => {
    let h = empty;
    for (let i = 0; i <= HISTORY_DEPTH + 10; i++) h = commit(h, { i }, `edit ${i}`, `k${i}`, i * 10_000);
    expect(h.past).toHaveLength(HISTORY_DEPTH);
    expect(undoLabel(h)).toBe(`edit ${HISTORY_DEPTH + 10}`);
    expect(h.past[0].label).toBe(`edit ${11}`);
  });
});

describe("what the control says it will undo", () => {
  it("names a single-field edit after the field", () => {
    expect(describeEdit({ finSpan: 0.06 })).toBe("the fin span");
    expect(describeEdit({ rodLength: 3.048 })).toBe("the rail length");
    expect(describeEdit({ mainDeployAltitude: 150 })).toBe("the main deployment altitude");
  });

  it("stays vague rather than listing fields when a patch touches several", () => {
    // These come from switching scenario or clearing everything, where naming three fields is less
    // honest than not naming any: the flyer did one thing.
    expect(describeEdit({ windSpeed: undefined, launchAltitude: undefined })).toBe("the design");
    expect(describeEdit({})).toBe("the design");
  });

  it("labels a field the registry has never heard of rather than saying nothing", () => {
    // A field added to the editor later must not produce "Undo undefined". The registry is for prose
    // the name alone does not give; the fallback covers everything else.
    expect(describeEdit({ aFieldAddedLater: 1 })).toBe("the a field added later");
    expect(describeEdit({ finFlutterMargin: 2 })).toBe("the fin flutter margin");
  });

  it("names every field the aim registry can target", () => {
    // The fields the flyer edits most, and the ones a pick re-aims. If one of these fell through to
    // the fallback the undo control would read "the main parachute diameter" — the variable's name,
    // not the panel's — for the field the flyer just used.
    for (const slot of Object.values(AIM_SLOTS)) {
      for (const field of slot.targets) {
        expect(EDIT_ACTIONS[field], `${field} needs an undo label`).toBeTruthy();
      }
    }
  });
});
