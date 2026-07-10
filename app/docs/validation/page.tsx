import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "@/lib/ork/import";
import { runFromDocument } from "@/lib/sim/run";
import { fmt } from "@/lib/display";

export const metadata: Metadata = {
  title: "Validation — Loft",
  description:
    "How Loft's accuracy is measured: against first-principles physics, and against the OpenRocket results stored in a design.",
};

// Computed at build time from the committed fixtures, so this page never drifts from the
// engine. A static export runs this in Node during `next build`.
async function fixtureRuns() {
  const out: { name: string; mape: number; rows: { label: string; stored: string; loft: string; pct: number; unit: string }[] }[] = [];
  for (const file of ["demo-single-deploy.ork", "demo-dual-deploy.ork"]) {
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", file)));
    const doc = await importOrk(bytes);
    const run = runFromDocument(doc);
    if (!run.validation) continue;
    out.push({
      name: doc.rocket.name,
      mape: run.validation.mape,
      rows: run.validation.comparisons.map((c) => ({
        label: c.label,
        stored: fmt(c.stored, c.unit === "" ? 2 : 1),
        loft: fmt(c.simulated, c.unit === "" ? 2 : 1),
        pct: c.pctError,
        unit: c.unit,
      })),
    });
  }
  return out;
}

export default async function Validation() {
  const runs = await fixtureRuns();
  return (
    <>
      <h2>Validation</h2>
      <p>
        Trust in a simulator comes from checkable outputs, not from who wrote it. Loft is validated
        two ways: against <strong>first-principles physics</strong>, and against{" "}
        <strong>OpenRocket&apos;s own stored results</strong>.
      </p>

      <h2>Against physics (the test suite)</h2>
      <p>
        The engine&apos;s core is checked in the test suite (<code>lib/**/*.test.ts</code>, run in
        CI on every change):
      </p>
      <ul>
        <li>
          A drag-free vacuum flight reproduces the closed-form burnout velocity and apogee to within
          a fraction of a percent — a direct check of the thrust, gravity, mass, and RK4 integration.
        </li>
        <li>
          Descent under a parachute converges to the analytic terminal velocity{" "}
          <code>√(2mg / ρ·C_d·A)</code>.
        </li>
        <li>
          A cone nose gives Barrowman&apos;s exact <code>C_Nα = 2</code> and centre of pressure at
          two-thirds of its length; a hollow tube&apos;s mass matches its geometry exactly.
        </li>
        <li>
          The standard atmosphere matches published sea-level and 11 km values; higher impulse
          monotonically raises apogee.
        </li>
      </ul>

      <h2>Against OpenRocket (the free oracle)</h2>
      <p>
        A <code>.ork</code> you simulated in OpenRocket carries OpenRocket&apos;s own stored flight
        results. When you import such a file, Loft flies it under the same stored launch conditions
        and diffs each metric — apogee, velocity, Mach, timings — reporting the signed error and the
        mean absolute percentage error (MAPE). That comparison appears right in the results, and the
        method is in <code>lib/validation/compare.ts</code>.
      </p>
      <p>
        The comparison is shown only when Loft flew the <em>complete</em> design. If the design
        includes something Loft simplifies — staging, pods, parallel boosters, or a fin type it
        can&apos;t model (tube fins) — the stored results describe a different flight than the one
        simulated, so the comparison is withheld rather than reported as a misleading error. (A
        motor cluster <em>is</em> simulated, as coaxial motors, so it still gets a comparison.) A
        single-stage, standard-fin design gives the honest, like-for-like check.
      </p>
      <blockquote>
        The honest oracle is <strong>your own design</strong>. The two bundled samples below ship
        with author-estimated stored figures (Loft can&apos;t run OpenRocket here), so their
        comparison is a <em>demonstration of the mechanism</em>, not an accuracy claim. Import a real
        file for a real check.
      </blockquote>

      <h2>Bundled sample comparisons</h2>
      <p>
        Computed at build time from the committed fixtures — these numbers are always current with
        the engine. &ldquo;Stored&rdquo; is the fixture&apos;s author-estimated figure; &ldquo;Loft&rdquo;
        is this engine&apos;s output.
      </p>
      {runs.map((r) => (
        <div key={r.name}>
          <h3>
            {r.name} — mean abs. error {fmt(r.mape, 0)}%
          </h3>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Stored (est.)</th>
                <th>Loft</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>
                    {row.stored} {row.unit}
                  </td>
                  <td>
                    {row.loft} {row.unit}
                  </td>
                  <td>
                    {row.pct >= 0 ? "+" : ""}
                    {fmt(row.pct, 0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <h2>Cross-checks against real OpenRocket files</h2>
      <p>
        Beyond the bundled samples, Loft has been run against genuine OpenRocket files (which
        carry real stored results, including OpenRocket&apos;s own per-step drag coefficient). One
        you can reproduce yourself: open OpenRocket&apos;s own bundled example{" "}
        <em>&ldquo;A simple model rocket&rdquo;</em> (v24.12) and import it here. On its coast, Loft
        now reproduces OpenRocket&apos;s total drag coefficient almost exactly (Cd ≈ 0.855, split
        friction/pressure/base within a few percent each), after Loft was taught to read the fins&apos;
        square edge cross-section and count its leading-edge stagnation and trailing-edge base
        pressure drag. Across the A8, B4, and C6 configurations the fast <strong>C6 flights land
        within ~8%</strong>; the low-thrust <strong>A8 (~+18%) and B4 (~+35%)</strong> read higher.
        Those two are motor-<em>data</em> differences, not the aerodynamics — Loft flies the A8 on
        the NAR-certified curve (a realistic ~72&nbsp;s specific impulse and Estes&apos; published
        loaded mass), which delivers a little more than OpenRocket&apos;s bundled A8, and its B4
        curve likewise differs; the shared drag model fits all three. The direction is conservative
        for altitude: Loft reads a little high. To reproduce: import the file, pick each
        simulation&apos;s configuration, and read the OpenRocket-vs-Loft panel. (The file isn&apos;t
        bundled — it ships with OpenRocket, which is GPL.)
      </p>

      <h2>Motor curves vs certification</h2>
      <p>
        Every bundled thrust curve is authentic ThrustCurve.org data. As a standing check, each
        curve&apos;s integrated total impulse is compared against the motor&apos;s ThrustCurve
        certified value, and the published curve closest to certification is the one bundled: all of
        the sixty-plus curves land within about 8% (most within 2%). The one exception is the
        AeroTech F50T, whose only published RASP curve integrates ~11% below its certified total
        impulse — it under-states (the conservative direction for altitude), and no closer curve is
        published to bundle in its place. Thrust-vs-time is factual test-stand data, so this is a
        data-provenance check, not a tuning knob.
      </p>

      <h2>Community validation cases</h2>
      <p>
        The most valuable record is predicted-vs-<em>actual</em>: Loft&apos;s prediction against a
        real recorded flight (an altimeter apogee, a tracked descent). If you&apos;ve flown a design
        you&apos;re willing to share, open an{" "}
        <a href="https://github.com/nrdptel/fusionspace-loft/issues" target="_blank" rel="noopener noreferrer">
          issue
        </a>{" "}
        with the <code>.ork</code>, the motor, and the measured result — verified cases will be
        collected here as an ongoing accuracy record. Until then, this page is honest about being
        early.
      </p>
      <p>
        See also the <Link href="/docs/limitations">limitations log</Link> for where to expect the
        largest differences.
      </p>
    </>
  );
}
