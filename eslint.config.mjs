import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Reading localStorage / URL state on mount requires a setState inside an
      // effect — it can't run during SSR without a hydration mismatch. This is
      // the standard hydration-safe pattern (theme toggle, saved log, URL state),
      // not the cascading-render smell this rule targets.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // public/pyodide/** is the vendored Pyodide runtime (git-ignored, minified) — never our code.
  { ignores: ["out/**", ".next/**", "node_modules/**", "next-env.d.ts", "public/sw.js", "public/pyodide/**"] },
];

export default config;
