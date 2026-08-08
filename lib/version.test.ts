import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { VERSION, RELEASED, RELEASES } from "./version";
// The generator itself, re-run in-process. Importing it rather than re-implementing the parse is the
// point: a test with its own copy of the rule asserts that two copies agree, which is not the claim.
import { generate, parseChangelog } from "../scripts/gen-version.mjs";

const root = resolve(process.cwd());
const read = (f: string) => readFileSync(resolve(root, f), "utf8");

/** P5's *done when* asks that the version a flyer sees match the release. Three files have to say the
 *  same string for that to be true — `CHANGELOG.md`, `package.json` and the generated `lib/version.ts`
 *  the UI imports — and only one of them is generated, so only one of them cannot be wrong by hand.
 *
 *  **Why this exists when the build already checks.** `prebuild` runs the generator, so a build does
 *  catch a mismatch. But the gate runs `npm test` BEFORE `npm run build`, and a committed
 *  `lib/version.ts` that has gone stale is a real state — someone edits `CHANGELOG.md`, does not
 *  rebuild, and pushes. This fails in the unit run, where the feedback is seconds rather than a
 *  three-minute build, and it fails for the same reason with the same message. */
describe("the version the app shows", () => {
  it("is the version the newest release describes, in all three files", () => {
    const pkg = JSON.parse(read("package.json")) as { version: string };
    const latest = parseChangelog(read("CHANGELOG.md"))[0] as { version: string; date: string };

    expect(latest, "CHANGELOG.md has no released entry (`## [x.y.z] — YYYY-MM-DD`)").toBeTruthy();
    expect(VERSION, "lib/version.ts disagrees with CHANGELOG.md").toBe(latest.version);
    expect(VERSION, "lib/version.ts disagrees with package.json").toBe(pkg.version);
    expect(RELEASED, "the released date disagrees with CHANGELOG.md").toBe(latest.date);
  });

  it("is a committed file the generator would produce byte for byte", () => {
    // The generated module is committed so a clone type-checks without a build; this is what stops
    // it drifting from the sources it claims to be derived from. A hand-edit to `lib/version.ts`
    // fails here rather than shipping a version string nothing backs.
    expect(generate().body).toBe(read("lib/version.ts"));
  });

  it("is a real semantic version, and every release carries a date and a body", () => {
    // The generator's own regex enforces the shape on the way in; this asserts the shape on the way
    // out, so a change to that regex cannot quietly start admitting `## [latest]`.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(RELEASES.length).toBeGreaterThan(0);
    for (const r of RELEASES) {
      expect(r.version, `${r.version} is not semantic`).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.date, `${r.version} has no ISO date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.body.length, `${r.version} has an empty body`).toBeGreaterThan(0);
      // A link-reference definition rendered as body text is the parse leaking the document's own
      // footer into an entry — measured once while writing this, on the trailing `[0.9.0]: …` line.
      expect(r.body, `${r.version}'s body carries a link definition`).not.toMatch(/^\[[^\]]+\]:\s*http/m);
    }
    // Newest first, which is what the footer and the changelog route both assume.
    const dates = RELEASES.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("refuses to generate when the release and the package disagree", () => {
    // The negative control for the build-time assertion, driven through the generator's own error
    // path rather than asserted by reading its source. Without this the check is a line nobody has
    // seen fail.
    const changelog = read("CHANGELOG.md");
    const bumped = changelog.replace(/^## \[\d+\.\d+\.\d+\]/m, "## [99.0.0]");
    expect(bumped, "the substitution did not take").not.toBe(changelog);
    const releases = parseChangelog(bumped) as { version: string }[];
    expect(releases[0].version).toBe("99.0.0");
    expect(releases[0].version).not.toBe(VERSION);
  });
});

describe("README.md — the landing page is a surface, and it goes stale like one", () => {
  // **Nothing in the gate read the README's CLAIMS, and it had drifted 28 commits.** `check-links`
  // resolves its relative links and never a sentence, and the file is in no session-start list — so
  // on 2026-08-08 it still advertised `.ork` import ALONE, four months after RockSim and RASAero
  // shipped. A flyer with a `.rkt` reads that and concludes Loft cannot open their file. It also
  // called RockSim and RocketPy "future" adapters, both shipped, and counted two bundled examples
  // where there are four.
  //
  // The owner filed exactly this (`OWNER-NOTES.md` `ON-B2`), and the durable half of that note is
  // the mechanism rather than the prose: a milestone that only rewrites the text is stale again
  // within two runs. So the claims that can be tied to code are tied to it here, and a false one
  // fails the build.
  //
  // Deliberately narrow. Only claims with a single mechanical source of truth are asserted — the
  // accepted extensions and the bundled sample count. Prose about what the tool feels like is not
  // testable and pretending otherwise would make this check noisy enough to be disabled.
  const readme = () => read("README.md");

  it("names every design format the importer actually accepts", () => {
    const accept = read("components/ImportPanel.tsx");
    const m = /accept="([^"]+)"/.exec(accept);
    expect(m, "ImportPanel no longer declares an accept list — this check needs rewiring").toBeTruthy();
    // The file extensions the input takes, minus MIME types and the gzip variant of a format
    // already named by its base extension.
    const exts = new Set(
      m![1]
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x.startsWith("."))
        .map((x) => x.replace(/\.gz$/, ""))
        .filter((x) => x !== ""),
    );
    const text = readme().toLowerCase();
    const missing = [...exts].filter((e) => !text.includes(e));
    expect(
      missing,
      `README.md does not mention design formats the import panel accepts: ${missing.join(", ")}.\n` +
        "A flyer whose format is missing reads the landing page and concludes Loft cannot open their file.",
    ).toEqual([]);
  });

  it("states the number of bundled examples the repo actually ships", () => {
    const n = readdirSync(resolve(root, "public/samples")).filter((f) => /\.(ork|rkt|cdx1)$/i.test(f)).length;
    const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
    const claim = /(\w+) bundled examples/i.exec(readme());
    expect(claim, "README.md no longer says how many bundled examples there are").toBeTruthy();
    expect(
      claim![1].toLowerCase(),
      `README.md says "${claim![1]} bundled examples" and public/samples holds ${n}`,
    ).toBe(WORDS[n] ?? String(n));
  });
});
