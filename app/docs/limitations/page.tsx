import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Limitations log — Loft",
  description:
    "A candid, running record of where Loft's model is simplified, approximate, or unvalidated.",
};

export default function Limitations() {
  return (
    <>
      <h2>Limitations log</h2>
      <p>
        A candid record of where the model is weak. Admitting this earns more trust than claiming
        precision — and it&apos;s the honest thing to do for a tool people fly on. Entries are dated;
        the list grows and shrinks as the model changes. If you hit a limitation that isn&apos;t
        here,{" "}
        <a href="https://github.com/nrdptel/fusionspace-loft/issues" target="_blank" rel="noopener noreferrer">
          please add it
        </a>
        .
      </p>

      <h2>Known limitations (2026-07)</h2>

      <h3>Flight dynamics are 3-DOF, not 6-DOF</h3>
      <p>
        The solver integrates translational motion in the vertical plane with thrust and drag along
        the flight path. It does <strong>not</strong> model rotation: no weathercocking, no
        wind-induced angle of attack, no pitch/yaw damping, no coning or rod-whip. Consequences:
        boost-phase turning into wind is approximate, and wind &ldquo;drift&rdquo; during boost is
        under-modelled. Apogee, max velocity/Mach, rail-exit speed, and descent are the reliable
        outputs; horizontal drift is dominated by the (well-modelled) descent under canopy.
      </p>

      <h3>Drag is the largest error source</h3>
      <p>
        The subsonic drag buildup is defensible but simplified: fin pressure drag follows the
        fins&apos; edge cross-section (square / rounded / airfoil), and both a diameter-increasing
        transition (shoulder) and a diameter-decreasing one (boattail) now carry their own pressure
        drag on top of the boattail&apos;s base-area effect, and a cone or blunt nose carries its
        own joint-angle pressure drag (near zero for the streamlined ogive noses most designs use).
        Fin-junction interference is still lumped into a small flat allowance. The boundary layer is treated as <em>fully turbulent</em> — the standard rocketry
        assumption, since it trips near the nose — so there is no laminar run to solve (and no
        laminar-drag credit for an unusually smooth, slow flight). Base drag is applied in full
        whether the motor is burning or not — matching OpenRocket&apos;s stored per-step drag, which
        carries the full base drag throughout boost — rather than the blanket thrust-phase discount
        an earlier model used, which under-dragged a wide body flying a small motor severalfold (the
        exhaust fills only a little of a large base). Measured against OpenRocket&apos;s own
        &ldquo;A simple model rocket&rdquo; example (which stores its per-step drag), Loft reproduces
        the drag coefficient closely across the whole flight — friction, pressure, and base each
        within a few percent, boosting and coasting. On that example the C6 flight now lands about
        +6% high; the A8 (~+17%) and B4 (~+33%) read higher, but that gap is a motor-<em>data</em>{" "}
        difference, not the aerodynamics — Loft flies both on authentic certified thrust curves that
        deliver a little more than OpenRocket&apos;s bundled A8/B4, while the shared drag matches
        OpenRocket&apos;s stored coefficient to within about a percent. Across the wider corpus most
        designs now land within a few percent of OpenRocket, and the residual runs in both
        directions rather than the consistent over-prediction the earlier base-drag discount used to
        produce — a transonic design can read a few percent low, where the wave-drag estimate is
        roughest. Always compare against your own design&apos;s stored OpenRocket numbers on the{" "}
        <Link href="/docs/validation">Validation</Link>{" "}
        page.
      </p>

      <h3>Transonic and supersonic drag are approximate</h3>
      <p>
        Above about Mach 0.8 the drag model leaves its validated envelope. It follows the
        correct <em>shape</em> — a transonic drag rise to a peak near Mach 1.15, then a supersonic
        decline — with base drag switching to its supersonic form, rather than the earlier model
        whose drag grew without bound (badly over-stating drag, and under-stating apogee, for fast
        flights). The peak now responds to geometry — the nose&apos;s fineness and contour (a Von
        Kármán ogive lowest, a blunt cone highest) and the fins&apos; thickness and leading-edge
        sweep — so changing a nose or fin for a Mach shot moves the wave drag the right way. But it
        remains a bounded parametric estimate, not a per-geometry wave-drag solution: there is no
        shock/CFD model and no shape-specific supersonic pressure distribution, and the drag-rise
        Mach is fixed rather than derived. Note too that at low supersonic speeds a nose&apos;s wave
        drag is only part of the story — its wetted area and mass matter as much — so the fastest,
        highest flight isn&apos;t always the lowest-wave-drag nose. Any flight above Mach 0.8 is
        flagged <em>extrapolated</em>; treat apogee and max velocity for fast flights as rough, and
        expect the largest differences here.
      </p>

      <h3>Mass of curved shells is approximated</h3>
      <p>
        Nose-cone and transition <em>shell</em> mass (a wall of given thickness) is computed by
        subtracting an inward-offset inner contour — a good approximation, not an exact offset
        surface. For designs that rely on it, prefer an explicit component mass override. Fin fillets
        and micro-hardware are not massed individually.
      </p>

      <h3>Fin planforms beyond trapezoidal are partly reduced</h3>
      <p>
        An elliptical fin&apos;s centre of pressure is now computed exactly for its planform — the
        Barrowman quarter-chord aerodynamic centre integrated over the elliptical chord gives{" "}
        <code>(½ − 2/3π)·c<sub>root</sub> ≈ 0.288·c<sub>root</sub></code> from the root leading edge,
        which an independent 6-DOF engine (RocketPy) agrees with to within 0.01 caliber of static
        margin. Its <em>mass</em> CG is likewise exact — a half-ellipse is symmetric about its
        mid-chord, so its area centroid is <code>0.5·c<sub>root</sub></code>. Only the elliptical
        fin&apos;s normal-force slope still comes from an area- and span-equivalent trapezoid. A
        freeform fin&apos;s <em>centre of pressure</em> is now computed exactly from its actual
        outline — the Barrowman strip-theory quarter-chord centroid{" "}
        <code>x̄ = ∫(x<sub>LE</sub> + ¼c)·c dy / ∫c dy</code> over the polygon, which reduces to the
        trapezoid formula for a trapezoidal outline and to <code>0.288·c<sub>root</sub></code> for an
        elliptical one — so an odd planform is no longer flattened to an equal-area trapezoid for
        stability. It is computed at import and is span-scale invariant, so it stays valid when a
        geometry edit stretches the fin. Still reduced for a freeform fin: its normal-force slope
        (the equal-area trapezoid) and its mass CG (a mid-planform estimate — no closed-form area
        centroid for an arbitrary outline). Tube fins are not yet modelled — a design that uses them
        is flown without those fins (with a visible warning), and because that isn&apos;t the whole
        vehicle, its OpenRocket comparison is withheld.
      </p>

      <h3>Serial staging is simulated; parallel and strap-on staging isn&apos;t</h3>
      <p>
        In-line (serial) multi-stage flights are simulated: the booster lights at launch, each
        stage above air-starts when the one below burns out (plus any ignition delay for a boosted
        coast), and the spent stage separates and drops away — its structure and empty casing leave
        the flight, so mass and drag step down and the sustainer climbs on its own. What is
        <em>not</em> tracked is the separated stage&apos;s own descent: only the sustainer is flown
        to the ground, so a booster&apos;s drift and landing aren&apos;t reported. Parallel
        (strap-on) stages and pods are still not simulated; a design that contains them is imported
        with a visible warning and its{" "}
        <Link href="/docs/validation">OpenRocket-vs-Loft comparison</Link> is withheld, since the
        flown vehicle then differs from what the design&apos;s stored results describe. Stability is
        evaluated for the attached stack <em>and</em> for the sustainer alone after separation (a
        stage can be stable in the stack yet unstable flying solo), but it is still a static-margin
        estimate, not a 6-DOF turning solve.
      </p>

      <h3>Motor clusters are modelled coaxially</h3>
      <p>
        A motor cluster is simulated as its full complement of identical motors — an
        OpenRocket &ldquo;4-ring,&rdquo; for example, flies four motors, with the thrust,
        propellant, and motor-tube mass all counted. They are placed on the centreline rather than
        at their true radial offsets: for the vertical-plane apogee, velocity, and mass this makes
        no difference, but the roll/pitch inertia contribution of the offset motors isn&apos;t
        modelled (and rotation isn&apos;t solved anyway — see above). Within a single cluster the
        motors always light together — a staggered ignition or a partial-cluster failure across the
        identical motors of one mount isn&apos;t modelled. (A motor on a <em>separate</em> mount with
        its own ignition delay <em>is</em> air-started at that delay; see the air-start note below.)
      </p>

      <h3>Air-start ignition is timed but not event-triggered</h3>
      <p>
        A second motor on its own mount can be timed to air-start after an <em>ignition delay</em>,
        and Loft honours that delay (read from the flown configuration), so within-stage air-start
        studies fly with the right timing rather than lighting everything at launch. What is
        <em> not</em> yet modelled is an air-start keyed to a flight <em>event</em> other than a
        fixed delay — for example ignition at a target altitude or triggered by an accelerometer.
        Such a motor is treated as its delay-from-activation, which is exact when the design uses a
        plain delay and an approximation otherwise.
      </p>

      <h3>Wind model</h3>
      <p>
        Wind is a steady surface value, or an interpolated winds-aloft profile with the live-weather
        re-run. There is no turbulence, gust, or shear-layer modelling, and no correlation with the
        (un-modelled) rotational response.
      </p>

      <h3>Recovery deployment is idealised</h3>
      <p>
        A device deploys on its event and honours its deploy delay — the vehicle free-falls on body
        drag until the canopy opens — but the canopy is then modelled as opening{" "}
        <em>instantly</em> to its full drag area: there is no inflation transient, no opening-shock
        load, and no reefing. A motor-ejection deployment fires at the motor&apos;s actual ejection
        charge (burnout plus the design&apos;s delay), so a mistimed delay shows up honestly — an
        early, still-ascending deployment (flagged, since it can zipper or shred), or a late one that
        opens at speed after a free-fall, or a delay so long the charge would fire after the rocket
        is already down (flagged as a ballistic descent). The deployment velocity Loft reports is the
        speed at canopy open, which sets the opening-shock severity — but the shock force itself is
        not computed. Where no ejection charge is modelled for the motor, an ejection-triggered
        device falls back to deploying at apogee. The steady descent rate is compared against the
        ~3–6 m/s most designs aim for, and a firm or hard landing under an undersized canopy is
        flagged — but that check is on descent <em>rate</em> alone; it doesn&apos;t weigh the
        airframe&apos;s mass or fragility, so treat it as a prompt to check your recovery sizing, not
        a verdict.
      </p>

      <h3>Override-subcomponents (resolved for mass)</h3>
      <p>
        A component&apos;s own mass/CG override is honoured, and OpenRocket&apos;s &ldquo;override
        mass of all subcomponents&rdquo; flag is now applied too: when a section states a measured
        mass for its whole assembly, that figure stands in for the section <em>and everything
        inside it</em>, so the internals are no longer added on top (the old behaviour
        double-counted them, inflating dry mass and shifting the CG). The lumped mass sits at the
        overriding component&apos;s CG, matching OpenRocket, and the outermost override wins over any
        nested one. Still partial: a subcomponents override of <em>CG alone</em> (with no mass
        override) isn&apos;t propagated to the subtree, and the lumped assembly&apos;s rotational
        inertia is the overriding component&apos;s own — immaterial to the 3-DOF flight, which uses
        mass and CG.
      </p>

      <h3>Under-specified airframe diameters are inferred</h3>
      <p>
        When a design leaves its whole airframe at <code>auto</code> radius with no dimensioned
        section for the tubes to inherit from — anchored only by, say, a boat-tail end or an
        internal part — Loft sizes the airframe to the rocket&apos;s largest known radius rather than
        flying it as a zero-diameter needle. That keeps drag, mass, and stability self-consistent,
        but the inferred diameter is a best guess: an import warning names it, and you should
        confirm the airframe diameters against the design before trusting apogee or velocity. At the
        other extreme, an <em>implausibly large</em> diameter — a unit error (millimetres entered as
        metres) or a corrupt file — is refused outright rather than flown: the enormous reference
        area would otherwise send the fixed-step solver divergent and report a nonsensical altitude,
        so Loft stops with a clear message asking you to check the dimensions instead.
      </p>

      <h3>Motor database is a curated subset</h3>
      <p>
        The bundled database covers a representative set of common motors across classes A–N —
        the common Estes/Quest low-power motors, AeroTech F–N single-use and reload motors, and
        mid-to-high-power Cesaroni, Loki and Animal Motor Works G–N reloads, up to the 98&nbsp;mm
        Cesaroni and AeroTech N-class research motors — but not the entire ThrustCurve.org catalogue
        (that would bloat the offline bundle). Every curve is authentic ThrustCurve.org data,
        matched to its published certified total impulse. If your motor isn&apos;t found, Loft says
        so rather than guessing; fuzzy matching by class-and-thrust core can, in rare cases, match a
        same-core motor of a different propellant. The resolved designation is always shown so you
        can check it. Genuinely custom or experimental motors — an amateur or research motor with no
        published certification data — have no curve to bundle, so they stay unresolved rather than
        being matched to an unrelated maker&apos;s motor of the same class. When <em>no</em> motor in a configuration resolves, there
        is no thrust to fly — Loft withholds the flight results, plots, and OpenRocket comparison
        entirely and names the motor it couldn&apos;t find, rather than showing a misleading
        zero-altitude &ldquo;flight.&rdquo; When a configuration resolves only <em>some</em> of its
        motors (for example a design with different motors in separate mounts), the flight is
        simulated on those alone — so its thrust is under-counted and apogee and velocity read low —
        and a prominent warning says how many motors were missing.
      </p>

      <h3>RockSim import is a common-subset adapter</h3>
      <p>
        RockSim <code>.rkt</code> files import through the same internal model as OpenRocket, so the
        flight is computed identically. The adapter covers the parts real designs use — nose cones,
        body and inner tubes, transitions, trapezoidal fin sets, rings and couplers, mass objects,
        recovery devices, launch lugs — and reads the motor(s) and stored results from each RockSim
        <em>simulation</em>. What it does <strong>not</strong> yet cover: tube fins and ring tails
        (flown without them, with a warning), pods and sub-assemblies (only the primary stack flies),
        and elliptical/custom RockSim fin shapes (treated as their trapezoidal equivalent). A
        RockSim design tree also doesn&apos;t pin a recovery device&apos;s deploy event the way
        OpenRocket does, so an imported chute defaults to apogee deployment. Unlike an{" "}
        <code>.ork</code>, a <code>.rkt</code> carries RockSim&apos;s own per-part masses; Loft flies
        those directly (see <Link href="/docs/methods">Methods</Link>), so component CG comes from
        geometry while total mass is exactly as the file states.
      </p>

      <h3>Bundled sample designs use estimated stored figures</h3>
      <p>
        The bundled example designs (two <code>.ork</code> files and one RockSim <code>.rkt</code>)
        ship with author-estimated stored results, not genuine OpenRocket or RockSim runs (Loft
        can&apos;t generate those here). The bundled &ldquo;design tool vs Loft&rdquo; comparison is
        therefore a demonstration; a real comparison uses your own file. See{" "}
        <Link href="/docs/validation">Validation</Link>.
      </p>

      <h2>Changing this list</h2>
      <p>
        Project rule: any change that adds or alters a calculation updates this log in the same
        change. When a limitation is fixed, its entry moves to a &ldquo;resolved&rdquo; note rather
        than quietly disappearing.
      </p>
    </>
  );
}
