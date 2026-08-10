import js from "@eslint/js";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  // **ESLint's own recommended set, which this repo was not running.**
  //
  // `eslint-config-next` brings React, hooks and Next rules; it does NOT extend `js.configs.recommended`,
  // so the sixty-one rules that catch plain JavaScript mistakes were all off. Nothing said so, and the
  // cost was real: a duplicate `case "flyer":` in `components/LoftApp.tsx` was unreachable, was on `main`
  // through every green gate, and was found by a person reading the function rather than by any tool.
  //
  // Measured before enabling: the whole repo produces **two** errors under it, both genuine and both
  // fixed in the same change. That is the argument for turning it on rather than filing it — the rule
  // set is not a project of adopting a standard, it is sixty-one checks that were free and switched off.
  js.configs.recommended,
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Reading localStorage / URL state on mount requires a setState inside an
      // effect — it can't run during SSR without a hydration mismatch. This is
      // the standard hydration-safe pattern (theme toggle, saved log, URL state),
      // not the cascading-render smell this rule targets.
      "react-hooks/set-state-in-effect": "off",
      // **A non-breaking space in a user-facing string is correct typography, not a hazard.**
      // The rule's point is that invisible whitespace in CODE is impossible to debug, and it skips
      // ordinary strings by default for exactly this reason — but not template literals, which is
      // where this codebase builds most of its prose. `lib/sim/simulate.ts` writes `${d}<NBSP>m` so a
      // figure and its unit cannot be split across a line break, which is deliberate and is the same
      // thing the JSX writes as `&nbsp;`. Kept ON everywhere else: an irregular space in an
      // identifier or between tokens stays an error.
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true }],
    },
  },
  // public/pyodide/** is the vendored Pyodide runtime (git-ignored, minified) — never our code.
  { ignores: ["out/**", ".next/**", "node_modules/**", "next-env.d.ts", "public/sw.js", "public/pyodide/**"] },
];

export default config;
