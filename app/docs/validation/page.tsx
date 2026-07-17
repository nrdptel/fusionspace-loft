import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "@/lib/ork/import";
import { runFromDocument } from "@/lib/sim/run";
import { loadRocketpyReference, flyReferenceDesign } from "@/lib/validation/rocketpy-reference";
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

// The RocketPy cross-check, shown to users. RocketPy is Python and runs offline (not bundled, not
// in the browser); its numbers are committed in fixtures/rocketpy-cross-check.json. The Loft column
// here is computed live at build time from the same fixtures — flown ballistically to match the way
// RocketPy flew them — so the gap on the page is always current with the engine.
async function rocketpyRuns() {
  const ref = loadRocketpyReference();
  const runs: {
    key: string;
    name: string;
    config: string;
    maxAbsPct: number;
    rows: { label: string; unit: string; rp: number; loft: number; dp: number; pct: number }[];
  }[] = [];
  for (const d of ref.designs) {
    const run = await flyReferenceDesign(d);
    const s = run.result.summary;
    const rows = [
      { label: "Apogee", unit: "m", rp: d.apogee, loft: s.apogee, dp: 0 },
      { label: "Max velocity", unit: "m/s", rp: d.maxVelocity, loft: s.maxVelocity, dp: 0 },
      { label: "Max Mach", unit: "", rp: d.maxMach, loft: s.maxMach, dp: 2 },
      { label: "Time to apogee", unit: "s", rp: d.timeToApogee, loft: s.timeToApogee, dp: 1 },
      { label: "Static margin", unit: "cal", rp: d.staticMargin, loft: run.result.staticMarginCal, dp: 2 },
    ].map((r) => ({ ...r, pct: r.rp ? ((r.loft - r.rp) / r.rp) * 100 : 0 }));
    runs.push({
      key: d.key,
      name: d.name,
      config: d.config,
      maxAbsPct: Math.max(...rows.map((r) => Math.abs(r.pct))),
      rows,
    });
  }
  return { ref, runs };
}

