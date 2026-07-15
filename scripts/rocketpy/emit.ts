/** Cross-validation harness (part 1 of 2): emit a RocketPy "spec" + Loft's own ballistic result
 *  for each design, so an independent 6-DOF engine can be diffed against our TS sim.
 *
 *  Two roles:
 *   1. Dev cross-check — diff Loft against RocketPy as we build the sim (any design you point it at).
 *   2. Generate the committed reference the app's Validation page shows to users — the RocketPy
 *      numbers for the bundled demo designs (marked `bundled`), written to
 *      fixtures/rocketpy-cross-check.json by run_rocketpy.py.
 *
 *  Neither this file nor RocketPy ships or runs in the browser; only the pre-computed reference
 *  numbers do. It reuses the real library (importers, mass, aero, motor DB, sim) so what RocketPy
 *  flies is exactly what Loft flies.
 *
 *  Run:  npx vitest run --config scripts/rocketpy/vitest.config.ts scripts/rocketpy/emit.ts
 *  then: scripts/rocketpy/run_rocketpy.py   (see README).
 *
 *  Scope: single-stage designs, ballistic ascent to apogee. RocketPy needs a Cd(Mach) curve (it
 *  does not derive total drag from geometry), so we feed it OURS — meaning the cross-check
 *  validates the integrator, the mass model, and RocketPy's independent Barrowman CP, holding
 *  drag equal. It is not an independent drag oracle (that is OpenRocket's stored per-step Cd).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import { adaptDesignXml } from "../../lib/ork/import";
import { aeroGeometry, dragCoefficient, barrowman } from "../../lib/sim/aero";
import { dryMassProperties } from "../../lib/sim/mass";
import { buildRocketDynamics } from "../../lib/sim/setup";
import { flattenRocket, referenceRadius, radiusAtStation } from "../../lib/model/geometry";
import { Atmosphere } from "../../lib/sim/atmosphere";
import { configChoices, runFlight, overridesFromStored } from "../../lib/sim/run";
import type { OrkDocument } from "../../lib/ork/import";
import type { MotorConfiguration } from "../../lib/model/types";

const OUT = resolve(__dirname, "out");
const FIXTURES_SRC = resolve(__dirname, "../../fixtures/src");
// Directory of external design XML to cross-check (OpenRocket's own GPL examples, unpacked from
// their .ork — not bundled here, dev-only). Override with LOFT_ORK_DIR; see README.
const ORKS = process.env.LOFT_ORK_DIR ?? "/tmp/orkxml";

interface Design {
  /** Stable key: the out/ basename and the reference key. */
  key: string;
  /** A bundled demo fixture XML in fixtures/src/ (in-repo) — its RocketPy numbers become the
   *  committed reference the Validation page shows. */
  fixture?: string;
  /** An external design XML in LOFT_ORK_DIR (dev-only, not committed). */
  file?: string;
  /** Config selector: a substring of a motor designation, to pick which configuration to fly. */
  motor?: string;
  /** Include this design in the committed fixtures/rocketpy-cross-check.json reference. */
  bundled?: boolean;
}

const DESIGNS: Design[] = [
  // Bundled MIT demo designs → committed reference, shown to users on the Validation page.
  // A spread of regimes: a subsonic G, a mid-power H, and a transonic K.
  { key: "demo-multi-config", fixture: "demo-multi-config.ork.xml", motor: "G40", bundled: true },
  { key: "demo-single-deploy", fixture: "demo-single-deploy.ork.xml", bundled: true },
  { key: "demo-dual-deploy", fixture: "demo-dual-deploy.ork.xml", bundled: true },
  // External OpenRocket GPL examples (dev-only; provide via LOFT_ORK_DIR). Not committed.
  { key: "simple_v1.0", file: "simple_v1.0.xml", motor: "C6" },
  { key: "APEX_v1.6", file: "APEX_v1.6.xml" },
  { key: "elliptical_v1.9", file: "elliptical_v1.9.xml" },
];

/** Map our nose-shape names to RocketPy's kind strings. */
const NOSE_KIND: Record<string, string> = {
  ogive: "ogive",
  conical: "conical",
  ellipsoid: "elliptical",
  power: "powerseries",
  parabolic: "parabolic",
  haack: "lvhaack",
};

