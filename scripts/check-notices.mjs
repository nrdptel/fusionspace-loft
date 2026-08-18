#!/usr/bin/env node
/** Assert that `THIRD-PARTY-NOTICES.md` names every third-party artifact the build actually ships.
 *
 *  **This exists because the notices file was measurably wrong, and nothing could say so.** Measured
 *  2026-08-18 on a clean build: `out/pyodide/` carried **23 Python wheels**, spanning MPL-2.0,
 *  Apache-2.0, PSF, BSD, MIT-CMU and — in one case — **LGPLv3+**, and the notices file named none of
 *  them. Worse, its own §3 said in as many words that RocketPy *"is not vendored into the bundle and
 *  is not a runtime dependency of the shipped application"*, while `rocketpy-1.12.1-py3-none-any.whl`
 *  (415,563 bytes) sat in the export and `public/pyodide/fly.py` imported it in the browser. The one
 *  explicit negative claim in the repo's legal artifact was contradicted by the deployed bytes.
 *
 *  The cause is structural rather than careless, which is why a check and not just an edit: the
 *  notices file was written against `package.json`, and the Pyodide payload is assembled by
 *  `prebuild` (`scripts/pyodide/vendor.mjs`) from a pinned Pyodide lock plus PyPI. It is a SECOND
 *  dependency set, resolved at build time, that no reader of `package.json` would ever see. Bumping
 *  `PYODIDE_VERSION` or a `DIST_ROOTS` entry pulls a different closure — new wheels, new licences —
 *  with nothing to notice.
 *
 *  What it asserts, all four on the BUILT export so it reads what is actually served:
 *
 *  1. **Every shipped wheel is named in the notices.** By distribution name, not filename, so a
 *     version bump does not fail spuriously while a NEW dependency does.
 *  2. **Every LICENCE the payload carries is named in the notices.** Enumerate-and-subtract, the
 *     same shape `DESIGN.md` §9 uses: a licence nobody has thought of fails rather than passing
 *     unnamed. This is the half that catches a copyleft wheel arriving in a dependency closure.
 *  3. **The notices name nothing that has stopped shipping.** A stale entry is a claim about the
 *     artifact that is no longer true — the same defect as a missing one, in the other direction.
 *  4. **No section of the notices claims something is NOT bundled while it is.** The control for
 *     the specific failure above: the sentence and the file it denies cannot both stand.
 *
 *  Run after a build: `node scripts/check-notices.mjs`. Prints the counts and exits 1 on any
 *  failure, naming the artifact rather than only the number.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAYLOAD = resolve(REPO, "out/pyodide");
const NOTICES_PATH = resolve(REPO, "THIRD-PARTY-NOTICES.md");

if (!existsSync(PAYLOAD)) {
  // A build that ships no Pyodide payload has nothing to check, and saying so is not the same as
  // passing: a silent skip here is exactly the false all-clear the file above was written against.
  console.log("check-notices: no out/pyodide — the build ships no vendored payload, nothing to check");
  process.exit(0);
}

const notices = readFileSync(NOTICES_PATH, "utf8");
const failures = [];

/** A wheel filename is `<name>-<version>-<pytag>-<abi>-<platform>.whl`, and the distribution name
 *  normalises `_` to `-` (PEP 503). Keyed on the name alone so a version bump is not a failure and a
 *  new dependency is. */
const distName = (file) => file.split("-")[0].replace(/_/g, "-").toLowerCase();

/** The licence a wheel declares, read from its own METADATA rather than from any list here — a list
 *  of expected licences could only ever be right about the wheels somebody already looked at. Both
 *  spellings, because the two are a decade apart in packaging history and this payload carries both:
 *  `License-Expression:` (PEP 639, the newer wheels) and `License:` / `Classifier: License ::` (the
 *  older ones, where the field is sometimes the whole licence TEXT and the classifier is the only
 *  machine-readable answer). */
