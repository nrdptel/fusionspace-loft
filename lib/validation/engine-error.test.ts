import { describe, it, expect } from "vitest";
import { engineFailure } from "./engine-error";

/** The real thing: captured by feeding the vendored in-browser RocketPy a design whose fins have no
 *  root chord — a geometry a flyer can reach by clearing the field — and recording what came back
 *  through the worker. 31 lines, 1,450 characters, and the one line that says what happened is the
 *  last. Kept verbatim (paths and all) so the split is tested against what actually arrives, not a
 *  tidied-up idea of it. */
const REAL_TRACEBACK = `Traceback (most recent call last):
  File "/lib/python314.zip/_pyodide/_base.py", line 597, in eval_code_async
    await CodeRunner(
    ...<9 lines>...
    .run_async(globals, locals)
  File "/lib/python314.zip/_pyodide/_base.py", line 411, in run_async
    coroutine = eval(self.code, globals, locals)
  File "<exec>", line 2, in <module>
  File "/loft/fly.py", line 72, in fly
    rocket.add_trapezoidal_fins(
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^
        n=f["n"], root_chord=f["rootChord"], tip_chord=f["tipChord"], span=f["span"],
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        position=f["position"], sweep_length=f["sweepLength"], radius=f["radius"],
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "/lib/python3.14/site-packages/rocketpy/rocket/rocket.py", line 1342, in add_trapezoidal_fins
    fin_set = TrapezoidalFins(
        n,
    ...<8 lines>...
        name,
    )
  File "/lib/python3.14/site-packages/rocketpy/rocket/aero_surface/fins/trapezoidal_fins.py", line 184, in __init__
    self.evaluate_geometrical_parameters()
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^
  File "/lib/python3.14/site-packages/rocketpy/rocket/aero_surface/fins/trapezoidal_fins.py", line 274, in evaluate_geometrical_parameters
    lambda_ = self.tip_chord / self.root_chord
              ~~~~~~~~~~~~~~~^~~~~~~~~~~~~~~~~
ZeroDivisionError: division by zero
`;

describe("engineFailure", () => {
  it("leads with the line that says what went wrong, not the first frame", () => {
    const { headline } = engineFailure(REAL_TRACEBACK);
    expect(headline).toBe("ZeroDivisionError: division by zero");
  });

  it("keeps the whole report, carets and paths intact, for the flyer reporting it", () => {
    const { detail } = engineFailure(REAL_TRACEBACK);
    // Not a summary of the traceback — the traceback. The frame naming the actual division is what
    // makes this reportable, and the caret row under it only means anything if its spacing survives.
    expect(detail).toContain("lambda_ = self.tip_chord / self.root_chord");
    expect(detail).toContain("              ~~~~~~~~~~~~~~~^~~~~~~~~~~~~~~~~");
    expect(detail).toContain('File "/loft/fly.py", line 72, in fly');
    expect(detail.split("\n")).toHaveLength(30);
  });

  it("offers nothing to expand when the message is a single line", () => {
    // The worker's own fallback when a fatal error carries no message. Expanding it would show the
    // headline again.
    expect(engineFailure("The RocketPy worker crashed.")).toEqual({
      headline: "The RocketPy worker crashed.",
      detail: "",
    });
  });

  it("ignores trailing blank lines when deciding both the headline and whether to fold", () => {
    expect(engineFailure("Something broke.\n\n  \n")).toEqual({
      headline: "Something broke.",
      detail: "",
    });
  });

  it("says something rather than trailing off when the engine supplies no words", () => {
    expect(engineFailure("").headline).toBe("it stopped without saying why");
    expect(engineFailure("   \n \n ").headline).toBe("it stopped without saying why");
  });

  it("trims the headline so a padded last line does not read as an indented fragment", () => {
    expect(engineFailure("Traceback:\n    RuntimeError: no atmosphere  ").headline).toBe(
      "RuntimeError: no atmosphere",
    );
  });
});
