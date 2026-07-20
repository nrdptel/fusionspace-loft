import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Methods — Loft",
  description:
    "Every calculation Loft makes, linked to its published source: Barrowman stability, drag buildup, standard atmosphere, motor and mass models, and the RK4 integrator.",
};

export default function Methods() {
  return (
    <>
      <h2>Methods</h2>
      <p>
        Loft is implemented clean-room from published methods (OpenRocket is GPL; none of its code
        is used). Everything runs in SI internally. Where a method is an approximation, it is
        flagged here and in the <Link href="/docs/limitations">limitations log</Link>. The source
        is in the open repository, file paths noted below.
      </p>

      <h2>Importing designs</h2>
      <p>
        Loft reads two design formats: OpenRocket <code>.ork</code> (a ZIP, gzip, or raw XML with an{" "}
        <code>&lt;openrocket&gt;</code> root; <code>lib/ork/</code>) and RockSim <code>.rkt</code>{" "}
        (XML with a <code>&lt;RockSimDocument&gt;</code> root; <code>lib/rkt/</code>). The importer
        sniffs the root element and picks the adapter. Each adapter is a <em>thin</em> translator
        into one internal rocket model — the simulator only ever sees that model, never a file
        format — so the same physics flies either format and a future importer (RocketPy) is another
        adapter, not a second engine. The RockSim adapter is implemented clean-room from RockSim&apos;s
        published file specification (its <code>RockSim_Xml_Doc.txt</code>, the RockSim engine-file
        format, and the documented shape/finish codes); RockSim stores lengths in millimetres, masses
        in grams, and diameters as diameters, all converted to SI on import. Unknown parts are
        skipped with a warning rather than failing the whole file.
      </p>

      <h2>Coordinate model &amp; integrator</h2>
      <p>
        The flight is integrated with a fixed-step 4th-order Runge–Kutta scheme
        (<code>lib/sim/simulate.ts</code>). The state is carried as full 3-D position and velocity
        vectors, but this session integrates <strong>translational motion in the vertical plane</strong>:
        thrust and drag act along the flight path (velocity-aligned), assuming the rocket flies at a
        small angle of attack — which holds for a stable rocket in light wind. Rotational dynamics
        (weathercocking, pitch/yaw) are not integrated; static stability is computed and reported
        separately. The vector-shaped state is deliberate: extending to a full 6-DOF solve is
        additive, not a rewrite.
      </p>
      <p>
        The step is <strong>phase-adaptive</strong>. Boost and coast — where thrust and drag change
        quickly — use a fine fixed step (<code>0.01&nbsp;s</code>). The long descent under recovery
        is different: once a canopy is open the vehicle settles to a near-constant terminal velocity,
        an all-but-linear fall that a much coarser step integrates just as accurately, so the descent
        runs at a <code>0.1&nbsp;s</code> ceiling — set from a convergence study
        (<code>lib/sim/descent-convergence.test.ts</code>: halving it moves the landing point and
        flight time by under a tenth of a percent) and the bulk of a full flight&apos;s cost, which
        matters most for the hundreds of flights a Monte-Carlo runs. An open parachute&apos;s
        quadratic drag is a <em>stiff</em> decay, though, and a fast deployment (a mistimed early
        ejection, a payload popping its chute at separation speed) can push an explicit step past its
        stability limit and diverge. So through the opening transient the descent step is shortened to
        hold <code>dt·λ</code> within the RK4 stability region, where <code>λ = ρ·(C<sub>d</sub>·A)·v/m</code>
        is the linearised drag-response rate — small while the speed is high, relaxing back to the
        ceiling as the canopy brings the rocket to terminal. The result is stable for any deploy speed
        without paying for a fine step over the whole descent.
      </p>

      <h2>Launch rail &amp; thrust-to-weight</h2>
      <p>
        While the rocket is still on the launch rail (position along the rail ≤ the guide length)
        its motion is constrained to the rail axis: thrust and gravity act along the rail and any
        lateral acceleration is reacted by the rail, so it cannot pitch until it clears the guide.
        The speed at which it leaves the rail — the <strong>rail-exit velocity</strong> — is the
        speed the fins first have to stabilise the airframe; below about <code>15&nbsp;m/s</code>
        (50&nbsp;ft/s) that is flagged, as a stable departure is not assured. It is read at the exact
        instant the rocket has travelled the rail length — interpolated within the integration step
        rather than sampled at the step&apos;s end — so a coarse step doesn&apos;t overshoot the
        crossing and report an optimistically high departure speed; the figure matches an independent
        6-DOF engine (RocketPy) to a fraction of a percent.
      </p>
      <p>
        The <strong>liftoff thrust-to-weight ratio</strong> is the peak thrust developed while
        clearing the rail divided by the loaded weight (<code>F / m·g</code>) — the most basic
        launch-safety check, and, unlike rail-exit velocity, independent of how long the rail is.
        Below <code>1&nbsp;:&nbsp;1</code> the rocket cannot leave the pad at all, which Loft flags
        as a warning (the apogee it would otherwise report is essentially zero and meaningless);
        below the <code>5&nbsp;:&nbsp;1</code> figure commonly taught for high-power rockets it is
        flagged as a caution to verify the rail is long enough. These are rules of thumb, not
        verdicts.
      </p>
      <p>
        <em>Sources:</em> minimum rail-departure velocity and the 5:1 thrust-to-weight guideline as
        given in the NAR/Tripoli high-power safety guidance and standard model-rocketry texts
        (e.g. Stine &amp; Stine, <em>Handbook of Model Rocketry</em>); the rail-constraint and
        thrust-to-weight formulation follows Niskanen&apos;s OpenRocket technical documentation.
      </p>

      <h2>Atmosphere</h2>
      <p>
        Temperature, pressure, and density follow the{" "}
        <strong>U.S. Standard Atmosphere (1976)</strong> layer model
        (<code>lib/sim/atmosphere.ts</code>), integrated from the hydrostatic equation for an ideal
        gas — the isothermal exponential form in isothermal layers, the power-law form under a
        lapse rate. Speed of sound is <code>√(γ·R·T)</code>; dynamic viscosity follows{" "}
        <strong>Sutherland&apos;s law</strong>. A non-standard ground state (a warm, high, or
        low-pressure day) shifts the sea-level anchors while keeping the standard structure aloft —
        this is what the optional &ldquo;today&apos;s conditions&rdquo; re-run uses.
      </p>
      <p>
        <em>Sources:</em> U.S. Standard Atmosphere, 1976 (NOAA/NASA/USAF); Sutherland (1893) as
        tabulated in standard fluid-dynamics references.
      </p>

      <h2>Mass, CG &amp; inertia</h2>
      <p>
        Mass properties (<code>lib/sim/mass.ts</code>) are built from the component tree. Where
        geometry defines mass unambiguously — tubes, rings, fins — it is computed from the
        component&apos;s dimensions and its material density. Bodies of revolution (nose cones,
        transitions) are integrated numerically along the contour for volume and centroid
        (<code>lib/sim/shapes.ts</code>), with a shell subtracted when a wall thickness is given.
        A nose cone or transition also carries a <strong>shoulder</strong> — the collar that plugs
        into the neighbouring tube — whose material (a tube of the shoulder&apos;s own wall, plus a
        bulkhead disc when it is capped) is massed too and placed at its own station, so it shifts
        the CG the way the real part does; on a small model rocket the nose shoulder alone can be
        several grams that would otherwise be dropped. Recovery and fitting parts are stored the same way — as a material plus geometry, not an
        explicit mass — so their mass is computed too: a parachute or streamer from its canopy area
        and areal density, a shock cord from its line density times cord length, and a launch lug or
        rail button from its bulk material over its tube wall. On a small model rocket these are
        grams; on a high-power rocket a long tubular-nylon harness is a real, CG-shifting mass that
        would otherwise be silently dropped. An explicit
        <code>&lt;overridemass&gt;</code> or <code>&lt;overridecg&gt;</code> in the design always
        wins; when it is flagged to override <em>all subcomponents</em> — a section weighed as a
        whole — that one figure stands in for the section and everything inside it, rather than
        being added to the parts&apos; own computed masses. The centre of gravity is mass-weighted;
        pitch inertia is the sum of each part&apos;s own inertia plus a parallel-axis term.
        Propellant burns off over the flight, so mass and CG are time-varying.
      </p>
      <p>
        A RockSim <code>.rkt</code> is the exception to the &ldquo;compute from geometry&rdquo; rule:
        it stores RockSim&apos;s own per-part mass — the calculated value, or the measured
        (&ldquo;known&rdquo;) value when the design is set to use it — so Loft honours those as
        per-part overrides and flies the exact masses the design specifies. That keeps a RockSim
        import faithful to its source and keeps the stored-results comparison about the aerodynamics
        and integration rather than a mass-model difference. (An <code>.ork</code> stores no per-part
        mass, so there Loft computes it as above.)
      </p>
      <p>
        Nose-cone contours use the standard published profile equations (conical, tangent ogive,
        ellipsoid, power, parabolic, and the Haack series).
      </p>
      <p>
        OpenRocket marks a radius that should match a neighbour as <code>auto</code>. Loft resolves
        those before simulating — a body tube takes its neighbour&apos;s radius, a transition end
        takes the body it meets, and an internal part (coupler, ring, inner tube, bulkhead) fits
        inside its enclosing part, whether that&apos;s a tube, a coupler, or the nose. When a body
        radius still can&apos;t be matched to a neighbour — a whole airframe left <code>auto</code>,
        anchored only by a boat-tail end or an internal part — it falls back to the rocket&apos;s
        largest known radius (the same value the aerodynamic reference is taken from) so the
        airframe keeps a defined, self-consistent size instead of collapsing to a drag-free,
        near-massless needle flown against a borrowed reference area. This mirrors OpenRocket, whose
        <code>auto</code> radius searches fore and aft for a dimensioned section and only then uses a
        default. The substitution is flagged in the import warnings, never silent; only when nothing
        anywhere resolves is a section finally treated as zero — and even then it is never left
        undefined, so one unresolved part can&apos;t poison the total mass and reference area.
      </p>

      <h2>Aerodynamic stability — Barrowman</h2>
      <p>
        The centre of pressure and normal-force-coefficient slope come from the{" "}
        <strong>Barrowman equations</strong> (<code>lib/sim/aero.ts</code>), the standard subsonic,
        small-angle method. Each body-of-revolution and fin set contributes a normal-force slope{" "}
        <code>C<sub>Nα</sub></code> and a centre of pressure, combined as a coefficient-weighted
        mean.
      </p>
      <p className="eqn">
        nose: C_Nα = 2·(r_base/r_ref)²,  X_cp = L − V/A_base{"\n"}
        transition: C_Nα = 2·[(r_aft/r_ref)² − (r_fore/r_ref)²]{"\n"}
        fins (N): C_Nα = K_fb · 4N(s/d)² / [1 + √(1 + (2·l_m/(C_r+C_t))²)]{"\n"}
        interference: K_fb = 1 + r_body/(s + r_body){"\n"}
        static margin (cal) = (X_cp − X_cg) / d_ref
      </p>
      <p>
        Elliptical and freeform fin sets use their area- and span-equivalent trapezoid for the
        normal-force slope. An elliptical fin&apos;s <em>centre of pressure</em>, though, is taken
        exactly for its planform: integrating the quarter-chord aerodynamic centre over the
        elliptical chord <code>c(y)=c_root·√(1−(y/s)²)</code> gives{" "}
        <code>X_cp = (½ − 2/3π)·c_root ≈ 0.288·c_root</code> aft of the root leading edge — further
        aft than the equivalent trapezoid, so it no longer under-predicts the margin. A freeform fin
        carries no explicit chord or span — only an outline of points — so its semi-span, root chord,
        planform area, and sweep are derived from that outline first; without that step the fin would
        read as zero-span and add no normal force. Its centre of pressure is then taken exactly from
        the same outline by strip theory — <code>X_cp = ∫(x_LE + ¼c)·c dy / ∫c dy</code> over the
        polygon, the chord-weighted mean of the local quarter-chord line — which reduces to the
        trapezoid formula for a trapezoidal outline and to <code>0.288·c_root</code> for an
        elliptical one, so an unusual planform is no longer flattened to an equal-area trapezoid for
        stability. Being a fraction of the chord, it is invariant when a geometry edit stretches the
        fin spanwise. A degenerate part — a fin set with no fins, span, or chord, or a nose with no radius —
        contributes no normal force rather than a division by zero, so a malformed or placeholder
        part can&apos;t leave the centre of pressure and static margin undefined (which would also
        silently suppress the low-stability warning).
      </p>
      <p>
        <em>Sources:</em> J. S. Barrowman &amp; J. A. Barrowman, &ldquo;The Practical Calculation of
        the Aerodynamic Characteristics of Slender Finned Vehicles&rdquo; (1966/1967); as compiled in
        the public Apogee <em>Peak of Flight</em> newsletters (#149, #150, #157) and the OpenRocket
        technical documentation.
      </p>
      <p>
        <strong>Stability trim (nose-ballast goal-seek).</strong> When a design&apos;s margin is thin,
        Loft solves the nose ballast that would bring it to a healthy value directly, rather than making
        you read it off a sweep (<code>lib/sim/trim.ts</code>). The margin is measured at the loaded
        centre of gravity, and ballast of mass <code>b</code> at the nose station <code>x_n</code> moves
        the loaded CG to the mass-weighted blend{" "}
        <code>x_cg(b) = (M·x_cg₀ + b·x_n)/(M + b)</code> while the aerodynamic CP does not move with
        mass — so the ballast for a target margin is closed-form,{" "}
        <code>b = M·(x_cg,target − x_cg₀)/(x_n − x_cg,target)</code> with{" "}
        <code>x_cg,target = X_cp − margin·d_ref</code>. As <code>b → ∞</code> the CG asymptotes to the
        nose station, so nose ballast can make a design no stiffer than{" "}
        <code>(X_cp − x_n)/d_ref</code>; a target above that ceiling is unreachable by weight alone
        (the fins are too small or too far forward), which Loft says plainly instead of prescribing an
        ever-growing lump of lead. It is the inverse of the ballast parameter sweep, sharing the same
        mass and CG model the flight uses.
      </p>

      <h2>Drag</h2>
      <p>
        Zero-lift drag is a <strong>component buildup</strong> referenced to the reference area
        (<code>lib/sim/aero.ts</code>):
      </p>
      <ul>
        <li>
          <strong>Skin friction</strong> — a <em>fully turbulent</em> flat-plate coefficient
          (Prandtl–Schlichting <code>0.455/(log₁₀Re)²·⁵⁸</code>) across the whole Reynolds range,
          because a rocket&apos;s boundary layer is tripped turbulent near the nose; a laminar
          <code> 1.328/√Re</code> branch would under-state friction at the low Reynolds numbers a
          small, slow rocket sees near apogee. A surface-roughness floor from the design&apos;s
          finish holds friction flat at high Reynolds number where roughness dominates, while the
          smooth turbulent value climbs above it as the rocket slows — so coast drag rises toward
          apogee, matching OpenRocket&apos;s stored per-step drag. A compressible-turbulent
          (reference-temperature / Frankl–Voishel) correction is applied at speed, over the body and
          fin wetted areas with fineness- and thickness-ratio form factors (Hoerner-style).
        </li>
        <li>
          <strong>Base drag</strong>, referenced to the base area: the subsonic correlation{" "}
          <code>0.12 + 0.13·M²</code> up to Mach 1, then the supersonic recovery <code>0.25/M</code>{" "}
          above it — the two branches meet continuously at Mach 1. It is applied in full whether the
          motor is burning or not, matching OpenRocket&apos;s stored per-step drag (which carries the
          full base drag throughout boost); a blanket thrust-phase discount badly under-drags a body
          much wider than its motor, where the exhaust fills only a small part of the base. (Carrying
          the subsonic form supersonically, as a naive model does,
          makes base drag grow without bound, which is wrong.)
        </li>
        <li>
          <strong>Fin pressure drag</strong> — set by the fin&apos;s edge <em>cross-section</em>. A
          square edge stagnates the flow head-on (stagnation-pressure coefficient ≈ 0.85 subsonic,
          reduced by leading-edge sweep as <code>cos²Λ</code>) and leaves a blunt trailing-edge base;
          a rounded edge attaches the flow at the leading edge — no stagnation face, so only the
          small compressibility rise there, like an airfoil — while its rounded trailing edge still
          sheds a wake at about half a square base; an airfoil is streamlined at both edges, leaving
          only the compressibility rise. Modelling a rounded leading edge as half a square one (a
          coarser earlier heuristic) over-counted a rounded fin&apos;s pressure drag about twofold
          against OpenRocket&apos;s stored per-step Cd on its rounded-fin examples. Referenced to the fins&apos; frontal area
          (<code>N·thickness·span</code>, summed over every fin set — so a design that models its
          fins as several separate single-fin sets, a common OpenRocket pattern, is counted in full
          rather than from one set alone) over the reference area, after the OpenRocket technical
          documentation and Hoerner. This is the dominant pressure term for a finned model rocket —
          a thickness-only estimate under-counts it several-fold — and reading the design&apos;s
          stated cross-section is what brought Loft&apos;s drag on the reference &ldquo;simple model
          rocket&rdquo; into line with OpenRocket&apos;s. A design that names no cross-section is
          treated as square, OpenRocket&apos;s own default. The leading-edge <code>cos²Λ</code>
          reduction uses each fin&apos;s actual leading-edge sweep — including an{" "}
          <em>elliptical</em> fin&apos;s, whose tip sits at mid-root-chord so its edge sweeps back
          about half the root chord over the span. Treating that curved edge as unswept (its stored
          sweep is zero) over-counted its stagnation drag by ~22% on a real minimum-diameter design;
          reading the sweep from the planform brought Loft&apos;s per-step drag on OpenRocket&apos;s
          <em> elliptical_v1.9</em> example to within ~1% of its stored curve.
        </li>
        <li>
          <strong>Shoulder pressure drag</strong> — a diameter-<em>increasing</em> transition
          (a shoulder) forces the flow outward, adding a stagnation-like pressure drag
          <code>C<sub>d</sub> = 0.8·sin²φ</code> over the frontal-area increase, where{" "}
          <code>φ</code> is the conical joint angle: a gentle shoulder drags little, an abrupt step
          approaches the <code>0.8</code> stagnation value. After the OpenRocket technical
          documentation (Niskanen, eq. 3.86), following Hoerner. It is a low-subsonic separation
          effect, so it is not compressibility-corrected.
        </li>
        <li>
          <strong>Boattail pressure drag</strong> — a diameter-<em>decreasing</em> transition
          reduces the base area (captured by the base-drag term, which follows the aft diameter),
          but its sloped surface still carries a pressure drag. It is estimated as the base-drag
          coefficient acting over the frontal-area reduction, scaled by the boattail&apos;s
          length-to-height ratio <code>γ</code>: full base drag for an abrupt contraction
          (<code>γ ≤ 1</code>, about a 27° cone), fading to nothing for a gentle one
          (<code>γ ≥ 3</code>, about 9°). By construction a zero-length boattail then adds back
          exactly the base drag its contraction removed, so it nets to no change. After the
          OpenRocket technical documentation (Niskanen, eq. 3.88); its Mach dependence rides on the
          base-drag coefficient.
        </li>
        <li>
          <strong>Nose pressure drag</strong> — the same <code>0.8·sin²φ</code> stagnation estimate
          as the shoulder, applied over the nose base area, with <code>φ</code> the contour&apos;s
          joint angle where the nose meets the body (read numerically from the shape). A tangent
          nose — an ogive, ellipsoid or Haack — meets the body smoothly (<code>φ ≈ 0</code>) and
          carries essentially none; a cone or blunt shape has a real joint angle and a small
          pressure drag. After the OpenRocket technical documentation (Niskanen, eq. 3.86); not
          compressibility-corrected.
        </li>
        <li>
          <strong>Parasitic</strong> — the drag of external fittings (launch lugs, rail buttons)
          computed from each fitting&apos;s own frontal area and count rather than a blind allowance,
          using an axial protuberance drag coefficient reduced for sitting in the body&apos;s
          boundary layer (Hoerner; the model-rocket launch-lug literature); and a small flat residual
          for un-modelled hardware (joints, screw heads), with a bounded Prandtl–Glauert
          amplification below the critical Mach. Negligible on a slender high-power body but a real
          contributor on a small model rocket where the lug is large relative to the airframe.
        </li>
        <li>
          <strong>Wave (compressibility) drag</strong> — zero below the critical Mach (~0.8), a
          smooth transonic rise to a peak near Mach 1.15, then a supersonic decline toward a
          slender-body plateau. The peak is <em>geometry-driven</em>: the forebody term scales with
          the nose&apos;s own fineness ratio (slender ⇒ less) and its contour shape — a Von Kármán
          (LD-Haack) ogive is the minimum-wave-drag body, with parabolic, power, tangent-ogive,
          ellipsoid, and conical noses ranked progressively higher, after the published nose-shape
          drag comparisons — and the fin term with fin thickness ratio reduced by leading-edge sweep
          (<code>cos²Λ</code>). This gives the total drag the published <code>C<sub>d</sub></code>–Mach
          shape (subsonic-flat → transonic peak → supersonic decline) rather than growing without
          limit; any flight above Mach 0.8 is still flagged <em>extrapolated</em>, as the peak is a
          bounded parametric estimate, not a per-geometry wave-drag solution.
        </li>
      </ul>
      <p>
        The summed coefficient is capped at a physical ceiling well above any real nose-forward
        rocket. That cap is a numerical guard, not a model term — it never engages on a real flight,
        only on malformed geometry (say a unit-scale import error), where an astronomically large
        drag would otherwise destabilise the fixed-step integrator and report a nonsensical apogee.
      </p>
      <p>
        <em>Sources:</em> S. F. Hoerner, <em>Fluid-Dynamic Drag</em> (1965); the drag treatment in
        the OpenRocket technical documentation; standard flat-plate friction correlations; the
        Sears–Haack / Von Kármán minimum-drag-body result and the published nose-cone drag
        comparisons for the wave-drag shape ranking. The drag model is the largest source of error —
        see <Link href="/docs/limitations">limitations</Link>.
      </p>

      <h2>Motors</h2>
      <p>
        A design references a motor by manufacturer and designation but does not embed its
        thrust curve, so Loft resolves the motor against a bundled database of real RASP{" "}
        <code>.eng</code> curves from{" "}
        <a href="https://www.thrustcurve.org" target="_blank" rel="noopener noreferrer">
          ThrustCurve.org
        </a>{" "}
        (<code>lib/motors/</code>). Thrust is linearly interpolated in time; propellant mass is
        depleted in proportion to delivered impulse (constant-<em>I<sub>sp</sub></em> assumption), so
        motor mass falls from loaded to casing mass over the burn. Matching prefers an exact
        designation, then a looser substring or class-and-thrust core (so a Cesaroni
        &ldquo;838J293-13A&rdquo; still resolves to &ldquo;J293&rdquo;); an exact designation matches
        regardless of a maker-string difference, but a <em>loose</em> match never crosses
        manufacturers — a design&apos;s &ldquo;K550&rdquo; is left unresolved rather than silently
        matched to a different maker&apos;s &ldquo;K550W&rdquo;. The UI flags an approximate or failed
        match. A motor{" "}
        <em>cluster</em> (OpenRocket&apos;s cluster configuration, e.g. a &ldquo;4-ring&rdquo;) is
        flown as that many identical motors on the centreline — full thrust, propellant, and
        motor-tube mass — with the count shown on the motor tag. Where a design assigns different
        motors to separate mounts and only some resolve, the flight runs on the resolved ones and a
        warning reports the under-counted thrust.
      </p>

      <h2>Staging</h2>
      <p>
        In-line (serial) stages fly in sequence. The bottom stage lights at launch; each stage
        above air-starts when the stage below burns out, plus any ignition delay it specifies —
        so a boosted-dart coast between separation and the sustainer&apos;s air-start is honoured.
        A stage <em>separates</em> on the event the design specifies: by default (and for the usual
        boosted staging) when it finishes burning, but a stage set to separate at its own
        <em> ejection charge</em> hangs on until that charge fires — often a long delay, so a
        payload or dual-section rocket stays whole until near apogee and only then parts, rather
        than splitting at burnout. When it separates its structure and empty casing leave
        the vehicle, and the flight continues on the stages still attached. The simulator recomputes
        mass, the reference area, and the drag buildup for the attached stack at each separation
        (each phase&apos;s vehicle is the top-most stages, evaluated with the same mass and aero
        code as a single stage), so a dead booster is no longer lofted to apogee. Because the
        vertical-plane solve is a point mass, only the total mass, thrust, and reference drag change
        across a separation — the trajectory doesn&apos;t depend on where the centre of gravity sits
        within the vehicle. Stability <em>does</em> depend on it: the stages stack nose-to-tail into
        one continuous airframe, so the centre of gravity and Barrowman centre of pressure are
        computed for whichever stages are attached. Because an upper stage can be stable inside the
        loaded stack yet unstable once it flies alone, the sustainer&apos;s own static margin —
        evaluated loaded, right after separation, its worst case — is checked separately and flagged
        if it drops below 1 cal. The exception is a payload section that pops its chute <em>on</em>
        the separation (a lower-stage-separation recovery): it is under canopy from that instant and
        never flies ballistically, so a finless payload isn&apos;t flagged as an unstable upper
        stage. Only the final (sustainer) stage&apos;s descent is tracked; a
        separated booster&apos;s own recovery isn&apos;t. Parallel and strap-on staging is not
        modelled (see the <Link href="/docs/limitations">limitations</Link>).
      </p>
      <p>
        Ignition timing is resolved <em>per motor</em>, not just per stage, so a second motor
        <em> within one stage</em> can be air-started after its own delay while the first burns from
        launch — the delay is read from the flown configuration, so a design that sets a different
        air-start time in each of its stored simulations flies each one distinctly. The airstarted
        motor rides as dead weight until it lights, then adds its thrust; the vehicle&apos;s peak
        speed and apogee shift with the timing, exactly as a staged air-start does.
      </p>

      <h2>Recovery &amp; drift</h2>
      <p>
        Each recovery device deploys on its event — apogee, a set altitude, the motor&apos;s
        ejection charge, or the separation of the stage below it (the payload/dual-section charge
        that both parts the sections and pops the chute) — plus any deploy delay it specifies: the
        vehicle free-falls on body drag until the canopy opens, so a delayed deployment reports the
        higher speed reached at line-stretch. An <em>ejection</em> deployment fires at the real charge time (burnout plus
        the design&apos;s delay), so a too-short delay opens the canopy before apogee while still
        ascending, and a too-long delay opens it late at speed — or, if the charge would fire after
        the rocket is already down, not at all. Both a pre-apogee opening and a ballistic (no-deploy)
        descent are flagged. Descent then uses the summed deployed drag areas
        (<code>C<sub>d</sub>·A</code>); the steady descent rate this gives is checked against the
        ~3–6 m/s (10–20 ft/s) most designs aim for, and a firm (&gt;25 ft/s) or hard (&gt;35 ft/s)
        landing under a too-small canopy is flagged as a caution or warning — a rule of thumb, not a
        verdict. Descent drift is the canopy drifting with the wind; with the &ldquo;today&apos;s
        conditions&rdquo; re-run, the wind varies with altitude from the winds-aloft profile.
      </p>
      <p>
        <strong>Recovery sizing (goal-seek).</strong> When a design lands harder than it should, Loft
        solves the canopy that would bring it down gently rather than leaving you to guess and re-fly
        (<code>lib/sim/recovery.ts</code>). It is the recovery-side companion to the stability trim,
        and closed-form: at terminal velocity drag balances weight,{" "}
        <code>v = √(2·m·g / (ρ·C<sub>d</sub>A<sub>total</sub>))</code>, with <code>m</code> the burnout
        (descent) mass, <code>ρ</code> the air density at the field, and{" "}
        <code>C<sub>d</sub>A<sub>total</sub> = C<sub>d</sub>A<sub>chute</sub> + ½·A<sub>ref</sub></code>{" "}
        — the same airframe body-drag term the descent integrates — so the canopy for a target speed is{" "}
        <code>C<sub>d</sub>A<sub>chute</sub> = 2·m·g/(ρ·v²) − ½·A<sub>ref</sub></code>, reported as a
        drag area and an equivalent diameter. Because it uses the flight&apos;s own descent model, a
        canopy sized this way, flown, lands at the target speed — checked against a real flight in{" "}
        <code>lib/sim/recovery.test.ts</code>. The goal-seek names one size; the{" "}
        <strong>recovery-size what-if</strong> (<em>Conditions → Design what-if</em>) is its
        open-ended companion — a multiplier on every deployed device&apos;s drag area that re-flies
        the design with a bigger or smaller canopy, so you can watch the descent rate, drift, and
        deployment speed move together (a bigger canopy lands softer but drifts farther and snaps
        open harder). It scales only the recovery, never the ascent, so apogee and stability are
        untouched; the Monte-Carlo landing scatter honours it.
      </p>
      <p>
        The <strong>optimum ejection delay</strong> Loft reports is the delay (from burnout) that
        would deploy the recovery at apogee — a property of the airframe, motor, and launch
        conditions, not of the delay actually flown. It is measured from a free coast to the true
        apogee with recovery suppressed, so a design flown with a <em>too-short</em> delay — whose
        canopy opens early and cuts the climb short — still gets a sound recommendation rather than
        an even shorter one that would compound the mistake.
      </p>

      <h2>Fin flutter</h2>
      <p>
        Fins have their own elasticity, and above a critical airspeed — the <em>flutter
        boundary</em> — a bending-and-twisting oscillation stops damping out and diverges, shredding
        the fin (and often the rocket). Loft estimates each fin set&apos;s flutter speed along the
        ascent and reports the worst-case <em>margin</em> — the flutter speed divided by the peak
        airspeed the fin actually sees — sampling the real ambient pressure and speed of sound at
        every altitude the vehicle passes through, since the boundary rises as the air thins. Neither
        OpenRocket nor RockSim reports this, so it is Loft&apos;s own safety heuristic.
      </p>
      <p>
        The estimate is the simplified flutter-boundary closed form,{" "}
        <code>
          V<sub>f</sub> = a·√( G / [ 1.337·A³·P·(λ+1) / (2·(A+2)·(t/c)³) ] )
        </code>
        , with <code>a</code> the local speed of sound, <code>G</code> the fin material&apos;s shear
        modulus, <code>A</code> the exposed-fin aspect ratio, <code>λ</code> the taper ratio, and{" "}
        <code>t/c</code> the thickness ratio on the root chord — so flutter speed climbs with the
        cube of the thickness ratio and the square root of stiffness, and falls with aspect ratio
        (thin, high-aspect fins flutter first). The shear modulus is taken from the design&apos;s own
        fin material (G10 fibreglass is assumed, and said so, when the material is missing or
        unrecognised). This is a <em>preliminary-design estimate</em>, method-dependent to roughly
        ±20% — the fuller NACA method, which adds a chordwise mass-balance term, tends to sit a little
        lower — so Loft keeps a recommended margin of {"≥ 1.5×"} and cautions (never reassures) when
        it is thin; it never certifies a fin as flutter-safe.
      </p>
      <p>
        When the margin <em>is</em> thin, Loft names the fix rather than just saying &ldquo;thicken the
        fins&rdquo;: since the flutter speed rises with the 1.5 power of the thickness ratio and the
        peak airspeed the margin is taken against barely moves with thickness, the thickness for a
        target margin is closed-form, <code>t<sub>target</sub> = t<sub>now</sub>·(margin<sub>target</sub>/margin<sub>now</sub>)^(2/3)</code>.
        It errs a touch thick — a thicker fin also drags a little more and lowers the peak airspeed,
        so the flown margin comes out just above the target — which is the safe direction for a fin
        caution. Shortening the span or a stiffer material reaches the same margin; the suggestion is a
        starting point to check with the fin-thickness what-if, not a substitute for a real
        structural design.
      </p>
      <p>
        <em>Sources:</em> D. J. Martin, NACA TN 4197, <em>Summary of Flutter Experiences as a Guide
        to the Preliminary Design of Lifting Surfaces on Missiles</em> (1958); the closed form as
        popularised for rocketry by Apogee Components&apos; <em>Peak of Flight</em> newsletter #291.
      </p>

      <h2>Monte-Carlo dispersion</h2>
      <p>
        A single flight is one draw from an uncertain reality: a rail is never perfectly plumb, wind
        gusts and shifts, a motor&apos;s total impulse varies from one unit to the next, and a built
        airframe rarely hits its CAD mass exactly. The <strong>dispersion</strong> tool flies the
        design a few hundred times with those inputs jittered around their nominal values and reports
        the <em>spread</em> of the outcomes — the apogee band to expect, the radius from the pad
        that contains 95% of the landings (the recovery area to plan for), and the landing-speed band
        (its 95th percentile is the hardest landing to size recovery against, which a heavier-than-CAD
        build pushes up). Every sample runs through
        the same solver as the main flight; nothing about the physics changes. The uncertainty is
        entirely in the inputs, which are your own stated assumptions, so the result is an honest
        propagation of that spread — not a claim of new precision.
      </p>
      <p>
        Each input is drawn from a normal distribution about its nominal value at the one-sigma spread
        you set: the motor impulse scales the thrust curve (a motor&apos;s propellant mass is
        essentially fixed, so its lot-to-lot variation is in average thrust); the dry mass scales the
        airframe&apos;s structure uniformly (so the centre of gravity holds and only the total mass
        moves); the aerodynamic drag scales the zero-lift drag coefficient (the drag model&apos;s own
        uncertainty — the single largest error source, so its spread belongs in the band rather than
        being treated as exact; it does not touch a deployed canopy&apos;s drag area); the recovery
        drag scales every open canopy&apos;s C<sub>d</sub>·A (a parachute&apos;s drag coefficient is
        only known to ±10–20%, and it sets the descent — so this is the main driver of the
        landing-speed band, the piece the ascent drag deliberately leaves out); the rail angle
        adds a lean to the launch rod; and the wind speed varies around the design&apos;s nominal.
        Impulse, dry mass, and drag are the main drivers of the apogee band; rail angle and wind drive
        the landing scatter. The
        rail-lean and wind <em>directions</em> are sampled uniformly from all bearings, so the landing
        scatter maps the recovery area regardless of the day&apos;s wind heading. The whole run is
        driven by a fixed-seed pseudo-random generator, so the same design and the same dispersions
        reproduce the same cloud — a dispersion is a stable property of the design, not wall-clock
        noise. The reported bands are 5th-to-95th percentiles of the flown samples.
      </p>
      <p>
        If you enter a <strong>waiver ceiling</strong>, Loft reports the fraction of the dispersed
        flights whose apogee topped it — the &ldquo;chance of busting the ceiling&rdquo; a high-power
        flyer weighs against an altitude limit. It is read from the samples already flown (changing it
        doesn&apos;t re-fly), and it inherits the model&apos;s own systematic apogee error, so it is a
        planning cue to keep real margin against — never a guarantee.
      </p>

      <h2>Live weather (optional)</h2>
      <p>
        The &ldquo;re-fly for today&rdquo; feature fetches current surface conditions and a
        pressure-level winds-aloft profile from{" "}
        <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
          Open-Meteo
        </a>{" "}
        (keyless, no account), the same source the sibling{" "}
        <a href="https://window.fusionspace.co" target="_blank" rel="noopener noreferrer">
          Window
        </a>{" "}
        uses. It is the only part of Loft that touches the network, always behind an explicit tap.
      </p>
    </>
  );
}
