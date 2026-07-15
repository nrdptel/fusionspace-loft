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
        Recovery and fitting parts are stored the same way — as a material plus geometry, not an
        explicit mass — so their mass is computed too: a parachute or streamer from its canopy area
        and areal density, a shock cord from its line density times cord length, and a launch lug or
        rail button from its bulk material over its tube wall. On a small model rocket these are
        grams; on a high-power rocket a long tubular-nylon harness is a real, CG-shifting mass that
        would otherwise be silently dropped. An explicit
        <code>&lt;overridemass&gt;</code> or <code>&lt;overridecg&gt;</code> in the design always
        wins. The centre of gravity is mass-weighted; pitch inertia is the sum of each part&apos;s
        own inertia plus a parallel-axis term. Propellant burns off over the flight, so mass and CG
        are time-varying.
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
        Elliptical and freeform fin sets are reduced to their area- and span-equivalent trapezoid
        before applying the fin equation. A freeform fin carries no explicit chord or span — only an
        outline of points — so its semi-span, root chord, planform area, and sweep are derived from
        that outline first; without that step the fin would read as zero-span and add no normal
        force. A degenerate part — a fin set with no fins, span, or chord, or a nose with no radius —
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
          a rounded edge roughly halves both; an airfoil is streamlined, leaving only the small
          transonic compressibility rise. Referenced to the fins&apos; frontal area
          (<code>N·thickness·span</code>) over the reference area, after the OpenRocket technical
          documentation and Hoerner. This is the dominant pressure term for a finned model rocket —
          a thickness-only estimate under-counts it several-fold — and reading the design&apos;s
          stated cross-section is what brought Loft&apos;s drag on the reference &ldquo;simple model
          rocket&rdquo; into line with OpenRocket&apos;s. A design that names no cross-section is
          treated as square, OpenRocket&apos;s own default.
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
        At that burnout the spent stage <em>separates</em>: its structure and empty casing leave
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
        if it drops below 1 cal. Only the final (sustainer) stage&apos;s descent is tracked; a
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
        Each recovery device deploys on its event — apogee, a set altitude, or the motor&apos;s
        ejection charge — plus any deploy delay it specifies: the vehicle free-falls on body drag
        until the canopy opens, so a delayed deployment reports the higher speed reached at
        line-stretch. An <em>ejection</em> deployment fires at the real charge time (burnout plus
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
