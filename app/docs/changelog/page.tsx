import type { Metadata } from "next";
import { DocsH2 } from "@/components/DocsHeading";
import Link from "next/link";

import { RELEASES } from "@/lib/version";
import { inlineMarkdown } from "@/lib/inline-markdown";
import { CHANGELOG_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Changelog — Loft",
  description: "What changed in Loft, release by release.",
};

/** What changed, release by release — P5's "a visible changelog … the flyer can see in the UI".
 *
 *  **Rendered from the same module the footer's version string comes from**, which is generated from
 *  `CHANGELOG.md` and refuses to build when it disagrees with `package.json`. So the page, the
 *  version in the chrome and the file in the repository cannot drift: there is one source and two
 *  readers. A hand-written TSX changelog beside a markdown one would have been two sources telling a
 *  flyer two things, which is the failure this whole milestone is about.
 *
 *  The date is a `<time>` with a machine-readable `dateTime`, because "2026-08-03" read aloud is not
 *  a date and this is the one page where a reader is scanning for when something happened. */
export default function Changelog() {
  return (
    <>
      <DocsH2>Changelog</DocsH2>
      <p>
        What changed in Loft, newest first. The version in the footer of every page is the one this
        list describes — the build asserts it rather than trusting anyone to keep them in step. The
        same notes live in{" "}
        <a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer">
          <code>CHANGELOG.md</code>
        </a>{" "}
        in the repository, which is where this page is generated from.
      </p>
      <p>
        Loft is pre-1.0: the minor number moves when a flyer can do something new, the patch number
        when something they could already do got better or was fixed. What is still missing is kept in
        the open too — see the <Link href="/docs/limitations">limitations log</Link>.
      </p>

      {RELEASES.map((r) => (
        <section key={r.version}>
          <h3>
            {r.version}{" "}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">
              — <time dateTime={r.date}>{r.date}</time>
            </span>
          </h3>
          {r.sections.map((s, i) => (
            <div key={s.heading || `lead-${i}`}>
              {s.heading && <h4>{s.heading}</h4>}
              {s.lead && <p>{inlineMarkdown(s.lead, `${r.version}-${i}-lead-`)}</p>}
              {s.items.length > 0 && (
                <ul>
                  {s.items.map((item, j) => (
                    <li key={j}>{inlineMarkdown(item, `${r.version}-${i}-${j}-`)}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
