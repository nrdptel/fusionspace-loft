import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** **The shared span of `DESIGN.md`, held against the sibling repo's copy by a digest.**
 *
 *  `DESIGN.md` §10 says divergence is a bug in whichever app diverged and that the fix lands in both
 *  repos in the same run. That was a rule with nothing behind it: measured 2026-08-09 with both repos
 *  attached in one session for the first time in a week, the two copies were **12 diff hunks apart**,
 *  753 lines against 834, and the drift ran in BOTH directions — so neither could be pasted over the
 *  other, and nothing in either gate could tell.
 *
 *  This computes a SHA-256 over the sections that are shared BY NATURE and compares it to a constant
 *  committed in both repos. Neither repo can read the other at test time — CI checks out one — so the
 *  constant is the channel: if both copies match the same digest, they match each other, and a change
 *  made to one and not the other fails that repo's gate on the next run.
 *
 *  **The span is deliberately narrow and can only grow.** §5 and §9 are out: the two apps genuinely
 *  ship different primitives and count different treatments — one repo deleted `Chip` on 2026-08-04
 *  and the other defines it — so demanding identity there would be demanding a lie, and a check that
 *  demands a lie gets deleted. §1, §2, §3 and §11 differ only in clauses one copy has taken and the
 *  other has not, so they are the next to join. Widening the span IS what reconciliation means here.
 *
 *  Whitespace at end of line is normalised and trailing blank lines are dropped, because an editor
 *  that strips them in one repo and not the other would fail this for no reason a reader could see.
 *  Nothing else is normalised: if the two copies disagree about a word, that is the finding. */

const ROOT = process.cwd();

/** The sections whose text both repos must carry identically. Grow this list; never shrink it. */
const SHARED_SECTIONS = [4, 6, 7, 8, 10];

/** The digest both repos commit. Changing a shared section means changing this in BOTH, in one
 *  change — which is the discipline the check exists to impose rather than an inconvenience.
 *
 *  Set 2026-08-09 over 11,084 bytes: §4 Spacing, §6 Presenting numbers, §7 Product shape,
 *  §8 Form factors, §10 Suite consistency. */
const SHARED_DIGEST = "3ec05348573b78ee74dd9b9b05c888941a3ed6c64070fd4a9b5e733f99ef45fd";

/** The named sections' text, in the order `SHARED_SECTIONS` gives, joined by a blank line. Reading
 *  headings rather than line numbers is what lets a section move within the file without failing. */
function sharedSpan(markdown: string): string {
  const lines = markdown.split("\n");
  const heads: Array<[number, number]> = [];
  lines.forEach((l, i) => {
    const m = /^## (\d+)\./.exec(l);
    if (m) heads.push([i, Number(m[1])]);
  });
  const parts: string[] = [];
  for (const n of SHARED_SECTIONS) {
    const at = heads.findIndex(([, num]) => num === n);
    if (at < 0) throw new Error(`DESIGN.md has no section ${n} — the shared span cannot be built`);
    const end = at + 1 < heads.length ? heads[at + 1][0] : lines.length;
    parts.push(
      lines
        .slice(heads[at][0], end)
        .map((s) => s.replace(/[ \t]+$/, ""))
        .join("\n")
        .replace(/\n+$/, ""),
    );
  }
  return parts.join("\n\n");
}

describe("DESIGN.md's shared span is the same document in both repos", () => {
  const design = readFileSync(join(ROOT, "DESIGN.md"), "utf8");

  it("carries every section the span names", () => {
    // A section renamed or renumbered would otherwise fail the digest with a message about a hash,
    // which says nothing about what went wrong.
    for (const n of SHARED_SECTIONS) {
      expect(design, `DESIGN.md lost section ${n}, which the shared span names`).toMatch(
        new RegExp(`^## ${n}\\.`, "m"),
      );
    }
  });

  it("hashes to the digest the sibling repo commits", () => {
    const span = sharedSpan(design);
    // The length is asserted too, because a digest mismatch alone cannot distinguish "one word
    // changed" from "a whole section went missing", and those want different responses.
    expect(span.length, "the shared span changed size — a section was added to or removed from it").toBe(11084);
    expect(
      createHash("sha256").update(span).digest("hex"),
      "DESIGN.md's shared span no longer matches the sibling repo's. Reconcile both copies and update " +
        "SHARED_DIGEST in BOTH, in one change — that is the rule §10 states and this check enforces.",
    ).toBe(SHARED_DIGEST);
  });
});