function licenceOf(file) {
  let meta = "";
  try {
    meta = execFileSync("unzip", ["-p", resolve(PAYLOAD, file), "*.dist-info/METADATA"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return "UNREADABLE";
  }
  const expr = meta.match(/^License-Expression:\s*(.+)$/m);
  if (expr) return expr[1].trim();
  const classifier = meta.match(/^Classifier: License :: (?:OSI Approved :: )?(.+)$/m);
  if (classifier) return classifier[1].trim();
  const bare = meta.match(/^License:\s*(.+)$/m);
  // A `License:` field holding prose — matplotlib's is the whole agreement — says nothing a reader
  // can act on, so it is reported as unnamed rather than quoted back as if it were a licence id.
  if (bare && bare[1].trim().length <= 60) return bare[1].trim();
  return "UNNAMED";
}

const wheels = readdirSync(PAYLOAD).filter((f) => f.endsWith(".whl"));
const names = [...new Set(wheels.map(distName))].sort();
const licences = [...new Set(wheels.map(licenceOf))].sort();

// 1. every shipped wheel is named
const unlisted = names.filter((n) => !new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(notices));
if (unlisted.length) {
  failures.push(`${unlisted.length} shipped wheel(s) named nowhere in the notices: ${unlisted.join(", ")}`);
}

// 2. every licence the payload carries is named
const unnamedLicences = licences.filter((l) => {
  if (l === "UNNAMED" || l === "UNREADABLE") return true;
  // Split a compound expression ("BSD-3-Clause AND MIT AND Zlib") into its terms: the notices name
  // the licences, and an expression that happens to be spelled differently is not a new licence.
  return l
    .split(/\s+(?:AND|OR)\s+/)
    .some((term) => !notices.toLowerCase().includes(term.trim().toLowerCase()));
});
if (unnamedLicences.length) {
  failures.push(
    `${unnamedLicences.length} licence(s) the payload carries and the notices do not name: ${unnamedLicences.join(" · ")}`,
  );
}

// 3. nothing named as shipped has stopped shipping. Read from the notices' own wheel table, so the
//    list this checks against is the one a reader sees rather than a second copy here — and scoped
//    to that section by its heading, because this file carries THREE tables and the OpenRocket
//    component one lists 17 `.orc` files that are not wheels and never were. A first draft read
//    every table in the document and reported all 17 as stale, which is an instrument answering a
//    question nobody asked.
const wheelSection = notices.match(/^### The wheels$[\s\S]*?(?=\n\*\*|\n## )/m)?.[0] ?? "";
const inventory = [...wheelSection.matchAll(/^\|\s*`([a-z0-9._-]+)`\s*\|/gim)].map((m) => m[1].toLowerCase());
if (!inventory.length) failures.push("the notices carry no wheel inventory table — §3's `### The wheels` is missing or empty");
const stale = inventory.filter((n) => !names.includes(n));
if (stale.length) {
  failures.push(`${stale.length} entr(y|ies) in the notices inventory that no longer ship: ${stale.join(", ")}`);
}

// 4. the control, and the exact sentence that was false. A "not bundled" claim naming an artifact
//    that IS in the payload fails — a negative claim is the one kind a missing-entry check cannot
//    catch, because the name is present and says the opposite.
//
//    Read from the section's BULLET ITEMS rather than its prose, and that distinction is the whole
//    of the rule: a bullet in that list IS the claim, while the paragraph above them is commentary
//    on it. A first draft scanned the section's whole text and failed on the note recording that
//    RocketPy had been moved OUT of the list — an instrument that cannot tell a claim from a
//    correction of that claim will always punish the correction, which is the shape of blindness
//    `DESIGN.md` §9 catalogues about its own greps.
const notBundled = notices.match(/## \d+\.\s*Not bundled[\s\S]*?(?=\n## |\n$)/i);
if (notBundled) {
  const claims = notBundled[0].split("\n").filter((l) => /^\s*[-*]\s/.test(l)).join("\n");
  const denied = names.filter((n) => new RegExp(`\\b${n}\\b`, "i").test(claims));
  if (denied.length) {
    failures.push(`the "Not bundled" list claims ${denied.join(", ")} is absent, and the build ships it`);
  }
}

console.log(
  `check-notices: ${wheels.length} wheel(s) shipped under ${licences.length} distinct licence(s) ` +
    `(${licences.join(" · ")}), ${inventory.length} named in the notices inventory`,
);

if (failures.length) {
  for (const f of failures) console.error(`check-notices: ${f}`);
  process.exit(1);
}
console.log("check-notices: every shipped artifact and every licence it carries is named");
