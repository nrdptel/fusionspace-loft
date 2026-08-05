import type { Metadata } from "next";
import Link from "next/link";
import { loadRocketpyReference, flyReferenceDesign, flyReferenceRecovery } from "@/lib/validation/rocketpy-reference";
import { fmt } from "@/lib/display";

export const metadata: Metadata = {
  title: "Validation — Loft",
  description:
    "How Loft's accuracy is measured: against first-principles physics, and against the OpenRocket results stored in a design.",
};

// The RocketPy REFERENCE set shown on this page: numbers committed in
// fixtures/rocketpy-cross-check.json, with the Loft column computed live at build time from the same
// fixtures — flown ballistically to match the way RocketPy flew them — so the gap on the page is
// always current with the engine. This is a static page, so RocketPy itself is not run here.
//
// It IS run in the browser, on the flyer's own design, by `lib/validation/rocketpy-engine.ts` under
// Pyodide on the Cross-check workspace. This comment used to say RocketPy is "not in the browser",
// which was true when the reference table was the only cross-check and became false when the second
// solver shipped — and the same sentence had reached the prose below it.
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
    const raw = [
      { label: "Apogee", unit: "m", rp: d.apogee, loft: s.apogee, dp: 0 },
      { label: "Max velocity", unit: "m/s", rp: d.maxVelocity, loft: s.maxVelocity, dp: 0 },
      { label: "Max Mach", unit: "", rp: d.maxMach, loft: s.maxMach, dp: 2 },
      { label: "Time to apogee", unit: "s", rp: d.timeToApogee, loft: s.timeToApogee, dp: 1 },
      { label: "Rail-exit velocity", unit: "m/s", rp: d.railExitVelocity, loft: s.railExitVelocity, dp: 1 },
      { label: "Static margin", unit: "cal", rp: d.staticMargin, loft: run.result.staticMarginCal, dp: 2 },
    ];
    // Descent cross-check rows for a design that carries recovery: both engines settle to terminal
    // under the same landing Cd·A, wind zeroed, so landing speed and energy check the descent side.
    if (d.landingSpeed !== undefined) {
      const rec = (await flyReferenceRecovery(d)).result.summary;
      raw.push(
        { label: "Landing speed", unit: "m/s", rp: d.landingSpeed, loft: rec.groundHitVelocity, dp: 1 },
        { label: "Landing energy", unit: "J", rp: d.landingEnergy ?? 0, loft: rec.landingEnergy, dp: 0 },
      );
    }
    const rows = raw.map((r) => ({ ...r, pct: r.rp ? ((r.loft - r.rp) / r.rp) * 100 : 0 }));
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
          A cone nose gives Barrowman&apos;s exact <code>C_Nα = 2</code>{" "}and centre of pressure at
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

      <h2>Against the file&apos;s own tool</h2>
      <p>
        A design file you already simulated carries that tool&apos;s own stored flight results — an{" "}
        <code>.ork</code>{" "}carries OpenRocket&apos;s, a <code>.rkt</code> RockSim&apos;s, a{" "}
        <code>.CDX1</code> RASAero&apos;s. When you import such a file, Loft flies it under the same
        stored launch conditions and diffs each metric — apogee, velocity, Mach, timings — reporting
        the signed error and the mean absolute percentage error (MAPE). That comparison appears right
        in the results, labelled with the tool that actually produced the numbers, and the method is
        in <code>lib/validation/compare.ts</code>.
      </p>
      <p>
        A file&apos;s stored runs are not all the tool&apos;s current answer, and the file says which
        is which. OpenRocket stamps each simulation with a status: <code>outdated</code>{" "}means the run
        predates the design&apos;s last edit, so it describes an earlier version of the rocket, and{" "}
        <code>notsimulated</code>{" "}means the figures are carried in the file for a simulation the tool
        does not consider run. Both are shown — they are still a reference point — but labelled, since
        calling either &ldquo;OpenRocket vs Loft&rdquo; would credit a current prediction to a tool
        that did not make one. This is not a rare edge: re-measured across the corpus in August 2026,
        <strong>8 of 79</strong> stored OpenRocket runs are outdated and <strong>7</strong> more are
        marked not simulated. The accuracy census below includes them, which is the honest picture
        rather than the flattering one; measured separately they agree with Loft{" "}
        <em>less</em>{" "}closely than the up-to-date runs, not equally — median apogee disagreement{" "}
        <strong>3.7%</strong> against <strong>2.0%</strong>. The previous text here said 3.3%
        against 2.1% and called them comparable, which understated the gap on exactly the runs this
        page flags.
      </p>
      <p>
        The comparison is shown only when Loft flew the <em>complete</em> design. If the design
        includes something Loft simplifies — pods, parallel boosters, a ring tail — the stored
        results describe a different flight than the one simulated, so the comparison is withheld
        rather than reported as a misleading error. (Serial staging, motor clusters, and tube fins{" "}
        <em>are</em> simulated, so those still get a comparison.) A single-stack design gives the
        honest, like-for-like check.
      </p>
      <p>
        Many <code>.ork</code>{" "}files store more than summary numbers — they carry OpenRocket&apos;s{" "}
        <em>per-step</em>{" "}flight log, the whole trajectory and drag coefficient it computed step by
        step. When that log is present, Loft overlays its own solver on it directly: altitude versus
        time, and — the interesting one — drag coefficient versus time through the ascent, Loft&apos;s
        curve against OpenRocket&apos;s. That drag curve is a genuinely <em>independent</em>{" "}per-step
        oracle from a different engine, not just an endpoint diff, so where the two curves sit apart
        you can see exactly when and where the drag models diverge, rather than inferring it from an
        apogee gap. A deployed parachute&apos;s coefficient (referenced to the body it runs into the
        tens) is left off the drag curve, which is about the airframe&apos;s own drag on the way up.
        The overlay is quantified too: Loft&apos;s ascent drag curve is interpolated onto each stored
        sample and the mean gap reported as a single figure (both a percentage and an absolute{" "}
        <code>C<sub>d</sub></code>), so &ldquo;the two engines&apos; drag agree to about X%&rdquo; is a
        number you can read, not an eyeball. The overlay appears in the results whenever an imported
        file carries the log and Loft flew the design as stored; the series and the agreement figure
        are built in <code>lib/validation/crosscheck.ts</code>.
      </p>
      <blockquote>
        The honest oracle is <strong>your own design</strong>. The two bundled samples below ship
        with author-estimated stored figures (Loft can&apos;t run OpenRocket here), so their
        comparison is a <em>demonstration of the mechanism</em>, not an accuracy claim. Import a real
        file for a real check.
      </blockquote>

      <h2>What the bundled samples do and don&apos;t tell you</h2>
      <p>
        The designs Loft ships as one-tap examples are <em>its own</em>. No OpenRocket run ever
        produced flight numbers for them, so they carry none: their files state the simulation and
        its launch conditions and nothing else, and the stored-results panel simply does not appear
        for a sample. It used to appear, against figures that had been written by hand to give the
        panel something to show — figures that did not even hold together, one claiming a
        2,250&nbsp;m apogee at the same 20.2&nbsp;s time-to-apogee at which Loft reaches
        2,940&nbsp;m, which no ballistic coast does. A demonstration is not worth a number that
        isn&apos;t true. <strong>Import your own simulated <code>.ork</code>{" "}or <code>.rkt</code></strong>{" "}
        and the comparison runs against the numbers your tool actually stored.
      </p>
      <p>
        The two validations on this page that <em>are</em> real are below and above: the{" "}
        <a href="#rocketpy">RocketPy cross-check</a>, which runs an independent engine over the same
        designs, and the corpus of real in-the-wild design files, each carrying its own tool&apos;s
        stored results — measured in the repository&apos;s corpus suite rather than here, because
        those files are other people&apos;s designs and aren&apos;t redistributed.
      </p>

      <h3>What the corpus says, metric by metric</h3>
      <p>
        Across the corpus — 35 design files from OpenRocket, RockSim and RASAero, carrying{" "}
        <strong>97 stored simulations</strong>{" "}that Loft flies completely — this is the median
        absolute disagreement with each file&apos;s own stored result. It includes the cases the
        suite excuses as known issues, so it is the honest picture rather than the flattering one.
      </p>
      <p>
        <strong>Each figure names the population it is measured over, and they are not the same.</strong>{" "}
        Only four of the ten reach all 97: a metric is compared where a file stores it, and the
        formats do not store the same set. Max Mach is{" "}
        <em>OpenRocket-only</em>{" "}— neither RockSim nor RASAero writes it — so reading it as a
        corpus-wide figure would credit Loft with an agreement two of the three tools were never
        asked about. This page used to print one &ldquo;97&rdquo; above the whole list.
      </p>
      <ul>
        <li>time to apogee <strong>1.5%</strong>{" "}(97), rail-exit velocity <strong>1.9%</strong>{" "}(94)</li>
        <li>max Mach <strong>2.0%</strong>{" "}(77, OpenRocket only), max velocity <strong>2.2%</strong>{" "}(97), optimum delay <strong>2.5%</strong>{" "}(84)</li>
        <li>apogee <strong>3.1%</strong>{" "}(97), max acceleration <strong>3.2%</strong>{" "}(94), flight time <strong>3.1%</strong>{" "}(82)</li>
        <li>ground-hit velocity <strong>1.3%</strong>{" "}(82), deployment velocity <strong>6.2%</strong>{" "}(81)</li>
      </ul>
      <p>
        <strong>Two of those are over flights that came down under a canopy.</strong>{" "}
        Ground-hit velocity and flight time are reported over the <strong>82</strong>{" "}
        stored runs that are not ballistic &mdash; <strong>70</strong>{" "}
        where the file states a recovery device came out, and 12 where it states nothing either way.
        Both formats record it: OpenRocket writes a{" "}
        <code>recoverydevicedeployment</code>{" "}event into the flight log it saves with each run, and
        RockSim records it per device. The other <strong>12</strong>{" "}
        came down with nothing out &mdash; one design in the corpus stores eleven plugged runs
        against four canopy ones &mdash; and they are worse, on their own line rather than averaged
        in: ground-hit velocity <strong>14.9%</strong>, flight time <strong>4.8%</strong>. A descent
        at 160 m/s and a descent at 9 m/s are different flights, and a median over both is a number
        about neither. <strong>
          The ballistic figure is the weakest number on this page
        </strong>, which is the point of separating it: Loft&apos;s no-recovery descent is where its
        drag model is furthest from a tool that has one, and pooling it with canopy descents hid
        that in both directions.
      </p>
      <p>
        <strong>
          Ground-hit velocity went 3.0% &rarr; 8.3% &rarr; 2.0% &rarr; 1.3%, and not one of those
          moves was the engine.
        </strong>{" "}
        All three were the same mistake found in three places: Loft&apos;s figure and the stored
        figure it was scored against were not always the same physical quantity, and nothing recorded
        which was which. Loft reports the <em>descent rate</em> &mdash; the vertical speed &mdash;
        because wind moves the speed over the ground without making the canopy any smaller, and the
        rules of thumb and the per-section landing energy a waiver is judged on are all descent
        rates.
      </p>
      <ul>
        <li>
          <strong>3.0% was two errors cancelling.</strong> Loft measured the total speed over the
          ground under a name that means the descent rate, and its own descent ran low; one design
          reads 14.5% low on descent rate but only 3.0% low once the wind term is added back.
          Reporting the honest figure took the census to 8.3%.
        </li>
        <li>
          <strong>RockSim stores the total.</strong> Its <code>VelocityAtLanding</code>{" "}
          is the magnitude of its own three components &mdash; verified on every stored simulation in the
          corpus &mdash; so reading the vertical component instead moved the RockSim median from
          25.7% to 21.9%.
        </li>
        <li>
          <strong>And OpenRocket changed its own convention.</strong> Files written by 23.09 or
          earlier store the air-relative speed, which under an open canopy is the descent rate; files
          written by 24.12 or later store the ground-frame total, drift included. That is read from
          OpenRocket&apos;s own source rather than inferred, and 64 of the corpus&apos;s 91 OpenRocket
          simulations are on the newer side. Comparing each file against the quantity its own version
          actually stored took the OpenRocket median from 7.8% to <strong>1.2%</strong>.
        </li>
        <li>
          <strong>And eleven of the comparisons were lawn darts.</strong> One RockSim design stores
          fifteen runs of the same rocket: four with its parachutes out, and eleven plugged, coming
          down ballistically at 83&ndash;162 m/s. The file marks which is which, per recovery device,
          and Loft was reading neither mark &mdash; so eleven no-recovery descents were being
          averaged into a figure describing canopy ones. Counting them separately took the canopy
          figure from 2.0% to <strong>1.3%</strong> and put the ballistic runs on the line above at
          14.9%.
        </li>
      </ul>
      <p>
        So <strong>1.3%</strong>{" "}
        is the first figure here that measures what it always claimed to:
        how far Loft&apos;s descent under a canopy is from the tool&apos;s, rather than how far a
        vertical speed is from a total one, or a lawn dart from a parachute. The remaining gap is
        Loft&apos;s own, and it is now the smallest number in the census rather than three times its
        worst.
      </p>
      <p>
        Deployment velocity looks like the outlier and mostly isn&apos;t: it is an{" "}
        <em>ill-conditioned</em> metric, not a badly modelled one. Near apogee the rocket is barely
        moving, so the opening speed is roughly <code>g</code> times however far past apogee the
        charge fires — and a tenth of a second of timing difference between two simulators is about
        1 m/s on a number whose whole value is a few m/s. Split by how slow the opening is, the{" "}
        <em>absolute</em> error barely moves while the percentage swings wildly: openings under
        5 m/s disagree by 23% but only <strong>0.5 m/s</strong>; openings over 15 m/s disagree by
        3.3% and <strong>0.9 m/s</strong>. Read it in m/s, not percent. The genuinely wrong
        deployment cases are elsewhere and are listed as known issues in the suite.
      </p>
      <p>
        <strong>Optimum delay is where two formats mean different things by the same word.</strong>{" "}
        OpenRocket stores the <em>free-coast</em>{" "}delay &mdash; the time from burnout to the apogee
        the rocket would have reached with nothing out &mdash; which is the number a flyer buys a
        motor against, and the one Loft reports. RockSim stores the delay of the run it actually
        flew: <code>TimeToApogee</code> minus <code>TimeToBurnout</code>, exact on every stored
        simulation in every RockSim file in the corpus. On a design whose canopy opens at burnout
        those are not the same flight. One corpus design stores four such runs at{" "}
        <strong>1.34 s</strong>, against Loft&apos;s free coast of about <strong>16 s</strong>{" "}
        &mdash; four census rows reading <strong>+1107%</strong> for a delay model that was not
        wrong. Comparing each file against its own convention takes those rows to{" "}
        <strong>&minus;21%</strong> and the worst optimum-delay disagreement anywhere in the corpus
        from 1107% to <strong>59%</strong>.
      </p>
      <p>
        <strong>
          The published median did not move, and that is worth saying rather than hiding.
        </strong>{" "}
        Four of optimum delay&apos;s 84 rows changed by a factor of eighteen and the median stayed at
        2.5% &mdash;
        which is what a median is for, and why it was the wrong instrument to catch this. The suite
        now asserts the <em>worst</em> optimum-delay row as well as the median, because a row
        comparing two different flights is a different defect from a metric that is simply off.
      </p>
      <p>
        <strong>Deployment velocity went 6.0% to 6.2%, and that is the honest direction.</strong>{" "}
        It was an OpenRocket-only figure standing in a cross-tool census: RockSim stores a deployment
        velocity too, in a tag it misspells as <code>VelocityAtDeplyment</code>, and Loft read none of
        it. Six more comparisons joined, and they disagree by more than the OpenRocket ones, so the
        published median rose while the measurement got better. Separately, OpenRocket&apos;s stored
        figure is the speed at the <em>last</em> device to open, where Loft reports the{" "}
        <em>fastest</em> &mdash; the opening shock a flyer sizes a shock cord against, which is
        deliberately not the smaller of the two. Comparing each against the event the file describes
        takes the OpenRocket median from 6.0% to <strong>5.6%</strong>.
      </p>
      <p>
        One stored run is a charge firing with nothing out &mdash; RockSim records about 234 m/s for
        it, where the same design&apos;s canopy runs store 10 to 33 &mdash; and Loft reports no
        deployment at all, correctly. It is counted on its own line rather than averaged in, the same
        treatment the ballistic descents get, because a &ldquo;deployment velocity&rdquo; for a flight
        with nothing deployed is not the same quantity.
      </p>
      <p>
        These figures are asserted, not just written down: the corpus suite recomputes the census on
        every run and fails if any metric drifts past what this page claims, so a change to the
        engine either keeps the numbers true or forces them to be updated. It is one-directional —
        getting better is always allowed, and the run prints the current figures.
      </p>

      <h2 id="rocketpy">Against RocketPy (an independent engine)</h2>
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
        <strong>trajectory integrator</strong>, the <strong>mass model</strong>, the{" "}
        <strong>off-the-rail velocity</strong>{" "}(the safety-relevant departure speed, resolved at
        the exact rod-length crossing), and — from RocketPy&apos;s own Barrowman solver — the{" "}
        <strong>centre of pressure</strong> and static margin. It is <em>not</em>{" "}an independent drag
        check; that is what OpenRocket&apos;s stored per-step drag (above) provides. The two oracles
        are complementary: RocketPy pins the flight mechanics, OpenRocket pins the drag.
      </p>
      <p>
        The descent is cross-checked the same way. For a design that carries recovery, both engines
        fly on to the ground under one equivalent canopy carrying the design&apos;s{" "}
        <strong>landing drag area</strong> (<code>C<sub>d</sub>·A</code> — every deployed device plus
        the body&apos;s own descent drag), with wind zeroed so the impact speed is the vertical
        terminal. Holding that drag area equal makes the <strong>landing speed</strong> and{" "}
        <strong>landing energy</strong> — the recovery-adequacy figures a flyer actually cares about
        — a clean check of the <strong>descent integrator</strong> and the{" "}
        <strong>burnout mass</strong>{" "}against an independent engine. The two agree to within about
        a tenth of a percent on every bundled design. (RocketPy also applies the airframe&apos;s drag
        curve on the way down, a sub-percent addition at a few m/s, so exact agreement isn&apos;t
        expected; the staged drogue-then-main sequence — which changes descent <em>time</em>{" "}but
        not the terminal speed — isn&apos;t replayed, so time-to-land is not compared.)
      </p>
      <p>
        The designs below span the geometry the centre-of-pressure model has to get right: a
        constant-radius airframe on trapezoidal fins, a transonic flight, and a design with a{" "}
        <strong>boattail</strong> and <strong>elliptical fins</strong> — the two Barrowman terms most
        easily gotten wrong. The two engines agree on the static margin of every one to within a few
        hundredths of a caliber.
      </p>
      <p>
        The ascent comparison is ballistic — recovery and wind removed on both sides — so the coast
        runs to the true apogee with nothing to confound the physics. The figures below are
        RocketPy&apos;s committed output (v{rpRef.engineVersion}), while the Loft column is computed
        live in this build — so the gap you see is always current with the engine. And unlike the
        author-estimated &ldquo;stored&rdquo; figures above, these RocketPy numbers are a genuine
        independent simulation.
      </p>
      <p>
        <strong>And you can run RocketPy on your own design, in your own browser.</strong>{" "}
        The{" "}
        <Link href="/validate" className="underline underline-offset-2">
          Cross-check workspace
        </Link>{" "}
        boots RocketPy under Pyodide and flies whatever you have imported, so the comparison below is
        a fixed reference set and the one on your design is live. Nothing leaves the browser. It is a
        large download the first time (about 40 MB of Python runtime) and takes a few seconds to
        start, which is why it loads only when asked for. <em>This paragraph replaces one that said
        RocketPy &ldquo;doesn&apos;t run in your browser&rdquo;</em> — true when the reference table
        was the only cross-check here, and untrue since the second solver shipped.
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
        coast-drag <em>rise</em>{" "}as the rocket slows toward apogee — where OpenRocket&apos;s Cd climbs
        to ~0.97 at a few m/s, Loft was earlier stuck near 0.85 (a ~13% under-count) but now lands
        within ~2%, having been corrected to a fully-turbulent boundary layer whose friction climbs
        at low Reynolds number rather than an inappropriate laminar branch. And the base drag now
        carries in full through boost (as OpenRocket&apos;s does), which had been discounted — a fix
        that most matters for a body much wider than its motor, where the exhaust fills little of the
        base. All five of the file&apos;s stored simulations now land within a few percent: the three{" "}
        <strong>C6 flights within ~1%</strong>, the <strong>B4 at +2.5%</strong>, and the
        low-impulse <strong>A8 at +4.5%</strong> (a 2&nbsp;m difference on a 50&nbsp;m flight, where a
        slow, near-drag-free A8 leaves little to model). Driving this file is itself what caught a
        mis-sourced B4 thrust curve: the bundled B4 had been an over-energetic data file
        (5.02&nbsp;N·s — just over the 5.0&nbsp;N·s ceiling that <em>defines</em> a B motor, averaging
        ~5&nbsp;N rather than 4), which flew the B4 ~26% high. It now uses the NAR-certified curve
        (4.30&nbsp;N·s, avg 4.2&nbsp;N, published on the{" "}
        <a href="https://www.thrustcurve.org/motors/Estes/B4/" target="_blank" rel="noopener noreferrer">
          ThrustCurve.org B4 page
        </a>
        ), and
        a unit test now pins every bundled Estes curve to its certified impulse so a wrong data file
        can&apos;t slip back in. The shared drag model fits all three motors. To reproduce: import the
        file, pick each simulation&apos;s configuration, and read the OpenRocket-vs-Loft panel. (The
        file isn&apos;t bundled — it ships with OpenRocket, which is GPL.)
      </p>
      <p>
        Driving more of OpenRocket&apos;s own example files the same way turned up two drag fixes.
        Its <em>rounded-fin</em> examples (the <em>&ldquo;deployable payload&rdquo;</em> and
        <em> &ldquo;3D-printable&rdquo;</em>{" "}designs) coasted ~18–20% draggier in Loft than in their
        stored curves, because a rounded fin leading edge was modelled as half a square one; a
        radiused edge in fact attaches the flow with no stagnation face, so its leading edge now
        carries only the compressibility term (like an airfoil), bringing those coasts to within
        ~4–9% of OpenRocket&apos;s Cd. And a design that models its fins as several separate one-fin
        sets (the <em>&ldquo;ARC payload&rdquo;</em> example: three sets, one fin each) had its fin
        frontal area — hence pressure drag — counted from a single set, reading ~14% low on total Cd;
        summing over sets brings it within ~4%. Both are reproducible by importing the file and
        reading the per-step panel; neither file is bundled (GPL).
      </p>
      <p>
        Taken together, that example set is a broad accuracy check. Across OpenRocket&apos;s nine
        bundled example designs — <strong>33 flight configurations</strong>{" "}spanning small A-class
        models through J-class high-power, single-stage through three-stage — Loft&apos;s{" "}
        <strong>apogee lands within 10% of OpenRocket&apos;s stored value on every configuration</strong>,
        and within 5% on most (median ~2%). Max velocity agrees just as closely (median ~2%, every
        flight within 10%), and rail-exit velocity typically to about 1%. Peak acceleration is within
        ~5% on most; the exceptions are a few very high-thrust motors whose brief thrust spike Loft&apos;s
        fixed-step integrator still slightly under-resolves (reading a little low) and one three-stage
        sustainer (a little high) — each a known, bounded residual rather than a drag or mass error,
        since apogee and velocity on those same flights agree. These are point-in-time figures you can
        reproduce by importing the files and reading the OpenRocket-vs-Loft panel; none is bundled
        (they ship with OpenRocket, which is GPL).
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
        curves are authentic ThrustCurve.org data), landing <strong>within ~1%</strong>{" "}of
        OpenRocket&apos;s stored figure. On the <em>&ldquo;Three stage low power rocket&rdquo;</em>{" "}
        Loft lands <strong>within ~4%</strong>{" "}of OpenRocket&apos;s apogee across all three
        configurations, reading a little low. Stability tracks too, now that the stages stack into one airframe:
        the loaded centre of gravity matches OpenRocket&apos;s stored value — <strong>1.33&nbsp;m vs
        1.33&nbsp;m</strong>{" "}on the two-stage, within ~3% on the three-stage — and the sustainer&apos;s
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
