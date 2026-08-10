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

  /** **The other direction, and it is the one that actually shipped a false claim.**
   *
   *  The check above asserts the README MENTIONS every extension the input accepts — so it catches an
   *  omission and, by construction, cannot catch an over-claim. Measured 2026-08-11: the landing
   *  page's own card and the changelog entry served at `/docs/changelog` both said Loft imports
   *  *"OpenRocket .ork, RockSim .rkt, RASAero .CDX1, RocketPy and SpaceCAD"*. The file input accepts
   *  three extensions, `lib/ork/import.ts`'s refusal names three formats, and there is no SpaceCAD
   *  code in the repo at all — `lib/validation/rocketpy-spec.ts` builds a spec FROM a Loft design for
   *  the in-browser second solver, which is the export direction. A RocketPy or SpaceCAD flyer read
   *  the front door, tried their file, and was told it is not a rocket design.
   *
   *  So: every design tool NAMED in an import claim must have its own file extension in the accept
   *  list. That is the rule in the direction nothing was checking, and it is self-maintaining — the
   *  day a SpaceCAD adapter lands and puts its extension in the accept list, naming SpaceCAD becomes
   *  legal on its own. */
  it("names no design format the importer does not actually accept", () => {
    const accept = /accept="([^"]+)"/.exec(read("components/ImportPanel.tsx"));
    expect(accept, "ImportPanel no longer declares an accept list — this check needs rewiring").toBeTruthy();
    const exts = new Set(
      accept![1]
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x.startsWith("."))
        .map((x) => x.replace(/\.gz$/, "")),
    );

    /** The extension each design tool's own files carry. A tool is importable exactly when the input
     *  takes its extension — which is why this maps the tool to the FILE rather than to a boolean. */
    const TOOL_FILE: Readonly<Record<string, string>> = {
      openrocket: ".ork",
      rocksim: ".rkt",
      rasaero: ".cdx1",
      rocketpy: ".py",
      spacecad: ".sc",
      aerolab: ".ael",
      openrocketpy: ".py",
    };

    // Where an import claim is made, in the two places a flyer meets one. Matched on the shared
    // phrase rather than on a line number so a reworded card still gets read.
    const CLAIMS: readonly { where: string; text: string }[] = [
      { where: "components/ImportPanel.tsx", text: read("components/ImportPanel.tsx") },
      { where: "CHANGELOG.md", text: read("CHANGELOG.md") },
    ].flatMap(({ where, text }) => {
      const out: { where: string; text: string }[] = [];
      // The claim is what follows "the file you already have" — the phrase both copies share — up to
      // whichever comes first of the next markdown bullet, the end of the JSX fragment, or 240
      // characters. Bounded rather than greedy on purpose: the card AFTER this one names RocketPy
      // legitimately, as the second solver, and a window that ran into it would fail on a true
      // sentence. Matched on the phrase rather than on a line number so a reworded claim is still read.
      const re = /the file you already have/gi;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 240);
        const stop = [rest.indexOf("\n- **"), rest.indexOf("</>")].filter((i) => i >= 0);
        out.push({ where, text: stop.length ? rest.slice(0, Math.min(...stop)) : rest });
      }
      return out;
    });
    expect(
      CLAIMS.length,
      "no import claim was found in either source — this check is asserting nothing",
    ).toBeGreaterThanOrEqual(2);

    const overclaimed: string[] = [];
    for (const { where, text } of CLAIMS) {
      const flat = text.toLowerCase().replace(/[^a-z]/g, "");
      for (const [tool, file] of Object.entries(TOOL_FILE)) {
        if (!flat.includes(tool)) continue;
        if (!exts.has(file)) overclaimed.push(`${where} names ${tool}, whose files are ${file}`);
      }
    }
    expect(
      overclaimed,
      `an import claim names a design tool the file input does not accept: ${overclaimed.join("; ")}.\n` +
        "A flyer with that tool's file reads the claim, tries it, and is told it is not a rocket design.",
    ).toEqual([]);
  });

  /** **Every bundled example a flyer can tap must be one the offline worker will have.**
   *
   *  Measured 2026-08-11 by a phone cold walk: `public/sw.js` hard-coded FOUR sample paths while
   *  `public/samples/` held eight and `ImportPanel` offered all eight. The four added on 2026-08-08
   *  were never added to the worker, so offline, half the "try a bundled example" chips on the front
   *  door hit the worker's own synthetic 504 — in the pad-with-no-signal case the offline claim is
   *  sold on. It is fixed by ENUMERATION rather than by adding four strings: the worker carries a
   *  `__BUILD_SAMPLES__` marker and `scripts/gen-sw-precache.mjs` fills it from `out/samples/`, so
   *  adding a sample cannot forget the worker.
   *
   *  This asserts the two halves that can be checked without a build: the worker delegates rather
   *  than listing, and the offer the landing page makes matches what actually ships. */
  it("offers no bundled example the offline worker would not have", () => {
    const sw = read("public/sw.js");
    expect(
      sw,
      "public/sw.js no longer carries the sample marker — the generator has nothing to fill",
    ).toContain("__BUILD_SAMPLES__");
    // A literal sample path in the SOURCE worker is a hand-maintained list coming back.
    const hardcoded = sw.match(/"\/samples\/[^"]+"/g) ?? [];
    expect(
      hardcoded,
      `public/sw.js lists sample paths by hand again: ${hardcoded.join(", ")}. ` +
        "That list drifted once already; scripts/gen-sw-precache.mjs enumerates out/samples/ instead.",
    ).toEqual([]);

    const onDisk = new Set(
      readdirSync(resolve(root, "public/samples")).filter((f) => /\.(ork|rkt|cdx1)$/i.test(f)),
    );
    const offered = (read("components/ImportPanel.tsx").match(/"\/samples\/([^"]+)"/g) ?? []).map((m) =>
      m.replace(/"/g, "").replace("/samples/", ""),
    );
    expect(offered.length, "ImportPanel offers no bundled examples — this check asserts nothing").toBeGreaterThan(0);
    const ghosts = offered.filter((f) => !onDisk.has(f));
    expect(ghosts, `ImportPanel offers examples that are not in public/samples/: ${ghosts.join(", ")}`).toEqual([]);
    const unoffered = [...onDisk].filter((f) => !offered.includes(f));
    expect(
      unoffered,
      `public/samples/ ships designs the landing page never offers: ${unoffered.join(", ")}`,
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