function sampleCd(rocket: Parameters<typeof aeroGeometry>[0]): number[][] {
  const geom = aeroGeometry(rocket);
  const atm = new Atmosphere().sample(0);
  const out: number[][] = [];
  for (let m = 0; m <= 3.0001; m += 0.05) {
    const v = m * atm.speedOfSound;
    const cd = m === 0 ? dragCoefficient(geom, atm, 0.01).cd : dragCoefficient(geom, atm, v).cd;
    out.push([Number(m.toFixed(3)), Number(cd.toFixed(4))]);
  }
  return out;
}

function buildSpec(doc: OrkDocument, config: MotorConfiguration, simIndex: number) {
  const rocket = doc.rocket;
  const dry = dryMassProperties(rocket);
  const refR = referenceRadius(rocket);
  const flat = flattenRocket(rocket);
  const { motors } = buildRocketDynamics(rocket, config);

  // Aerodynamic surfaces (nose, transitions, fins). Body tubes of constant radius add no CP.
  let nose: Record<string, unknown> | null = null;
  const tails: Record<string, unknown>[] = [];
  const fins: Record<string, unknown>[] = [];
  for (const p of flat) {
    const c = p.component;
    if (c.kind === "nosecone") {
      nose = { length: c.length, kind: NOSE_KIND[c.shape] ?? "ogive", baseRadius: c.aftRadius, position: p.xFore };
    } else if (c.kind === "transition") {
      tails.push({ topRadius: c.foreRadius, bottomRadius: c.aftRadius, length: c.length, position: p.xFore });
    } else if (c.kind === "trapezoidfinset") {
      fins.push({
        kind: "trapezoidal", n: c.finCount, rootChord: c.rootChord, tipChord: c.tipChord,
        span: c.height, sweepLength: c.sweepLength, position: p.xFore,
        radius: radiusAtStation(rocket, p.xFore) || refR,
      });
    } else if (c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
      // Approximate: elliptical fins directly; a freeform reduces to an equal-area trapezoid.
      const chord = c.height > 0 ? c.area / c.height : c.rootChord;
      fins.push({
        kind: c.kind === "ellipticalfinset" ? "elliptical" : "trapezoidal",
        n: c.finCount, rootChord: c.rootChord || chord, tipChord: Math.max(0, 2 * chord - (c.rootChord || chord)),
        span: c.height, sweepLength: c.sweepLength, position: p.xFore,
        radius: radiusAtStation(rocket, p.xFore) || refR,
      });
    }
  }

  // Single motor (or cluster → aggregate as one equivalent thrust curve × count).
  const m0 = motors[0];
  const motorLen = m0 ? m0.curve.lengthMm / 1000 : 0;
  const count = motors.length;
  // Sum identical coaxial curves for a cluster: N× thrust, N× masses, same time base.
  const samples = m0 ? m0.curve.samples.map((s) => [Number(s.t.toFixed(4)), Number((s.thrust * count).toFixed(3))]) : [];
  const motor = m0
    ? {
        designation: m0.curve.designation,
        thrust: samples,
        burnTime: m0.curve.burnTime,
        propMass: m0.curve.propMass * count,
        dryMass: m0.curve.dryMass * count,
        diameter: m0.curve.diameterMm / 1000,
        length: motorLen,
        // Nozzle (motor origin) location on the rocket, from the nose tip.
        position: m0.cg + motorLen / 2,
      }
    : null;

  const cond = doc.simulations[simIndex]?.conditions;
  const atm0 = new Atmosphere().sample(0);
  const environment = {
    elevation: cond?.launchAltitude ?? 0,
    temperatureK: cond?.baseTempK ?? 288.15,
    pressurePa: cond?.basePressurePa ?? 101325,
    // Zero wind on both sides: the cross-check is an ascent-physics diff (integrator, drag, mass,
    // CP), and a light crosswind barely moves the vertical apogee but would be a needless confound.
    windMps: 0,
    railLength: cond?.rodLength ?? 1,
    inclinationDeg: 90 - (cond?.rodAngleDeg ?? 0),
    headingDeg: cond?.rodDirectionDeg ?? 0,
  };

  // Roll inertia estimate (thin shell ≈ m r²); pitch/yaw from our mass model about the dry CG.
  const rollInertia = dry.mass * refR * refR;

  return {
    name: doc.rocket.name,
    motorDesignation: motor?.designation ?? null,
    speedOfSound0: atm0.speedOfSound,
    environment,
    rocket: {
      radius: refR,
      mass: dry.mass,
      cgNoMotor: dry.cg,
      inertia: [dry.inertia, dry.inertia, rollInertia],
      cp: barrowman(rocket).cp,
      cdPowerOff: sampleCd(rocket),
      cdPowerOn: sampleCd(rocket),
      nose,
      tails,
      fins,
    },
    motor,
  };
}

