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

      <QA q="Does it work offline?">
        <p>
          Yes — once loaded, install it or just revisit and it runs with no connection: the app, the
          motor database, the simulation, and the bundled sample designs are all client-side, cached
          for the pad. Only the live-weather re-run needs a signal.
        </p>
      </QA>

      <QA q="What about RocketPy?">
        <p>
          Planned. Loft&apos;s simulation core is deliberately format-agnostic — importers are thin
          adapters into one internal model — so a RocketPy importer is future work that plugs into the
          same engine, not a rewrite.
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
