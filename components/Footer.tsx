import Link from "next/link";
import { TOUCH_TARGET } from "@/lib/ui-tokens";
import { REPO_URL, SIBLING_TOOLS, THRUSTCURVE_URL, OPENROCKET_URL } from "@/lib/links";
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
    <footer className="mt-20 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 md:mt-28">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
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
          title="Fusion Space — free, polished tools for high-power rocketry"
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
            <span aria-hidden className="opacity-0 transition group-hover:opacity-100">
              ↗
            </span>
          </span>
        </a>
      </div>
      <p className="mt-5 max-w-3xl leading-relaxed text-zinc-500 dark:text-zinc-400">
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
        <div className="mt-5 space-y-1 text-xs">
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
