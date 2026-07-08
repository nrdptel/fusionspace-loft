import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Docs — Loft",
  description:
    "How Loft's flight simulator works, its documented limitations, and how its accuracy is validated.",
};

export default function DocsOverview() {
  return (
    <>
      <h2>What Loft is</h2>
      <p>
        Loft imports an OpenRocket <code>.ork</code> design and simulates its flight in your
        browser: apogee, velocity and Mach, stability margin, rail-exit speed, and recovery
        descent and drift. It runs entirely client-side — your design is never uploaded — and
        works offline once loaded.
      </p>
      <p>
        Every number is an <strong>estimate from a model</strong>, not a measurement, and never a
        go/no-go verdict. The point of these docs is to make the model checkable: what each figure
        is computed from, where the model is known to be weak, and how far its output sits from
        OpenRocket&apos;s.
      </p>

      <h2>The three pages that matter</h2>
      <ul>
        <li>
          <Link href="/docs/methods">Methods</Link> — every calculation linked to its published
          source: Barrowman stability, the drag buildup, the standard atmosphere, the motor and
          mass models, and the integrator.
        </li>
        <li>
          <Link href="/docs/limitations">Limitations log</Link> — a candid, dated record of where
          the model is simplified or unvalidated. This is the most honest thing here.
        </li>
        <li>
          <Link href="/docs/validation">Validation</Link> — how Loft is checked: against
          first-principles physics, and against the OpenRocket results stored in a design.
        </li>
      </ul>
      <p>
        There is also a plain <Link href="/docs/faq">FAQ</Link> for the common questions.
      </p>

      <h2>Safety posture</h2>
      <p>
        Loft follows the same rule as the rest of Fusion Space: surface the numbers honestly and
        let the flyer and the RSO decide. It shows stability margin, rail-exit velocity, apogee,
        and descent and drift, and it <strong>warns when a flight leaves the validated envelope</strong>{" "}
        (transonic/supersonic, marginal stability, low rail exit) — but it never tells you whether
        to fly. The motor&apos;s printed data and the range safety officer are always authoritative.
      </p>

      <h2>Keeping these docs current</h2>
      <p>
        These are living, author-maintained docs, versioned with the code. The project&apos;s rule:
        any change that adds or alters a calculation updates the Methods page and the Limitations
        log in the same change, and new validation runs feed the Validation page. If the docs and
        the code ever disagree, that&apos;s a bug — please{" "}
        <a href="https://github.com/nrdptel/fusionspace-loft/issues" target="_blank" rel="noopener noreferrer">
          report it
        </a>
        .
      </p>
    </>
  );
}
