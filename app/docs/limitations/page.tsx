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
        The subsonic drag buildup is defensible but simplified: pressure drag on noses and shoulders
        is approximate, fin interference and surface-protuberance drag are lumped into a small flat
        allowance, and no boundary-layer transition point is solved. Because its drag is lower than a
        complete model&apos;s, Loft generally <em>over-predicts</em> apogee. Measured against
        OpenRocket&apos;s own &ldquo;A simple model rocket&rdquo; example, Loft came out about +11% to
        +43% high (worst on small, low-thrust, drag-dominated model rockets); larger, faster rockets
        where drag matters less should sit tighter. Always compare against your own design&apos;s
        stored OpenRocket numbers on the <Link href="/docs/validation">Validation</Link> page.
      </p>

      <h3>Transonic and supersonic drag are approximate</h3>
      <p>
        Above about Mach 0.8 the drag model leaves its validated envelope. It now follows the
        correct <em>shape</em> — a transonic drag rise to a peak near Mach 1.15, then a supersonic
        decline — with base drag switching to its supersonic form, rather than the earlier model
        whose drag grew without bound (badly over-stating drag, and under-stating apogee, for fast
        flights). But the wave-drag magnitude is a bounded parametric estimate scaled by fin
        thickness and slenderness, not a per-geometry wave-drag solution: there is no shock/CFD
        model and no shape-specific supersonic pressure distribution. Any flight above Mach 0.8 is
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

      <h3>Fin planforms beyond trapezoidal are reduced</h3>
      <p>
        Elliptical and freeform fin sets are reduced to an area- and span-equivalent trapezoid for
        both aerodynamics and mass. Tube fins are not yet modelled — a design that uses them is
        flown without those fins (with a visible warning), and because that isn&apos;t the whole
        vehicle, its OpenRocket comparison is withheld.
      </p>

      <h3>Single active stage, single motor</h3>
      <p>
        Multi-stage flights, air-starts, booster separation, parallel (strap-on) stages, and pods
        are not simulated; only the primary stack flies. A motor <em>cluster</em> is likewise flown
        as a single motor, so its thrust and mass are under-counted. None of these are dropped
        silently — a design that contains them is imported with a visible warning saying the flown
        vehicle isn&apos;t the whole design, and because the flown vehicle then differs from what
        the design&apos;s stored OpenRocket results describe, the{" "}
        <Link href="/docs/validation">OpenRocket-vs-Loft comparison</Link> is withheld for it rather
        than reported as a misleading error.
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
        device falls back to deploying at apogee.
      </p>

      <h3>Override-subcomponents is partial</h3>
      <p>
        A component&apos;s own mass/CG override is honoured. The OpenRocket
        &ldquo;override subcomponents&rdquo; flag (which makes an override subsume a subtree) is not
        fully applied, so a design that relies on it may double-count some mass.
      </p>

      <h3>Motor database is a curated subset</h3>
      <p>
        The bundled database covers a representative set of common motors across classes A–K —
        including the common Estes/Quest low-power motors and AeroTech F–K reloads — but not the
        entire ThrustCurve.org catalogue (that would bloat the offline bundle). If your motor
        isn&apos;t found, Loft says so rather than guessing; fuzzy matching by class-and-thrust core
        can, in
        rare cases, match a same-core motor of a different propellant. The resolved designation is
        always shown so you can check it. When <em>no</em> motor in a configuration resolves, there
        is no thrust to fly — Loft withholds the flight results, plots, and OpenRocket comparison
        entirely and names the motor it couldn&apos;t find, rather than showing a misleading
        zero-altitude &ldquo;flight.&rdquo; When a cluster resolves only <em>some</em> of its
        motors, the flight is simulated on those alone — so its thrust is under-counted and apogee
        and velocity read low — and a prominent warning says how many motors were missing.
      </p>

      <h3>Bundled sample designs use estimated stored figures</h3>
      <p>
        The two example <code>.ork</code> files ship with author-estimated stored results, not
        genuine OpenRocket runs (Loft can&apos;t generate those here). The bundled &ldquo;OpenRocket
        vs Loft&rdquo; comparison is therefore a demonstration; a real comparison uses your own file.
        See <Link href="/docs/validation">Validation</Link>.
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
