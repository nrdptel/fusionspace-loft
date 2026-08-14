#!/usr/bin/env node
/** Assert that a name the e2e suite asserts the ABSENCE of is a name the app can still produce.
 *
 *  **The defect this exists for is a test that stops testing and goes on passing.** The suite is full
 *  of `await expect(x.getByText("…")).toHaveCount(0)` — 109 count-zero assertions and 11 hidden ones.
 *  Every one of them is written to pin a real behaviour: that a first-run download note is withheld
 *  after a failure, that a shelf heading is gone once the shelf is empty, that a configuration prompt
 *  does not appear for a single-configuration design. And every one of them passes just as green when
 *  the string it names no longer exists anywhere in the app. A copy edit in a component is enough. The
 *  test does not fail, it does not warn, and it never tests anything again.
 *
 *  Measured when this was written: **five names in the suite are asserted ONLY as absences**, each one
 *  copy edit away from being permanently vacuous, and a vacuous absence assertion prints identically to
 *  a correct one. That is the same false all-clear `check-links.mjs` and `check-routes.mjs` are written
 *  against, arriving through the test suite rather than through the build.
 *
 *  **Why absence is the half that can be gated, and presence is not.** For a name asserted PRESENT, a
 *  rename fails the test loudly — the suite is its own alarm, and this script would add nothing. For a
 *  name asserted ABSENT, the direction reverses: finding the string somewhere in the build output
 *  proves only that the app can still produce it, which is exactly what the assertion needs to be
 *  meaningful, while NOT finding it proves the assertion can never fail again. So absence-only names
 *  are a verdict and gate; everything else is a lead and is reported separately, never added into one
 *  total. That split, and the reason for it, is `check-text-gaps.mjs`'s — a reliable detector over
 *  served markup beside a lead detector over client chunks, with only the reliable one gating.
 *
 *  **It reads BOTH kinds of build output, because this app is not in its HTML.** All four workspace
 *  routes render `null` on the server by design — the shell lives in the route group's layout so that
 *  moving between workspaces does not unmount a running dispersion — so `out/**\/*.html` carries the
 *  header, the footer and almost nothing else. A check scoped to served markup alone would report
 *  every selector resolved while seeing a fraction of the app, which is the shape of failure this
 *  milestone is named after. `out/_next/static/**\/*.js` is where the strings actually are.
 *
 *  **What it deliberately does NOT claim.** It cannot say an element with that name is ever RENDERED,
 *  or that it carries the role the selector asks for — a string in a chunk is a string in a chunk. It
 *  says only that the name still exists in the shipped code, which is the precise question a vacuous
 *  absence assertion fails. It also cannot see a name built by a regex, an interpolation or a variable;
 *  those counts are printed rather than hidden, because an instrument that reports "all resolve" over a
 *  population it never looked at is the thing being prevented.
 *
 *  A postbuild script rather than a vitest test, for `check-routes.mjs`'s reason: `npm test` runs
 *  before `npm run build`, so a test reading `out/` would fail on a clean checkout or skip itself when
 *  the directory is absent — and a suite that skips prints almost exactly like one that passed.
 *
 *  Run after a build: `node scripts/check-selectors.mjs`. Exits 1 on any absence-only name with no
 *  string behind it, naming the name and the spec file and line that asserts it.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "out");
const e2e = resolve(root, "e2e");

/** Names that legitimately cannot appear in the build output, each with the reason it cannot — for a
 *  name the app assembles at runtime, "not found as a literal" is the correct answer and always will
 *  be. An explicit list with a written reason per entry rather than a pattern, for
 *  `check-classes.mjs`'s reason: a pattern grows until it covers the next real defect.
 *
 *  **Deliberately EMPTY, and that is a measurement rather than an omission.** The first draft carried
 *  three entries for the `${toolName} vs Loft` headings, written from a list of names expected to be
 *  unreachable. All three were wrong in one way or the other — one is present in the build as a
 *  literal after all, and the other two are not absence-only, so nothing consults them. The script
 *  reports idle entries for exactly this reason and named all three on its own first run. An
 *  exemption that excuses nothing today is an exemption that will one day excuse a real defect, so
 *  the honest list is the empty one and the reporting is what keeps it that way. */
const RUNTIME_NAMES = new Map([]);

function walk(dir, hit, pred) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, hit, pred);
    else if (pred(name)) hit.push(p);
  }
}

/** Source with comments and JSX-free — the suite is heavily commented and a name discussed in prose is
 *  not a name asserted. Strips block and line comments only; string contents are left alone. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

/** Every literal accessible name a statement names, by the three locators that take one. Regex,
 *  template and variable forms are counted separately by the caller and never guessed at. */