export default async function Validation() {
  const runs = await fixtureRuns();
  const { ref: rpRef, runs: rpRuns } = await rocketpyRuns();
  return (
    <>
      <h2>Validation</h2>
      <p>
        Trust in a simulator comes from checkable outputs, not from who wrote it. Loft is validated
        three ways: against <strong>first-principles physics</strong>, against{" "}
        <strong>OpenRocket&apos;s own stored results</strong>, and against an{" "}
        <strong>independent flight simulator</strong> (RocketPy).
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
          two-thirds of its length; a hollow tube&apos;s mass matches its geometry exactly. A
          conical transition reproduces its hand-computed Barrowman normal force and CP — negative
          (destabilizing) for a boattail — and a point-to-radius transition recovers the cone-nose
          result exactly, cross-checking the two body terms against each other.
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

      <h2>Against RocketPy (an independent engine)</h2>
      <p>
        Loft is also cross-checked against{" "}
        <a href="https://github.com/RocketPy-Team/RocketPy" target="_blank" rel="noopener noreferrer">
          RocketPy
        </a>
        , a mature, open-source 6-DOF flight simulator independently validated against real recorded
        flights to within a few percent. It shares none of Loft&apos;s code. For each bundled design, RocketPy flies
        the same rocket and the two engines are compared metric by metric. RocketPy takes a drag
        coefficient rather than deriving it from the shape, so it is fed <em>Loft&apos;s own</em> drag
        curve.
      </p>
      <p>
        Because the drag is held equal, this is an independent check of the{" "}
        <strong>trajectory integrator</strong>, the <strong>mass model</strong>, and — from
        RocketPy&apos;s own Barrowman solver — the <strong>centre of pressure</strong> and static
        margin. It is <em>not</em> an independent drag check; that is what OpenRocket&apos;s stored
        per-step drag (above) provides. The two oracles are complementary: RocketPy pins the flight
        mechanics, OpenRocket pins the drag.
      </p>
      <p>
        The designs below span the geometry the centre-of-pressure model has to get right: a
        constant-radius airframe on trapezoidal fins, a transonic flight, and a design with a{" "}
        <strong>boattail</strong> and <strong>elliptical fins</strong> — the two Barrowman terms most
        easily gotten wrong. The two engines agree on the static margin of every one to within a few
        hundredths of a caliber.
      </p>
      <p>
        The comparison is ballistic — recovery and wind removed on both sides — so the coast runs to
        the true apogee with nothing to confound the physics. RocketPy is written in Python and runs{" "}
        <em>offline</em> (it isn&apos;t bundled and doesn&apos;t run in your browser); the figures
        below are its committed output (v{rpRef.engineVersion}), while the Loft column is computed
        live in this build — so the gap you see is always current with the engine. And unlike the
        author-estimated &ldquo;stored&rdquo; figures above, these RocketPy numbers are a genuine
        independent simulation.
      </p>
      {rpRuns.map((r) => (
        <div key={r.key}>
          <h3>
            {r.name} ({r.config}) — largest difference {fmt(r.maxAbsPct, 1)}%
          </h3>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>RocketPy</th>
                <th>Loft</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>
                    {fmt(row.rp, row.dp)} {row.unit}
                  </td>
                  <td>
                    {fmt(row.loft, row.dp)} {row.unit}
                  </td>
                  <td>
                    {row.pct >= 0.05 ? "+" : ""}
                    {fmt(row.pct, 1)}%
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
        now reproduces OpenRocket&apos;s total drag coefficient closely across the whole flight —
        boosting and coasting, friction/pressure/base each within a few percent (Cd ≈ 0.855 near
        burnout) — after Loft was taught to read the fins&apos; square edge cross-section and count
        its leading-edge stagnation and trailing-edge base pressure drag. It also tracks the
        coast-drag <em>rise</em> as the rocket slows toward apogee — where OpenRocket&apos;s Cd climbs
        to ~0.97 at a few m/s, Loft was earlier stuck near 0.85 (a ~13% under-count) but now lands
        within ~2%, having been corrected to a fully-turbulent boundary layer whose friction climbs
        at low Reynolds number rather than an inappropriate laminar branch. And the base drag now
        carries in full through boost (as OpenRocket&apos;s does), which had been discounted — a fix
        that most matters for a body much wider than its motor, where the exhaust fills little of the
        base. Across the A8, B4, and C6 configurations the fast <strong>C6 flights land within
        ~6%</strong>; the low-thrust <strong>A8 (~+17%) and B4 (~+33%)</strong> read higher. Those
        two are motor-<em>data</em> differences, not the aerodynamics — Loft flies the A8 on the
        NAR-certified curve (a realistic ~72&nbsp;s specific impulse and Estes&apos; published loaded
        mass), which delivers a little more than OpenRocket&apos;s bundled A8, and its B4 curve
        likewise differs; the shared drag model fits all three. To reproduce: import the file, pick
        each
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

      <h2>Staged flights</h2>
      <p>
        Serial staging is checked the same way — against OpenRocket&apos;s own stored results for
        its bundled multi-stage examples. On the <em>&ldquo;Two stage high power rocket&rdquo;</em>
        (a booster and sustainer, each on an AeroTech H148R, with a drogue at apogee and a main at
        152&nbsp;m), Loft reaches <strong>663&nbsp;m against OpenRocket&apos;s 675&nbsp;m
        (−2%)</strong>, with the burnout velocity matching to about 1% and the separation, drogue,
        and main all firing in the right order. That example&apos;s second configuration — a
        long-burn AeroTech I59WN booster staging to a fast I357T sustainer — now flies too (both
        curves are authentic ThrustCurve.org data), landing <strong>within ~1%</strong> of
        OpenRocket&apos;s stored figure. On the <em>&ldquo;Three stage low power rocket&rdquo;</em>{" "}
        Loft lands <strong>within ~4%</strong> of OpenRocket&apos;s apogee across all three
        configurations, reading a little low. Stability tracks too, now that the stages stack into one airframe:
        the loaded centre of gravity matches OpenRocket&apos;s stored value — <strong>1.33&nbsp;m vs
        1.33&nbsp;m</strong> on the two-stage, within ~3% on the three-stage — and the sustainer&apos;s
        own post-separation margin is reported and flagged if it falls below 1 cal. To reproduce,
        import either OpenRocket example (they ship with OpenRocket, which is GPL, so they
        aren&apos;t bundled here).
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