test("emit RocketPy specs + Loft results", () => {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  for (const d of DESIGNS) {
    // Resolve the design XML: a bundled fixture (in-repo) or an external file (dev-only).
    const path = d.fixture ? resolve(FIXTURES_SRC, d.fixture) : resolve(ORKS, d.file!);
    if (!existsSync(path)) {
      console.log(`SKIP ${d.key} (not found at ${path}${d.file ? " — set LOFT_ORK_DIR" : ""})`);
      continue;
    }
    const doc = adaptDesignXml(readFileSync(path, "utf-8"));
    if (doc.rocket.stages.length > 1) {
      console.log(`SKIP ${d.key} (multi-stage — first cut is single-stage only)`);
      continue;
    }
    const choices = configChoices(doc);
    const choice = d.motor ? choices.find((c) => c.motors.some((m) => m.includes(d.motor!))) : choices[0];
    if (!choice) {
      console.log(`SKIP ${d.key} (no config)`);
      continue;
    }
    const sim = doc.simulations[choice.simIndex];
    const config = doc.rocket.configurations.find((c) => c.id === sim.conditions.configId)!;
    const overrides = overridesFromStored(sim);
    // Real flight (recovery + stored wind) — its apogee is what the OpenRocket-stored number is
    // comparable to, since OpenRocket also flew the recovery.
    const run = runFlight(doc.rocket, { configId: sim.conditions.configId, overrides });
    if (!run.hasPropulsion) {
      console.log(`SKIP ${d.key} (motor "${choice.motors.join(",")}" didn't resolve)`);
      continue;
    }
    // Ballistic flight for the RocketPy cross-check: recovery stripped and wind zeroed, so Loft
    // coasts to its true ballistic apogee under the same conditions RocketPy flies. (Comparing
    // Loft's recovery-truncated apogee against RocketPy's terminate_on_apogee would be
    // apples-to-oranges whenever an ejection charge fires before apogee, e.g. a short C6 delay.)
    const ballistic = runFlight(doc.rocket, { configId: sim.conditions.configId, overrides, ballistic: true }).result;

    const spec = buildSpec(doc, config, choice.simIndex);
    const loft = {
      apogee: ballistic.summary.apogee,
      maxVelocity: ballistic.summary.maxVelocity,
      maxMach: ballistic.summary.maxMach,
      timeToApogee: ballistic.summary.timeToApogee,
      railExitVelocity: ballistic.summary.railExitVelocity,
      staticMarginCal: ballistic.staticMarginCal,
    };
    // The real (recovery-flown) apogee, for context — differs from the ballistic apogee only when
    // recovery deploys before apogee (an early ejection), which is exactly the case worth seeing.
    const realApogee = run.result.summary.apogee;
    const stored = sim.hasResults
      ? { apogee: sim.results.maxAltitude, maxVelocity: sim.results.maxVelocity }
      : null;
    writeFileSync(resolve(OUT, `${d.key}.spec.json`), JSON.stringify(spec, null, 2));
    writeFileSync(
      resolve(OUT, `${d.key}.loft.json`),
      JSON.stringify({ key: d.key, bundled: !!d.bundled, config: choice.motors.join(","), name: doc.rocket.name, loft, realApogee, stored }, null, 2),
    );
    console.log(`emitted ${d.key}: motor=${spec.motorDesignation} ballisticApogee=${loft.apogee.toFixed(0)}m realApogee=${realApogee.toFixed(0)}m storedApogee=${stored?.apogee?.toFixed(0) ?? "-"}${d.bundled ? " [bundled]" : ""}`);
  }
});
