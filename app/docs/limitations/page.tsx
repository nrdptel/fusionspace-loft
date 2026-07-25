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
        Fin-junction interference is still lumped into a small flat allowance. Skin friction is now
        summed surface by surface at each finish&apos;s own roughness rather than charging the whole
        airframe the roughest finish present — the old treatment over-dragged any mixed-finish build,
        which is most of them. The boundary layer is treated as <em>fully turbulent</em> — the standard rocketry
        assumption, since it trips near the nose — so there is no laminar run to solve (and no
        laminar-drag credit for an unusually smooth, slow flight). Base drag is applied in full
        whether the motor is burning or not — matching OpenRocket&apos;s stored per-step drag, which
        carries the full base drag throughout boost — rather than the blanket thrust-phase discount
        an earlier model used, which under-dragged a wide body flying a small motor severalfold (the
        exhaust fills only a little of a large base). Measured against OpenRocket&apos;s own
        &ldquo;A simple model rocket&rdquo; example (which stores its per-step drag), Loft reproduces
        the drag coefficient closely across the whole flight — friction, pressure, and base each
        within a few percent, boosting and coasting. On that example all five stored simulations now
        land within a few percent — the three C6 flights within ~1%, the B4 at +2.5%, and the
        low-impulse A8 at +4.5%. Driving this file is itself what caught a motor-<em>data</em> bug: the
        bundled B4 had been a mis-sourced, over-energetic curve (5.02&nbsp;N·s — over the 5.0&nbsp;N·s
        B-class ceiling), which flew the B4 ~26% high until it was replaced with the NAR-certified
        4.30&nbsp;N·s curve. The shared drag model matches OpenRocket&apos;s stored coefficient to
        within about a percent across all three motors. Across the wider corpus most
        designs now land within a few percent of OpenRocket, and the residual runs in both
        directions rather than the consistent over-prediction the earlier base-drag discount used to
        produce — a transonic design can read a few percent low, where the wave-drag estimate is
        roughest. The one shape whose residual is one-sided is a very <em>short, wide</em> body —
        a fineness ratio below about six, more a deliberate base-drag stunt than a typical airframe:
        its skin-friction form factor reads high, so Loft over-states that friction (about twofold on
        OpenRocket&apos;s own short-wide &ldquo;base drag hack&rdquo; example). A slender airframe —
        the usual case, and the one the corpus above validates — is unaffected. Always compare
        against your own design&apos;s stored OpenRocket numbers on the{" "}
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
        surface. Their <em>shoulders</em> (the collars that plug into the neighbouring tube) are now
        massed too — a real several-gram contribution on a small model that used to be dropped — as a
        tube of the shoulder&apos;s own wall plus a bulkhead when it is capped. Still not massed
        individually: fin fillets and micro-hardware. For designs that rely on an exact figure, prefer
        an explicit component mass override.
      </p>

      <h3>Fin planforms beyond trapezoidal are partly reduced</h3>
      <p>
        An elliptical fin&apos;s centre of pressure is now computed exactly for its planform — the
        Barrowman quarter-chord aerodynamic centre integrated over the elliptical chord gives{" "}
        <code>(½ − 2/3π)·c<sub>root</sub> ≈ 0.288·c<sub>root</sub></code> from the root leading edge,
        which an independent 6-DOF engine (RocketPy) agrees with to within 0.01 caliber of static
        margin. Its <em>mass</em> CG is likewise exact — a half-ellipse is symmetric about its
        mid-chord, so its area centroid is <code>0.5·c<sub>root</sub></code>. Its <em>drag</em> now
        reflects the leading edge&apos;s sweep too: the half-ellipse tip sits at mid-root-chord, so
        the edge sweeps back about half the root chord — previously treated as unswept, which
        over-counted its stagnation pressure drag by ~22% on a heavily-finned minimum-diameter design
        (measured against OpenRocket&apos;s stored per-step Cd). Only the elliptical fin&apos;s
        normal-force slope still comes from an area- and span-equivalent trapezoid. A
        freeform fin&apos;s <em>centre of pressure</em> is now computed exactly from its actual
        outline — the Barrowman strip-theory quarter-chord centroid{" "}
        <code>x̄ = ∫(x<sub>LE</sub> + ¼c)·c dy / ∫c dy</code> over the polygon, which reduces to the
        trapezoid formula for a trapezoidal outline and to <code>0.288·c<sub>root</sub></code> for an
        elliptical one — so an odd planform is no longer flattened to an equal-area trapezoid for
        stability. It is computed at import and is span-scale invariant, so it stays valid when a
        geometry edit stretches the fin. Still reduced for a freeform fin: its normal-force slope
        (the equal-area trapezoid) and its mass CG (a mid-planform estimate — no closed-form area
        centroid for an arbitrary outline).
      </p>

      <h3>Tube fins are modelled as ducts, and read ~1 caliber conservative</h3>
      <p>
        Tube fins are flown, not skipped. They are treated as what they are — short open cylinders
        the flow passes <em>through</em> — so they get a duct normal force{" "}
        <code>C<sub>Nα</sub> = 2·ΣN·πr<sub>i</sub>²/A<sub>ref</sub></code> at the tube mid-chord, plus
        friction on both walls and stagnation and base drag on the square-cut wall annulus at each
        end. Two independent oracles bound the result. On OpenRocket&apos;s own tube-fin example the
        apogee error falls from <strong>+88% to −8%</strong>, and Loft&apos;s centre of pressure lands{" "}
        <strong>≈0.9 caliber forward</strong> of the CP OpenRocket stores step by step (0.7 vs 1.6
        calibers of margin) — the conservative side, but a real residual, not a rounding difference.
        On RockSim&apos;s tube-fin file the apogee error falls from <strong>+87% to −2%</strong>, and
        the duct normal-force slope and mid-chord CP land within <strong>1%</strong> and{" "}
        <strong>2.6% of chord</strong> of the values that file itself stores for the same set. What
        is <em>not</em> modelled: tube-to-body and tube-to-tube interference drag, any lift the
        tubes carry as a ring wing beyond the captured streamtube, and the shielding of the airframe
        that sits inside them. Ring tails (a single large ring) are still skipped.
      </p>

      <h3>Fin flutter is an estimate, not a certification</h3>
      <p>
        The fin-flutter speed Loft reports is the simplified NACA TN 4197 closed form (see{" "}
        <Link href="/docs/methods">Methods</Link>). It is a preliminary-design figure, method-dependent
        to roughly ±20% — the fuller method, with a chordwise mass-balance term, tends to sit lower —
        and it assumes a uniform, isotropic fin of the design&apos;s stated material stiffness. A real
        fin&apos;s construction (tip-to-tip lamination, a spar, a bonded-on airfoil, grain direction
        in wood) changes its stiffness and so its true flutter speed. The shear modulus comes from
        matching the design&apos;s material name to a representative value, and G10 fibreglass is
        assumed (and labelled as such) when the material is missing or unrecognised. Loft therefore
        keeps a recommended margin and cautions when it is thin; it never reports a fin as
        flutter-safe. Treat it as a reason to add thickness or reduce span, not as a pass/fail. When
        the margin is thin Loft also names the thickness that would reach the recommended margin
        (a closed-form inverse of the same estimate, erring a touch thick) — but it inherits the
        estimate&apos;s ±20% method spread and its uniform-isotropic-fin assumption, so it is a
        starting point for a real structural design, not a substitute for one.
      </p>

      <h3>Serial staging is simulated; parallel and strap-on staging isn&apos;t</h3>
      <p>
        In-line (serial) multi-stage flights are simulated: the booster lights at launch, each
        stage above air-starts when the one below burns out (plus any ignition delay for a boosted
        coast), and the spent stage separates on the event the design specifies — at burnout or
        upper-stage ignition for ordinary staging, or at its own ejection charge for a
        payload/dual-section rocket that stays whole until near apogee, with the recovery deploying
        on that separation. That separation event is read <em>per motor configuration</em>: a design
        can drop its booster at staging on one motor set and hold it to an ejection charge on
        another, and each config now flies its own way (previously the per-config override was
        dropped, so a booster could ride a slow sustainer all the way to apogee — a large apogee
        error). Its structure and empty casing then leave the flight, so mass and drag step down and
        the sustainer climbs on its own. A separated stage&apos;s own descent is only partly
        modelled: solely the top stage is flown to the ground, so a booster&apos;s full trajectory
        and drift aren&apos;t integrated — but a spent lower stage that carries its <em>own</em>{" "}
        recovery now gets a terminal-velocity landing-speed (and landing-energy) estimate (from the
        mass that leaves at separation and its largest canopy), which raises a caution if that stage
        comes down firm and a warning if it lands hard enough to risk damage; and one that drops with <em>no</em> recovery is
        flagged as a ballistic, untracked range hazard rather than silently ignored. Still <em>not</em> modelled:
        the booster&apos;s downrange drift, and an <em>apogee</em>- or <em>altitude</em>-triggered
        separation, which falls back to the burnout default. Parallel
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

      <h3>Monte-Carlo dispersion propagates only the inputs you set</h3>
      <p>
        The dispersion tool jitters five inputs — motor total impulse, dry mass, aerodynamic drag,
        rail angle, and wind speed — around their nominal values and flies each sample through the
        same solver. Dispersing the drag coefficient matters because drag is the single largest error
        source, so its uncertainty (a scale on the zero-lift Cd, ±10% 1σ by default) belongs in the
        apogee band; without it the spread reads tighter than the physics warrants. It is still not a
        full uncertainty budget: thrust-curve <em>shape</em> variation (only the overall scale is
        varied), centre-of-gravity shift (the dry mass is scaled uniformly, so the CG holds), and
        ejection-timing scatter are not dispersed, and every sample inherits the model&apos;s own
        systematic errors (a bias the scale can&apos;t remove — it widens the band around the nominal,
        it doesn&apos;t re-centre it). Because the flight is 3-DOF with a steady wind and no rotational dynamics,
        the landing scatter captures the drift response to wind and rail lean but not weathercocking,
        gust response, or wind-shear turbulence. Read the bands as the spread <em>due to the inputs
        you dispersed</em>, layered on top of the single-flight limitations — not an absolute
        confidence interval.
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
        worst-case speed at canopy open across every device — so on a dual-deploy design it is the
        main&apos;s under-drogue opening speed, not the drogue&apos;s near-zero apogee deployment,
        which is the shock that actually matters (and lets the fast-deployment caution fire on a hard
        main). The shock force itself is not computed. Where no ejection charge is modelled for the motor, an ejection-triggered
        device falls back to deploying at apogee. The steady descent rate is compared against the
        ~3–6 m/s most designs aim for, and a firm or hard landing under an undersized canopy is
        flagged — but that check is on descent <em>rate</em> alone; it doesn&apos;t weigh the
        airframe&apos;s mass or fragility, so treat it as a prompt to check your recovery sizing, not
        a verdict. When a landing is flagged firm or hard, Loft names the canopy drag area (and an
        equivalent diameter) that would bring it down to a gentle ~5 m/s — a closed-form goal-seek
        consistent with the flown descent, so a canopy sized that way actually lands at that speed —
        but the shock force, the airframe&apos;s tolerance for it, and the real canopy&apos;s drag
        coefficient are still yours to judge.
      </p>

      <h3>Override-subcomponents (resolved for mass)</h3>
      <p>
        A component&apos;s own mass/CG override is honoured, and OpenRocket&apos;s &ldquo;override
        mass of all subcomponents&rdquo; flag is now applied too: when a section states a measured
        mass for its whole assembly, that figure stands in for the section <em>and everything
        inside it</em>, so the internals are no longer added on top (the old behaviour
        double-counted them, inflating dry mass and shifting the CG). This now applies when the
        override sits on the <em>stage</em> itself, not only on a component — a stage is a component
        assembly in OpenRocket, and a whole-stage measured weight is the common way a builder records
        a finished rocket&apos;s mass. A stage override lumps the measured mass at the stage&apos;s
        natural centre of gravity (or its override CG), leaving stability intact while the mass
        reflects the real figure. The lumped mass otherwise sits at the overriding component&apos;s
        CG, matching OpenRocket, and the outermost override wins over any nested one. Still partial: a
        subcomponents override of <em>CG alone</em> (with no mass override) isn&apos;t propagated to
        the subtree, and the lumped assembly&apos;s rotational inertia is a scaled estimate —
        immaterial to the 3-DOF flight, which uses mass and CG.
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
        The bundled database covers a representative set of common motors across classes
        &frac14;A&ndash;N — the common Estes/Quest/Apogee low-power motors, AeroTech D&ndash;N
        single-use and reload motors, mid-to-high-power Cesaroni, Loki and Animal Motor Works
        G&ndash;N reloads, up to the 98&nbsp;mm Cesaroni and AeroTech N-class research motors, and a
        HyperTEK hybrid — but not the entire ThrustCurve.org catalogue (that would bloat the offline
        bundle). The set is grown by driving real in-the-wild design files and bundling whatever
        they reference that is missing. Every curve is authentic ThrustCurve.org data,
        matched to its published certified total impulse. If your motor isn&apos;t found, Loft says
        so rather than guessing; fuzzy matching by class-and-thrust core can, in rare cases, match a
        same-core motor of a different propellant. That is not hypothetical — a real design calling
        for an AeroTech F67C fell through to the F67W, a different propellant with 28% less impulse
        in a shorter casing, and flew 29.6% low against its own stored results until the F67C was
        bundled. The match quality is always shown, and an approximate one is worth checking. The resolved designation is always shown so you
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

      <h3>RASAero import is geometry, weight and CG — not RASAero&apos;s aerodynamics</h3>
      <p>
        RASAero II <code>.CDX1</code> files import through the same internal model as the other
        formats, so the flight is computed by Loft&apos;s solver, not RASAero&apos;s. The adapter
        covers what a RASAero design is made of — nose cone, body tubes, fin cans, transitions and
        boattails (including a boattail declared inline on a tube), fin sets with their sweep and
        airfoil section, launch lugs and rail guides, the launch site, and the two recovery events —
        and it carries RASAero&apos;s own stored apogee, max velocity and time-to-apogee as a
        cross-check. What it does <strong>not</strong> yet cover: RASAero booster stages (only the
        sustainer is flown, and the comparison is withheld because that is a different vehicle), a
        fin set mounted on a tapered section, and explicit protuberances.
      </p>
      <p>
        <strong>Mass is stated, not computed.</strong> A <code>.CDX1</code> carries no materials and
        no per-part masses, so Loft flies the launch weight and CG the file states (see{" "}
        <Link href="/docs/methods">Methods</Link>). The consequence worth knowing: the mass{" "}
        <em>distribution</em> is a single point, so the airframe&apos;s own moment of inertia is not
        represented. That does not affect the 3-DOF trajectory Loft integrates, but it is a real gap
        the day rotational dynamics arrive.
      </p>
      <p>
        <strong>Expect disagreement on a fast flight.</strong> On the corpus&apos;s one single-stage
        RASAero design — a minimum-diameter N1000W shot — RASAero stores 73,409&nbsp;ft at Mach 2.32
        while the <em>same design</em> in OpenRocket stores 45,636&nbsp;ft at Mach 2.03: the two
        established tools differ from each other by about 60%. Loft reads lower again. Every one of
        those numbers is an extrapolation well past Mach&nbsp;0.8, where Loft&apos;s wave drag is a
        bounded parametric estimate rather than a solved one, and Loft flags the flight as such.
        Treat all three as independent estimates that disagree, not as one number with two errors.
      </p>

      <h3>RockSim import is a common-subset adapter</h3>
      <p>
        RockSim <code>.rkt</code> files import through the same internal model as OpenRocket, so the
        flight is computed identically. The adapter covers the parts real designs use — nose cones,
        body and inner tubes, transitions, trapezoidal fin sets, rings and couplers, mass objects,
        recovery devices, launch lugs — and reads the motor(s) and stored results from each RockSim
        <em>simulation</em>. A fin&apos;s edge cross-section (RockSim&apos;s <code>TipShapeCode</code> —
        square, rounded, or airfoil) is read too, so a thick rounded or airfoiled fin is no longer
        over-dragged as a square edge. Tube-fin sets import too; where the file leaves the tube bore
        at zero — RockSim&apos;s usual habit, which also makes it weigh the tubes as solid rods — the
        wall is taken from the airframe the tubes are cut from and the part is re-weighed to match,
        rather than flying tubes that mass like rods. What it does <strong>not</strong> yet cover: ring
        tails (flown without them, with a warning), pods and sub-assemblies (only the primary stack
        flies), and elliptical/custom RockSim fin planforms (treated as their trapezoidal equivalent). A
        RockSim design tree doesn&apos;t pin a recovery device&apos;s deploy event the way OpenRocket
        does — that lives in the simulation setup — so an imported canopy is deployed by the{" "}
        <em>motor&apos;s ejection charge</em>, which is what the delay in a RockSim engine code is
        for and what the file&apos;s own stored results describe. A zero-delay (&ldquo;-0&rdquo;)
        configuration therefore opens the canopy at burnout, still climbing fast, and tops out far
        below its ballistic apogee: on a real USLI full-scale design that is 359&nbsp;m against
        RockSim&apos;s own stored 323&nbsp;m, where deploying at apogee instead read 2,086&nbsp;m
        against the same 323&nbsp;m. A plugged (&ldquo;-P&rdquo;) motor carries no ejection delay,
        and the canopy falls back to apogee deployment; those configurations of the same design land
        within 1% of the numbers RockSim stores for them. What is <em>not</em> read is a RockSim
        altimeter-triggered or timed deployment set up outside the motor&apos;s charge. Unlike an{" "}
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
