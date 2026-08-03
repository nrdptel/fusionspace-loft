#!/usr/bin/env node
/** Turn `CHANGELOG.md` into `lib/version.ts`, and fail the build when the two disagree.
 *
 *  **P5's *done when* asks for "a build-time assertion that the version shown matches the release",
 *  and this is it.** A static export cannot ask GitHub at request time what the latest release is,
 *  so the assertion a build can honestly make is that the three places a version lives all say the
 *  same string: the newest released heading in `CHANGELOG.md`, `package.json`'s `version`, and the
 *  module the UI renders from. This script makes the third one derived rather than typed, which
 *  removes the only copy a human could get wrong, and refuses to emit anything when the first two
 *  disagree.
 *
 *  **A generator rather than importing `package.json` into the bundle**, for the reason
 *  `scripts/gen-motors.mjs` is one: a JSON import drags the whole file — dependency tree, scripts,
 *  devDependencies — into client code to read one field, and the changelog body has to be parsed
 *  for the route anyway. One pass produces both.
 *
 *  **"The release" is the changelog's newest RELEASED version, and that is a decision recorded in
 *  `ROADMAP.md` rather than an oversight.** `git tag` is empty, and cutting this project's first tag
 *  is a publishing act that belongs to the owner, not to a maintenance run. If tagging starts, this
 *  script gains one more comparison and nothing else changes.
 *
 *  Runs in `prebuild`, before `next build`, and again from `lib/version.test.ts` — which re-derives
 *  from the same sources and asserts the committed module matches, so a stale `lib/version.ts`
 *  committed by hand is caught by `npm test` rather than only by a build.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** An `## [1.2.3] — 2026-08-03` heading, and the body under it up to the next one.
 *
 *  `Unreleased` is deliberately NOT matched: a heading with no version is not a release, and taking
 *  it as one would ship a version string the tool cannot stand behind. */
const RELEASE = /^## \[(\d+\.\d+\.\d+)\][^\S\n]*[—-][^\S\n]*(\d{4}-\d{2}-\d{2})[^\S\n]*$/gm;

/** Split one entry's body into its `### Heading` sections and their bullets.
 *
 *  **The structure is resolved HERE, not in the page**, so `/docs/changelog` renders data rather than
 *  parsing markdown at runtime — no markdown library in a bundle that is already budgeted to 335 KB
 *  gzipped, and no `dangerouslySetInnerHTML` on text that a generator writes. What survives into the
 *  page is a heading, a list of bullets, and whatever INLINE markdown each bullet carries
 *  (`**bold**`, `` `code` ``, `[text](url)`), which `lib/inline-markdown.tsx` turns into elements.
 *
 *  A bullet may wrap across lines in the source — the file is hard-wrapped at 100 columns — so a
 *  continuation line is joined onto the bullet above it rather than becoming an empty one. Prose
 *  paragraphs that are not bullets are kept as a section's `lead`, because the first entry has one
 *  and dropping it would silently lose text a human wrote. */
function parseSections(body) {
  const sections = [];
  let current = null;
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const head = /^### (.+)$/.exec(line);
    if (head) {
      current = { heading: head[1], lead: "", items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { heading: "", lead: "", items: [] };
      sections.push(current);
    }
    const bullet = /^[-*] (.+)$/.exec(line);
    if (bullet) {
      current.items.push(bullet[1]);
      continue;
    }
    if (!line.trim()) continue;
    // A hard-wrapped continuation of the bullet above, or lead prose where there is no bullet yet.
    if (current.items.length) current.items[current.items.length - 1] += " " + line.trim();
    else current.lead = current.lead ? `${current.lead} ${line.trim()}` : line.trim();
  }
  return sections.filter((s) => s.heading || s.lead || s.items.length);
}

/** Parse every released entry, newest first, with its body and that body's structure. */
export function parseChangelog(text) {
  const heads = [...text.matchAll(RELEASE)];
  return heads.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
    // Trailing link-reference definitions (`[0.9.0]: https://…`) belong to the document, not to the
    // entry — they would render as stray text in the body.
    const body = text
      .slice(start, end)
      .replace(/^\[[^\]]+\]:\s*\S+$/gm, "")
      .trim();
    return { version: m[1], date: m[2], body, sections: parseSections(body) };
  });
}

export function generate() {
  const changelogPath = resolve(root, "CHANGELOG.md");
  const pkgPath = resolve(root, "package.json");
  const changelog = readFileSync(changelogPath, "utf8");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

  const releases = parseChangelog(changelog);
  if (!releases.length) {
    throw new Error(
      "gen-version: CHANGELOG.md has no released entry. A heading must read `## [x.y.z] — YYYY-MM-DD`.",
    );
  }
  const latest = releases[0];
  if (latest.version !== pkg.version) {
    throw new Error(
      `gen-version: the release and the package disagree — CHANGELOG.md's newest entry is ${latest.version}, package.json says ${pkg.version}. ` +
        "The version a flyer reads in the app must be the version the release describes; fix one of the two rather than the generated file.",
    );
  }

  const banner =
    "// GENERATED by scripts/gen-version.mjs from CHANGELOG.md and package.json — do not edit.\n" +
    "// Add a release by adding a heading to CHANGELOG.md and bumping package.json; the build fails\n" +
    "// if those two disagree, so this file cannot drift from either.\n";

  const body =
    banner +
    "\n/** One released version of Loft, as `CHANGELOG.md` describes it. */\n" +
    "export interface Release {\n" +
    "  version: string;\n" +
    "  /** ISO date the release reached production. */\n" +
    "  date: string;\n" +
    "  /** The entry's markdown body, kept whole so a check can read it as written. */\n" +
    "  body: string;\n" +
    "  /** That body's structure, resolved at build time so the route renders data, not markdown. */\n" +
    "  sections: readonly Section[];\n" +
    "}\n\n" +
    "/** One `### Heading` block of a release entry. */\n" +
    "export interface Section {\n" +
    "  heading: string;\n" +
    "  /** Prose before the first bullet, where the entry has any. */\n" +
    "  lead: string;\n" +
    "  /** Bullets, each still carrying inline markdown for `lib/inline-markdown.tsx`. */\n" +
    "  items: readonly string[];\n" +
    "}\n\n" +
    "/** The version the app is running, shown in the footer on every route. */\n" +
    `export const VERSION = ${JSON.stringify(latest.version)};\n\n` +
    "/** The date that version reached production. */\n" +
    `export const RELEASED = ${JSON.stringify(latest.date)};\n\n` +
    "/** Every released version, newest first. */\n" +
    `export const RELEASES: readonly Release[] = ${JSON.stringify(releases, null, 2)};\n`;

  return { body, version: latest.version, date: latest.date, count: releases.length };
}

// Written only when run as a script, so the test can re-derive without touching the tree.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const { body, version, date, count } = generate();
  writeFileSync(resolve(root, "lib/version.ts"), body);
  console.log(`gen-version: ${version} (${date}), ${count} release(s) from CHANGELOG.md`);
}