const NAME_PATTERNS = [
  /getByRole\(\s*"[^"]*"\s*,\s*\{[^}]*\bname:\s*"((?:[^"\\]|\\.)*)"/g,
  /getByLabel\(\s*"((?:[^"\\]|\\.)*)"/g,
  /getByText\(\s*"((?:[^"\\]|\\.)*)"/g,
];
const UNCHECKABLE_PATTERNS = [
  /getByRole\(\s*"[^"]*"\s*,\s*\{[^}]*\bname:\s*\//g,
  /getByLabel\(\s*\//g,
  /getByText\(\s*\//g,
  /getByRole\(\s*"[^"]*"\s*,\s*\{[^}]*\bname:\s*`/g,
  /getByLabel\(\s*`/g,
  /getByText\(\s*`/g,
];

const ABSENCE = /toHaveCount\(\s*0\s*\)|toBeHidden\(\s*\)/;

const specs = [];
walk(e2e, specs, (n) => n.endsWith(".spec.ts"));

/** name -> { negative: [where], positive: number } */
const names = new Map();
let uncheckable = 0;
let statements = 0;

for (const f of specs) {
  const src = stripComments(readFileSync(f, "utf8"));
  // Line numbers are taken from the ORIGINAL text, so a report points at the real file.
  const original = readFileSync(f, "utf8").split("\n");
  // A statement, not a line: an absence assertion routinely wraps across three or four lines, and a
  // line-scoped read would classify the locator and its assertion as unrelated.
  for (const stmt of src.split(";")) {
    if (!stmt.includes("getBy")) continue;
    statements++;
    const negative = ABSENCE.test(stmt);
    for (const re of UNCHECKABLE_PATTERNS) uncheckable += (stmt.match(re) ?? []).length;
    for (const re of NAME_PATTERNS) {
      for (const m of stmt.matchAll(re)) {
        const name = m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        if (!name) continue;
        const rec = names.get(name) ?? { negative: [], positive: 0 };
        if (negative) {
          const line = original.findIndex((l) => l.includes(m[1])) + 1;
          rec.negative.push(`${relative(root, f)}${line > 0 ? `:${line}` : ""}`);
        } else {
          rec.positive++;
        }
        names.set(name, rec);
      }
    }
  }
}

if (!specs.length || !statements) {
  console.error(
    `check-selectors: read ${specs.length} spec file(s) and found ${statements} selector statement(s) — ` +
      "which cannot be right. The suite is not where this expected it.",
  );
  process.exit(1);
}

if (!existsSync(out)) {
  console.error("check-selectors: out/ not found — run this after `npm run build`.");
  process.exit(1);
}

const artifacts = [];
walk(out, artifacts, (n) => n.endsWith(".html") || n.endsWith(".js"));
if (!artifacts.length) {
  console.error("check-selectors: no built documents or chunks under out/ — the scan found none, which cannot be right.");
  process.exit(1);
}
const haystack = artifacts.map((f) => readFileSync(f, "utf8")).join("\n");

const absenceOnly = [...names].filter(([, r]) => r.negative.length && r.positive === 0);
const vacuous = [];
const used = new Set();
for (const [name, rec] of absenceOnly) {
  if (haystack.includes(name)) continue; // found: the assertion still has something to be absent OF
  if (RUNTIME_NAMES.has(name)) {
    used.add(name); // the exemption is what kept this out of the failure list — it is doing work
    continue;
  }
  vacuous.push([name, rec]);
}
// An exemption nobody needs is an exemption that will one day excuse a real defect, so the list is
// held to the same standard as the check. "Doing work" means strictly this: without the entry, the
// build would fail. An entry for a name that is absence-only but present in the build is NOT doing
// work — it would pass on its own — and the first draft of this counted those as used, which would
// have let three speculative entries sit here reading as load-bearing. Reported, not gated: an entry
// can go idle because a test was rewritten, which is nobody's regression.
const idle = [...RUNTIME_NAMES.keys()].filter((n) => !used.has(n));

console.log(
  `check-selectors: ${names.size} literal selector name(s) across ${specs.length} spec file(s); ` +
    `${absenceOnly.length} asserted only as an absence (${used.size} allowlisted as runtime-assembled), ` +
    `checked against ${artifacts.length} built document(s) and chunk(s)`,
);
if (idle.length) {
  console.log(
    `check-selectors: ${idle.length} allowlist entr(ies) doing no work and safe to delete: ${idle.map((n) => `"${n}"`).join(", ")}`,
  );
}
console.log(
  `check-selectors: ${uncheckable} regex or template selector name(s) NOT examined — this instrument ` +
    "cannot see them, and says so rather than counting them as resolved",
);

if (vacuous.length) {
  console.error(`\ncheck-selectors: ${vacuous.length} name(s) asserted absent that the app can no longer produce:`);
  for (const [name, rec] of vacuous) console.error(`  "${name}"  (asserted at ${rec.negative.join(", ")})`);
  console.error(
    "\nEach of these assertions now passes by matching nothing, and will go on passing forever.\n" +
      "The usual cause is a copy edit in a component that renamed the string the test names. Either\n" +
      "update the test to the new wording, or — if the name is assembled at runtime and cannot appear\n" +
      "as a literal — add it to RUNTIME_NAMES in this script with the reason it cannot.",
  );
  process.exit(1);
}
console.log("check-selectors: every absence-only name still exists in the build");
