import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ — Loft",
  description: "Common questions about Loft, the browser flight simulator for high-power rocketry.",
};

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <>
      <h3>{q}</h3>
      {children}
    </>
  );
}

export default function Faq() {
  return (
    <>
      <h2>FAQ</h2>

      <QA q="What does Loft do?">
        <p>
          It imports an OpenRocket <code>.ork</code> design and simulates the flight in your browser
          — apogee, velocity, Mach, stability, and recovery — and compares against the numbers
          OpenRocket stored in the file. No accounts, no ads, no tracking.
        </p>
      </QA>

      <QA q="Is my design uploaded anywhere?">
        <p>
          No. Parsing, the motor database, and the whole simulation run on your device. Nothing about
          your design leaves the browser. The one optional network call is the &ldquo;re-fly for
          today&apos;s weather&rdquo; feature, which sends only a launch-site latitude/longitude to
          Open-Meteo — never your design.
        </p>
      </QA>

      <QA q="Can I trust it for a waiver or a cert flight?">
        <p>
          Treat every figure as an estimate to verify independently, not as authority. Loft shows the
          numbers and their assumptions; it never issues a go/no-go. The motor&apos;s printed data and
          your RSO are authoritative. See the <Link href="/docs/limitations">limitations log</Link>.
        </p>
      </QA>

      <QA q="Will my fins flutter?">
        <p>
          Loft estimates it. Fins have their own stiffness, and past a critical airspeed — the
          flutter boundary — they start to oscillate and can tear off, a leading cause of lost fins
          on fast flights. The stability panel shows a <em>Fin flutter (est.)</em> speed and the
          margin — how much headroom there is between that speed and the fastest the fins actually
          go — and Loft cautions when the margin is thin (keep it ≥ 1.5×) or warns outright when the
          peak airspeed is past the estimate. It uses the fin&apos;s planform, thickness, and
          material stiffness, checked against the real air density at every altitude the rocket
          climbs through. It&apos;s a preliminary-design estimate (the simplified NACA TN 4197
          method), good to roughly ±20% — so treat it as a &ldquo;design your fins with room to
          spare&rdquo; heuristic, not a guarantee. Neither OpenRocket nor RockSim reports it. See{" "}
          <Link href="/docs/methods">Methods</Link>.
        </p>
      </QA>

      <QA q="Why doesn't my apogee match OpenRocket exactly?">
        <p>
          Mostly the drag model. Loft&apos;s subsonic drag buildup is simpler than OpenRocket&apos;s,
          so it usually predicts a slightly higher apogee. Fast (transonic) flights differ more and
          are flagged as extrapolated. The <Link href="/docs/validation">Validation</Link> page shows
          the comparison on your own file; <Link href="/docs/methods">Methods</Link> explains the
          model.
        </p>
      </QA>

      <QA q="Which motors and file formats are supported?">
        <p>
          OpenRocket <code>.ork</code> files (and gzip-wrapped or raw OpenRocket XML) and RockSim{" "}
          <code>.rkt</code> files. Neither format embeds the motor&apos;s thrust curve — it&apos;s
          referenced by manufacturer and designation — so Loft resolves it against a bundled set of
          real ThrustCurve.org curves. If your motor isn&apos;t in the set, Loft tells you rather
          than guessing. RocketPy import is planned, not in yet.
        </p>
      </QA>

      <QA q="How does a RockSim .rkt import differ from an OpenRocket one?">
        <p>
          The flight itself is identical — both formats are translated into one internal model that
          the simulator flies, so the physics doesn&apos;t know which tool you drew in. The one
          difference is mass: a <code>.rkt</code> stores RockSim&apos;s own per-part masses, so Loft
          flies those exact figures rather than recomputing them from geometry (an <code>.ork</code>{" "}
          stores no per-part mass, so there Loft computes it). Each RockSim{" "}
          <em>stored simulation</em> becomes a selectable motor configuration, just like an
          OpenRocket flight configuration. See <Link href="/docs/methods">Methods</Link>.
        </p>
      </QA>

      <QA q="My design has several motor configurations — can I compare them?">
        <p>
          Yes. When a <code>.ork</code> carries more than one flight configuration (OpenRocket&apos;s
          stored simulations — say the same airframe on an H128W and a G40W), Loft shows a{" "}
          <em>motor configuration</em> picker above the results. Each entry is labelled with its
          motor(s) and the apogee OpenRocket stored for it; choosing one re-flies that configuration
          and compares against its own stored numbers, so you can see how each motor changes the
          flight. The bundled &ldquo;Motor comparison&rdquo; example shows it.
        </p>
      </QA>

      <QA q="Can I try the design on a different motor?">
        <p>
          Yes. Under <em>Conditions → Design what-if</em>, the <em>Motor</em> picker lists the
          bundled motors that fit this airframe&apos;s mount diameter, grouped by class. Choose one
          and Loft re-flies the same rocket on it, so you can compare apogee, speed, rail-exit
          velocity, and stability across motors without editing the file — the classic &ldquo;what
          would a J do here?&rdquo; A cluster keeps its motor count. A compact{" "}
          <em>What-if vs design</em> panel above the results shows each figure as the design&apos;s
          own value → the swapped value with the change, so the effect is legible at a glance.
          Because it&apos;s a hypothetical change, the OpenRocket comparison is hidden while a
          swapped motor is selected; pick &ldquo;Design motor&rdquo; to fly the original again.
        </p>
      </QA>

      <QA q="Can I compare all the motors that fit at once?">
        <p>
          Yes. Under the results, <em>Compare fitting motors</em> flies your airframe on every
          bundled motor that fits its mount diameter — all at once, on your device — and lays them
          out highest-apogee first: apogee, max speed, rail-exit velocity, thrust-to-weight,
          stability margin, and fin-flutter margin for each, with your design&apos;s own motor
          marked. It&apos;s the fast way
          to answer &ldquo;which motor gets me to my target?&rdquo; and to see the trade — a bigger
          motor climbs higher but sits heavier at the tail, trimming the stability margin, while
          rail-exit velocity and thrust-to-weight show which motors clear the rail cleanly and the
          flutter margin flags a punchier motor that would fly the fins toward their flutter speed. Any
          active nose-ballast or geometry what-if is applied to every motor, so you&apos;re comparing
          the design you&apos;re actually looking at. Each row is a ballistic ascent under the
          design&apos;s stored conditions — estimates to check against the motor&apos;s printed data
          and your rail, never a go/no-go.
        </p>
      </QA>

      <QA q="Can I see a whole range at once — a response curve?">
        <p>
          Yes. Under the results, <em>Sweep a parameter</em> varies one variable — fin span, fin
          thickness, nose length, body length, or nose ballast — across a range and plots how a metric
          responds: apogee, max speed, rail-exit velocity, stability margin, or fin-flutter margin,
          switchable on the y-axis. A marker shows the design&apos;s own value, so you can see at a
          glance where more span buys stability (and what it costs in apogee), how a longer body trades
          altitude for margin, exactly how much nose weight buys the margin you want — or, sweeping fin
          thickness against the flutter margin, the thinnest fin that still clears the flutter boundary
          with room to spare. It&apos;s the response curve behind a single edit — every other active
          what-if (a swapped motor, the other dimensions) is held fixed, so the curve isolates the
          one variable. Every point is a real ballistic flight run on your device; read them as
          estimates to verify, not a go/no-go.
        </p>
      </QA>

      <QA q="How high will it really go, and where will it land?">
        <p>
          Under the results, <em>Flight dispersion (Monte-Carlo)</em> flies the design a few hundred
          times with the motor impulse, rail angle, and wind jittered around their nominal values, and
          shows the <em>spread</em> instead of a single number: the apogee band you can expect (5th to
          95th percentile), the peak-speed band, and the radius from the pad that contains 95% of the
          landings — the recovery area to plan for. You set the one-sigma spread on each input, so the
          answer reflects your own conditions. The physics is the same trusted flight each time; the
          only thing that varies is the inputs, so it&apos;s an honest way to see how much your apogee
          and landing point move under real-world variability — a good gut-check against a waiver
          ceiling or a field boundary. It runs entirely on your device, and the same design with the
          same spreads reproduces the same result. It propagates only the inputs you set, layered on
          top of the model&apos;s own limitations (see the drag note), so read the bands as a spread,
          not an absolute guarantee.
        </p>
      </QA>

      <QA q="Can I see what adding nose weight would do?">
        <p>
          Yes. Under <em>Conditions → Design what-if</em>, enter a nose-ballast mass and Loft re-flies
          the design with that weight added at the nose cone — the classic trim for a marginally
          stable rocket. You&apos;ll see the centre of gravity move forward, the stability margin
          rise, and the apogee drop as the rocket flies heavier, so you can find how much weight buys
          the stability you want. A <em>What-if vs design</em> panel above the results spells out the
          trade — how many calibers of stability you gained and how much apogee it cost. Because
          it&apos;s a hypothetical change to the design, the
          OpenRocket comparison is hidden while ballast is set — the stored numbers describe the
          original rocket, not the ballasted one.
        </p>
      </QA>

      <QA q="Can I change the design's geometry and see what happens?">
        <p>
          Starting to. Under <em>Conditions → Design what-if</em>, the <em>Fin span</em>,{" "}
          <em>Fin count</em>, <em>Fin root</em>, <em>Fin tip</em> and <em>Fin sweep</em> (the
          trapezoidal fin&apos;s chords and leading-edge sweep), <em>Fin thickness</em>,{" "}
          <em>Nose length</em>, <em>Nose shape</em> (ogive, conical, ellipsoid, or a low-drag Haack /
          Von Kármán), <em>Body length</em>, and <em>Body diameter</em> fields start from the
          design&apos;s own
          dimensions; change any and Loft rebuilds the rocket and re-flies it — mass, drag, and the
          centre of pressure and stability all update, and a longer nose or body stretches the whole
          airframe (everything downstream shifts). Bigger fins — or more of them — move the CP aft
          and raise the stability margin (the classic trade against nose weight); reshaping the fin
          chords changes its planform area (and so its drag and centre of pressure); sweeping the fins
          back carries their lift aft, adding stability without any extra area; thicker fins drag more
          but raise the flutter margin sharply (it climbs with the cube of thickness), so it&apos;s
          the first knob to reach for when the <em>Fin flutter</em> estimate warns; a finer nose (a
          cone, or a Von Kármán) trims drag — a little subsonically through wetted area, more
          noticeably as the flight nears the speed of sound where nose shape drives the wave drag; a
          longer body adds material and weight; and widening the <em>Body diameter</em> scales the
          whole airframe to a new caliber (keeping the same fins, nose profile, and motor) — a fatter
          tube has more frontal area and skin, so it drags more and flies lower, and the fixed fins
          are proportionally smaller, trimming the stability margin. A <em>Surface finish</em> picker sets the whole airframe from
          mirror-smooth to rough — skin friction is a big share of subsonic drag, so &ldquo;what does
          a good paint job buy?&rdquo; can move the apogee noticeably. The results, the <em>What-if vs design</em> delta,
          and the RocketPy second opinion all reflect the edited geometry. It&apos;s the first step
          toward a full in-browser builder — editing a component&apos;s dimensions and re-simulating
          live. Because it&apos;s a change to the design, the OpenRocket comparison is hidden while
          any edit is set.
        </p>
      </QA>

      <QA q="Can I see where my rocket's mass comes from?">
        <p>
          Yes. Under the results, expand <em>Mass &amp; balance</em> for a part-by-part breakdown of
          the design&apos;s dry mass — every structural component with its weight, its share of the
          total, and its centre of gravity from the nose, heaviest first, adding up to the dry total
          and CG. These are the exact per-part masses the simulator flies, so it&apos;s the fastest
          way to sanity-check an import: a mistyped wall thickness or the wrong material shows up as a
          row that&apos;s obviously too heavy or too light. It&apos;s dry structure only — the motor
          and any what-if add their mass at launch. Where a section states a measured weight for its
          whole assembly, that figure stands in for everything inside it.
        </p>
      </QA>

      <QA q="Can I export the numbers?">
        <p>
          Yes. The motor sweep, the parameter sweep, and the mass &amp; balance breakdown each have a{" "}
          <em>Download CSV</em> button that saves the table to a file in your chosen units — the motor
          comparison, the full response curve (every metric across the swept range), or the
          part-by-part masses — ready to open in a spreadsheet. The file is built in your browser and
          saved straight to your device; nothing is uploaded.
        </p>
      </QA>

      <QA q="Can I check how Loft read my design?">
        <p>
          Yes. Under the results, expand <em>Design geometry</em> to see the component tree exactly as
          Loft parsed it — every part with its type, its station measured from the nose tip, and its
          key dimensions (lengths, diameters, and a fin set&apos;s chords and span). It&apos;s the
          fastest way to confirm the import matches what you drew: a wrong diameter, a missing part,
          or a fin in the wrong place stands out at a glance. Pair it with the <em>Mass &amp;
          balance</em> panel (which shows each part&apos;s weight) for the full picture of what the
          simulator is flying.
        </p>
      </QA>

      <QA q="Does it work offline?">
        <p>
          Yes — once loaded, install it or just revisit and it runs with no connection: the app, the
          motor database, the simulation, and the bundled sample designs are all client-side, cached
          for the pad. Only the live-weather re-run needs a signal.
        </p>
      </QA>

      <QA q="Can I get a second opinion from RocketPy?">
        <p>
          Yes. Under the results, <em>Second opinion: RocketPy</em> flies your design in{" "}
          <a href="https://github.com/RocketPy-Team/RocketPy" target="_blank" rel="noopener noreferrer">
            RocketPy
          </a>{" "}
          — a separate, independent 6-DOF engine — and shows its apogee, speed, and stability beside
          Loft&apos;s. RocketPy is Python, so it runs in your browser through a WebAssembly build
          (Pyodide) that downloads the first time you tap the button (~40 MB) and then runs entirely
          on your device — your design never leaves the browser. Both engines fly a ballistic ascent
          and share Loft&apos;s drag curve, so the comparison is a clean cross-check of the
          trajectory, mass, and stability model (the same method the{" "}
          <Link href="/docs/validation">Validation</Link> page uses on the bundled designs). Close
          agreement is reassuring; a gap is worth a look, not proof either engine is right.
        </p>
      </QA>

      <QA q="It couldn't read my file, or a part was skipped.">
        <p>
          Loft degrades gracefully: unknown components are skipped with a note rather than failing the
          whole import. If something&apos;s wrong or missing, please{" "}
          <a href="https://github.com/nrdptel/fusionspace-loft/issues" target="_blank" rel="noopener noreferrer">
            open an issue
          </a>{" "}
          with the file — it&apos;s the fastest way to get the parser improved.
        </p>
      </QA>

      <QA q="Is it really free / open source?">
        <p>
          Yes. MIT-licensed, part of{" "}
          <a href="https://fusionspace.co" target="_blank" rel="noopener noreferrer">
            Fusion Space
          </a>
          . Fork it, deploy your own, no attribution required. The point of the open repo is that the
          math is inspectable.
        </p>
      </QA>
    </>
  );
}
