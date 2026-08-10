/** The gate's own configuration, checked the way `lib/design-doc.test.ts` checks `DESIGN.md`.
 *
 *  **A rule that is off says nothing, and that is exactly how it hides.** `eslint-config-next` brings
 *  React, hooks and Next rules and does NOT extend ESLint's own recommended set, so for the life of
 *  this repo the sixty-one checks that catch plain JavaScript mistakes were all silently off. The
 *  cost was a duplicate `case "flyer":` in `components/LoftApp.tsx` — unreachable, on `main` through
 *  every green gate, and found by a person reading the function rather than by any tool.
 *
 *  Turning it on is one line and deleting it is one line, which is why this exists: a config edit
 *  that drops the set produces no error anywhere, just a quieter linter. This makes that edit fail. */

import { describe, it, expect } from "vitest";
import config from "../eslint.config.mjs";

/** Rules from `js.configs.recommended` that this repo has concrete reason to care about. Named
 *  individually rather than asserting "the recommended object is present", because the point is the
 *  CHECKS being enabled, not which package they arrived in — a future config that supplies them
 *  another way should pass. */
const REQUIRED = [
  // The one that was missing when it was needed. A duplicate case is always dead code.
  "no-duplicate-case",
  // `[, "x"]` — a hole that reads as a typo, which is what it usually is.
  "no-sparse-arrays",
  // An invisible character in an identifier or between tokens. Configured to skip strings and
  // template literals, where a non-breaking space between a figure and its unit is deliberate.
  "no-irregular-whitespace",
  // Two properties of one name in an object literal: the second wins and the first is a lie.
  "no-dupe-keys",
  // Two parameters of one name; the same shape, in a signature.
  "no-dupe-args",
  // A condition that cannot be false, which is how a guard stops guarding.
  "no-constant-condition",
  // `return` inside `finally`, which swallows the exception that was on its way out.
  "no-unsafe-finally",
];

describe("the lint config runs the rules it is assumed to run", () => {
  it("enables ESLint's own recommended checks, not only the framework's", () => {
    // A flat config is an array of blocks, each of which may carry rules; a rule is enabled if any
    // block sets it. Read from the real exported config rather than from the file's text, so a
    // refactor that keeps the behaviour keeps passing.
    const enabled = new Set<string>();
    for (const block of config as { rules?: Record<string, unknown> }[]) {
      for (const rule of Object.keys(block?.rules ?? {})) enabled.add(rule);
    }
    const missing = REQUIRED.filter((r) => !enabled.has(r));
    expect(missing, "a lint rule this repo relies on is no longer enabled").toEqual([]);
  });

  /** The one deliberate relaxation, asserted as a relaxation rather than left to be rediscovered.
   *  If `skipTemplates` is ever dropped, every figure-plus-unit string in the solver's prose becomes
   *  a lint error and the tempting fix is to delete the non-breaking spaces — which would let a
   *  number and its unit break across a line. */
  it("keeps the non-breaking spaces in user-facing prose legal", () => {
    // The LAST block that sets it wins in a flat config, and two do: the recommended set turns it on
    // as a bare "error", and this repo re-states it with the two skips. Reading the first would
    // assert the thing being overridden rather than the thing in force.
    const blocks = (config as { rules?: Record<string, unknown> }[]).filter(
      (b) => b?.rules?.["no-irregular-whitespace"],
    );
    expect(blocks.length, "no-irregular-whitespace is not configured here any more").toBeGreaterThan(0);
    expect(blocks[blocks.length - 1].rules!["no-irregular-whitespace"]).toEqual([
      "error",
      { skipStrings: true, skipTemplates: true },
    ]);
  });
});
