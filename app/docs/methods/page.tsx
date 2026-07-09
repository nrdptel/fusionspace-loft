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
        An explicit <code>&lt;overridemass&gt;</code> or <code>&lt;overridecg&gt;</code> in the
        design always wins. The centre of gravity is mass-weighted; pitch inertia is the sum of each
        part&apos;s own inertia plus a parallel-axis term. Propellant burns off over the flight, so
        mass and CG are time-varying.
      </p>
      <p>
        Nose-cone contours use the standard published profile equations (conical, tangent ogive,
        ellipsoid, power, parabolic, and the Haack series).
      </p>
      <p>
        OpenRocket marks a radius that should match a neighbour as <code>auto</code>. Loft resolves
        those before simulating — a body tube takes its neighbour&apos;s radius, a transition end
        takes the body it meets, and an internal part (coupler, ring, inner tube, bulkhead) fits
        inside its enclosing part, whether that&apos;s a tube, a coupler, or the nose. A radius that
        still can&apos;t be resolved is treated as zero and flagged in the import warnings rather
        than silently guessed — importantly, it is never left undefined, so one unresolved internal
        part can&apos;t poison the total mass and reference area and collapse the whole flight.
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
        before applying the fin equation.
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
          <strong>Skin friction</strong> — a flat-plate coefficient (laminar{" "}
          <code>1.328/√Re</code>, turbulent Prandtl–Schlichting <code>0.455/(log₁₀Re)²·⁵⁸</code>)
          with a surface-roughness floor from the design&apos;s finish and a compressible-turbulent
          (reference-temperature / Frankl–Voishel) correction at speed, applied to the body and fin
          wetted areas with fineness- and thickness-ratio form factors (Hoerner-style).
        </li>
        <li>
          <strong>Base drag</strong>, referenced to the base area and suppressed while the motor
          burns (exhaust fills the base): the subsonic correlation <code>0.12 + 0.13·M²</code> up to
          Mach 1, then the supersonic recovery <code>0.25/M</code> above it — the two branches meet
          continuously at Mach 1. (Carrying the subsonic form supersonically, as a naive model does,
          makes base drag grow without bound, which is wrong.)
        </li>
        <li>
          <strong>Pressure &amp; parasitic</strong> — fin leading-edge/thickness pressure drag and a
          small flat interference allowance for lugs, joints, and rail buttons, with a bounded
          Prandtl–Glauert amplification below the critical Mach.
        </li>
        <li>
          <strong>Wave (compressibility) drag</strong> — zero below the critical Mach (~0.8), a
          smooth transonic rise to a peak near Mach 1.15, then a supersonic decline toward a
          slender-body plateau. The peak scales with fin thickness and body bluntness. This gives
          the total drag the published <code>C<sub>d</sub></code>–Mach shape (subsonic-flat →
          transonic peak → supersonic decline) rather than growing without limit; any flight above
          Mach 0.8 is still flagged <em>extrapolated</em>, as the transonic/supersonic model is a
          bounded approximation, not a per-geometry wave-drag solution.
        </li>
      </ul>
      <p>
        <em>Sources:</em> S. F. Hoerner, <em>Fluid-Dynamic Drag</em> (1965); the drag treatment in
        the OpenRocket technical documentation; standard flat-plate friction correlations. The drag
        model is the largest source of error — see <Link href="/docs/limitations">limitations</Link>.
      </p>

      <h2>Motors</h2>
      <p>
        A <code>.ork</code> references a motor by manufacturer and designation but does not embed its
        thrust curve, so Loft resolves the motor against a bundled database of real RASP{" "}
        <code>.eng</code> curves from{" "}
        <a href="https://www.thrustcurve.org" target="_blank" rel="noopener noreferrer">
          ThrustCurve.org
        </a>{" "}
        (<code>lib/motors/</code>). Thrust is linearly interpolated in time; propellant mass is
        depleted in proportion to delivered impulse (constant-<em>I<sub>sp</sub></em> assumption), so
        motor mass falls from loaded to casing mass over the burn. Matching prefers an exact
        designation, then a class-and-thrust core (so a Cesaroni &ldquo;838J293-13A&rdquo; still
        resolves to &ldquo;J293&rdquo;), and the UI flags an approximate or failed match. A motor{" "}
        <em>cluster</em> (OpenRocket&apos;s cluster configuration, e.g. a &ldquo;4-ring&rdquo;) is
        flown as that many identical motors on the centreline — full thrust, propellant, and
        motor-tube mass — with the count shown on the motor tag. Where a design assigns different
        motors to separate mounts and only some resolve, the flight runs on the resolved ones and a
        warning reports the under-counted thrust.
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
        (<code>C<sub>d</sub>·A</code>). Descent drift is the canopy drifting with the wind; with the
        &ldquo;today&apos;s conditions&rdquo; re-run, the wind varies with altitude from the
        winds-aloft profile.
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
