import Link from "next/link";
import { TOUCH_TARGET } from "@/lib/ui-tokens";
import { REPO_URL, SIBLING_TOOLS, THRUSTCURVE_URL, OPENROCKET_URL, NEW_ISSUE_URL } from "@/lib/links";
import { VERSION, RELEASED } from "@/lib/version";
import { observancesForDate } from "@/lib/observances";

function Dot() {
  return (
    <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
      ·
    </span>
  );
}

export default function Footer() {
  const observances = observancesForDate();
  return (
    // The body default, not caption size. This footer carries the standing disclaimer that every
    // figure Loft shows is a model's estimate and never a go/no-go — the one sentence the safety
    // posture requires be visible — plus a row of nav links, which are controls. Both are body text
    // by the type scale, and setting them a step below it put the safety line in the fine print.
    //
    // The top margins are on §4's `1 2 3 4 6 8 12` scale, and are the same pair the sibling's footer
    // uses, so the two apps separate their footer by the same amount. They were two steps off the
    // scale entirely, and §9's spacing check could not see them: the grep listed a handful of
    // off-scale values to hunt for rather than enumerating the scale and subtracting it, so anything
    // outside that handful read as compliant. The old values are deliberately NOT written here —
    // that grep, and Tailwind's own source scan, cannot tell a mention from a use, so naming them
    // would both re-fail the check and regenerate the utilities.
    <footer className="mt-8 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 md:mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* The one region the hit-target passes never reached. These are `<nav>` links, not words in
            a sentence, so the "inline in a block of text" exemption does not cover them: measured on
            a 390x844 phone they were 16 px tall — GitHub 60x16, Docs 28x16, Motor Finder 71x16,
            Charge 40x16, Window 44x16 — five of the thirteen controls under target on the Flight
            workspace. The row keeps its own vertical rhythm on a pointer layout, like every other
            use of this token. */}
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 ${TOUCH_TARGET}`}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 fill-current">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <Dot />
          <Link href="/docs" className={`inline-flex items-center hover:text-zinc-800 dark:hover:text-zinc-200 ${TOUCH_TARGET}`}>
            Docs
          </Link>
          <Dot />
          {/* **The version a flyer is actually running, on every route.** P5's *done when* asks for a
              versioned release they can see, and a tool that shows no version cannot be told apart
              from a stale cached copy of itself — which matters more here than in most apps, because
              this one is installable and serves from a service worker. It sits in the nav row rather
              than in the disclaimer paragraph because it is a control: it goes to the changelog.

              `VERSION` is generated from `CHANGELOG.md` and checked against `package.json` at build
              time (`scripts/gen-version.mjs`), so this string cannot disagree with the release that
              describes it. The date is the accessible name rather than more visible text — the
              chrome height ratchet is 49 px from its cap and a second visible token here spends it
              on all six routes at once.

              An in-app route rather than the file on GitHub: the changelog is something a flyer
              reads about the tool they are holding, and sending them off-site to read it is the same
              shape as the bug-report link that only existed on the docs pages. `/docs/changelog`
              renders from the same generated module this version string comes from. */}
          <Link
            href="/docs/changelog"
            aria-label={`Version ${VERSION}, released ${RELEASED} — see what changed`}
            className={`inline-flex items-center font-medium tabular-nums hover:text-zinc-800 dark:hover:text-zinc-200 ${TOUCH_TARGET}`}
          >
            v{VERSION}
          </Link>
          <Dot />
          {/* **P5: a way to report a bug or ask for a format, from inside the app.** It existed only
              on three docs pages and the docs hub, so a flyer whose import went wrong on `/flight`
              had to find the documentation before they could say so — and the GitHub link beside
              this one goes to the repository root, where "open an issue" is three clicks and a
              scroll. This is the same row, on every route, aimed at the form itself.

              The accessible name says both jobs, because "Report a bug" would hide the one a flyer
              is most likely to want and least likely to guess is welcome: asking for a format Loft
              cannot read yet. Ingestion breadth is a North Star, and requests are how the queue
              gets its evidence.

              **The wording avoids every word on the navigation spine, and that is a constraint
              rather than a style choice.** The first version said "request a DESIGN format", and
              `getByRole("link", { name: "Design" })` matches accessible names by substring — so one
              footer link made the Design tab ambiguous on all six routes and took 100+ e2e cases
              down with a strict-mode violation. An accessible name is a selector as much as a
              sentence; a new one in shared chrome has to be checked against the nav's own. */}
          <a
            href={NEW_ISSUE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Report a bug, or ask for a rocket file format Loft cannot read yet (opens in a new tab)"
            className={`inline-flex items-center hover:text-zinc-800 dark:hover:text-zinc-200 ${TOUCH_TARGET}`}
          >
            Report a bug
          </a>
          {SIBLING_TOOLS.map((t) => (
            <span key={t.href} className="inline-flex items-center gap-4">
              <Dot />
              <a
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center hover:text-zinc-800 dark:hover:text-zinc-200 ${TOUCH_TARGET}`}
              >
                {t.name}
              </a>
            </span>
          ))}
        </nav>
        <a
          href="https://fusionspace.co"
          target="_blank"
          rel="noopener noreferrer"
          // The description the deleted `title` carried, on the accessible name instead — where
          // it reaches every form factor rather than a mouse only. Deleting the tooltip without
          // this would have LOST it: it survived nowhere else on any rendered surface, which is the
          // same test the Ko-fi link was held to two files away. The new-tab fact rides here too,
          // because the ↗ that states it visually is `aria-hidden`.
          aria-label="Fusion Space — free, polished tools for high-power rocketry (opens in a new tab)"
          className={`group inline-flex items-center gap-1.5 transition hover:opacity-80 ${TOUCH_TARGET}`}
        >
          <span>A</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/fusion-space-wordmark.svg"
            alt="Fusion Space"
            width={1598}
            height={281}
            className="h-5 w-auto"
          />
          <span>
            project{" "}
            {/* Always visible. It used to be revealed only on hover, which on a coarse pointer
                means never — no touch gesture brings it up — so the one mark saying this link leaves
                the site did not exist on a phone. It already occupied its box, so showing it changes
                no layout and spends nothing against the chrome height ratchet.

                The class literal is deliberately NOT written here. Tailwind v4 scans raw file text
                and cannot tell a mention from a use, so naming it in a comment about removing it
                would keep generating the very utility this deleted — the trap `lib/ui-tokens.ts` and
                the design-system ratchet both carry warnings about.

                `text-zinc-500` is §2's `tertiary` role. It is also what this glyph INHERITED from the
                footer before it carried a colour of its own; the first draft wrote `text-zinc-400`,
                which is 2.57:1 on white — under WCAG 1.4.11 — and would have made the mark this
                change exists to reveal the least readable thing in the chrome. */}
            <span aria-hidden className="text-zinc-500 dark:text-zinc-500">
              ↗
            </span>
          </span>
        </a>
      </div>
      <p className="mt-6 max-w-3xl leading-relaxed text-zinc-500 dark:text-zinc-400">
        <strong className="font-medium text-zinc-600 dark:text-zinc-300">
          Every figure Loft shows is an estimate from a model — not a measurement, and never a
          go/no-go verdict. Verify independently; the flyer and the RSO are responsible for the
          flight.
        </strong>{" "}
        Motor data is factual thrust-curve data via{" "}
        <a
          href={THRUSTCURVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          ThrustCurve.org
        </a>
        ; the{" "}
        <a
          href={OPENROCKET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          OpenRocket
        </a>{" "}
        format is read clean-room. Loft is not affiliated with either. Personal, non-commercial
        project — not affiliated with any rocketry vendor or manufacturer. Built for the hobby
        rocketry community.
      </p>
      {observances.length > 0 && (
        // The month's awareness note is the one genuinely incidental thing down here — it is neither
        // a control nor a claim about a flight — so it keeps caption size.
        <div className="mt-6 space-y-1 text-xs">
          {observances.map((o) => (
            <p key={o.id} className="text-zinc-500 dark:text-zinc-400">
              <span aria-hidden="true">{o.emoji}</span> {o.message}
              {o.href && (
                <>
                  {" "}
                  <a
                    href={o.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                  >
                    {o.hrefLabel ?? "Learn more"} →
                  </a>
                </>
              )}
            </p>
          ))}
        </div>
      )}
    </footer>
  );
}
