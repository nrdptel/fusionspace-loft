/** Orchestration the UI calls: pick a motor configuration, assemble conditions (optionally
 *  from a stored simulation so a comparison is apples-to-apples, or from live weather), run
 *  the flight, and optionally validate against the design's stored OpenRocket results. */

import type { Rocket, MotorConfiguration } from "../model/types";
import type { OrkDocument, StoredSimulation } from "../ork/adapt";
import { flattenRocket } from "../model/geometry";
import { applyGeometryEdits, hasGeometryEdits, type GeometryEdits } from "../model/edit";
import type { PointMass } from "./mass";
import { simulate, type FlightResult, type StagePhase } from "./simulate";
import { buildSimulateInput, makeConditions, type MotorResolution, type ConditionOverrides } from "./setup";
import { Atmosphere, atmosphereForGround } from "./atmosphere";
import { compareToStored, type ValidationReport } from "../validation/compare";

export interface FlightRun {
  result: FlightResult;
  config: MotorConfiguration;
  resolutions: MotorResolution[];
  /** True if at least one motor resolved to a real thrust curve. When false the flight has no
   *  propulsion, so its numbers are meaningless and callers should withhold them rather than
   *  present a zero-altitude "flight". */
  hasPropulsion: boolean;
  /** Every motor the configuration calls for resolved to a real thrust curve, so the vehicle that
   *  was flown is the vehicle the design describes.
   *
   *  **This, not `hasPropulsion`, is the predicate the LOADED figures need.** `hasPropulsion` is
   *  `some(match)` — one resolved motor out of three makes it true — but `lib/sim/setup.ts` skips an
   *  unmatched instance entirely, so it contributes neither mass nor CG. Liftoff mass, burnout mass,
   *  the loaded CG and the static margin are then all measuring a rocket with empty tubes, and the
   *  margin errs in the REASSURING direction because the missing mass is aft: measured on
   *  `demo-single-deploy.ork` with its one motor unresolvable, 4.065 cal → 5.921 cal, +46%.
   *
   *  The asymmetry is the dangerous half. A genuinely marginal design reading low will never trip
   *  the under-1-caliber warning on this path, because the bias pushes it up and out of the branch —
   *  so the figure is not merely wrong, the check on it is suppressed.
   *
   *  **A design with NO motor assigned is `false`, and that is not pedantry.** `every()` over an
   *  empty resolution list is vacuously TRUE, so a bare `allMotorsResolved` would have re-published
   *  every figure this predicate exists to withhold on exactly the emptiest case — the one
   *  `NoPropulsionNotice` has a whole branch for ("This configuration has no motor assigned"). It
   *  is conjoined with `hasPropulsion` so that "complete" means *the motors are all here AND there
   *  are some*, which is what every surface reading it actually needs. */
  motorsComplete: boolean;
  /** The staging timeline the flight actually flew: one entry per phase, in time order, each naming
   *  when it began and how many stages were still attached. `buildRocketDynamics` has always built
   *  this and `simulate` has always consumed it, but nothing carried it back out — so no surface
   *  could show the phases of a staged flight. One entry ⇒ nothing ever separated. */
  phases: StagePhase[];
  validation?: ValidationReport;
}

export function pickConfig(rocket: Rocket, configId?: string): MotorConfiguration | undefined {
  if (configId) {
    const c = rocket.configurations.find((cfg) => cfg.id === configId);
    if (c) return c;
  }
  if (rocket.defaultConfigId) {
    const c = rocket.configurations.find((cfg) => cfg.id === rocket.defaultConfigId);
    if (c) return c;
  }
  return rocket.configurations.find((c) => c.instances.length > 0) ?? rocket.configurations[0];
}

/** Build condition overrides from a stored simulation's launch conditions, so Loft flies the
 *  design under the same setup OpenRocket used. */
export function overridesFromStored(sim: StoredSimulation): ConditionOverrides {
  const c = sim.conditions;
  let atmosphere: Atmosphere | undefined;
  if (c.baseTempK && c.basePressurePa && c.launchAltitude !== undefined) {
    atmosphere = atmosphereForGround(c.launchAltitude, c.baseTempK, c.basePressurePa);
  }
  return {
    rodLength: c.rodLength,
    rodAngleDeg: c.rodAngleDeg,
    rodAzimuthDeg: c.rodDirectionDeg,
    windSpeed: c.windSpeed,
    launchAltitude: c.launchAltitude,
    atmosphere,
  };
}

export interface RunOptions {
  configId?: string;
  overrides?: ConditionOverrides;
  /** If provided, validate against this stored simulation's results. */
  validateAgainst?: StoredSimulation;
  /** Fly to the true *ballistic* apogee: strip recovery and zero the wind. The rocket coasts
   *  unimpeded to the top instead of having its climb capped by an early ejection, and the
   *  vertical apogee isn't nudged by a crosswind. Used by the RocketPy cross-check so an
   *  independent engine (which flies ballistic to apogee) is compared like-for-like; not for
   *  ordinary flights, whose recovery and wind are part of the real trajectory. */
  ballistic?: boolean;
  /** Override the boost/coast integration step (s). Defaults to the solver's own step; used by
   *  convergence checks that need to vary it. */
  timeStep?: number;
  /** "What-if" ballast added to the nose (kg): extra weight the flyer is considering to trim
   *  stability or apogee. Modelled as a point mass at the nose cone, so it shifts the CG forward
   *  and the whole vehicle heavier. 0/undefined leaves the design unchanged. */
  ballastKg?: number;
  /** "What-if" motor swap: fly the design on a different motor than the one it carries. Replaces
   *  the motor in every instance of the flown configuration (a cluster keeps its count), so the
   *  flyer can compare motors without editing the file. Undefined flies the design's own motor. */
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  /** Builder edits: fly the design with resized geometry (fin span, nose/body length). Rebuilds the
   *  vehicle before flight, so mass, aerodynamics (centre of pressure, stability), and drag all
   *  reflect the change. Undefined/empty flies the design's own geometry. */
  geometry?: GeometryEdits;
  /** Scale every motor's thrust (and total impulse) — a motor's lot-to-lot impulse tolerance.
   *  Defaults to 1 (the design's rated curve); used by the Monte-Carlo dispersion. */
  thrustScale?: number;
  /** Scale the airframe's dry structural mass — build-to-build mass variation. Defaults to 1;
   *  used by the Monte-Carlo dispersion. */
  massScale?: number;
  /** Scale the aerodynamic drag coefficient — the drag model's own uncertainty. Defaults to 1;
   *  used by the Monte-Carlo dispersion. */
  dragScale?: number;
  /** "What-if" scale on every deployed recovery device's drag area (Cd·A). A flyer sizing recovery
   *  can try a bigger or smaller canopy — >1 slows the descent and drifts farther, <1 the reverse —
   *  without editing the file, and see the effect on descent rate, drift, deployment speed, and
   *  landing. 1/undefined flies the design's own recovery. Ignored on a ballistic run (which strips
   *  recovery entirely). Pairs with the recovery-sizing readout, which names the size for a target
   *  landing speed. */
  recoveryCdScale?: number;
}

/** Apply a what-if motor swap to a configuration: every instance flies the chosen motor, keeping
 *  its mount, cluster count, ignition timing, and (for recovery) ejection delay. */
function swapMotor(config: MotorConfiguration, swap: NonNullable<RunOptions["motorSwap"]>): MotorConfiguration {
  return {
    ...config,
    instances: config.instances.map((i) => ({
      ...i,
      motor: {
        ...i.motor,
        manufacturer: swap.manufacturer,
        designation: swap.designation,
        diameter: swap.diameter ?? i.motor.diameter,
      },
    })),
  };
}

/** Where nose ballast sits: inside the frontmost nose cone (its mid-length), or the very front of
 *  the airframe if the design somehow has no nose. Returns the station from the nose tip (m). */
export function noseBallastStation(rocket: Rocket): number {
  const nose = flattenRocket(rocket).find((p) => p.component.kind === "nosecone");
  return nose ? nose.xFore + nose.length / 2 : 0;
}

/** Run a flight for a canonical rocket. */
export function runFlight(rocket: Rocket, opts: RunOptions = {}): FlightRun {
  // Builder geometry edits (resized fins, nose, or body) rebuild the model before anything else, so
  // mass, aerodynamics, and the flight all see the edited design.
  const design = opts.geometry && hasGeometryEdits(opts.geometry) ? applyGeometryEdits(rocket, opts.geometry) : rocket;
  const picked = pickConfig(design, opts.configId);
  if (!picked) {
    throw new Error("This design has no motor configuration to simulate.");
  }
  const config = opts.motorSwap ? swapMotor(picked, opts.motorSwap) : picked;
  let conditions = makeConditions(opts.overrides);
  if (opts.ballistic) {
    conditions = { ...conditions, windSpeed: 0, windTo: 0, windProfile: undefined };
  }
  const built = buildSimulateInput(design, config, conditions);
  const resolutions = built.resolutions;
  // Recovery-size what-if: scale every deployed device's drag area. Applied to the built recovery
  // before the flight, so descent rate, drift, and deployment speed all reflect the resized canopy.
  // (A ballistic run strips recovery below, so this only affects a real flight.)
  if (opts.recoveryCdScale !== undefined && opts.recoveryCdScale > 0 && opts.recoveryCdScale !== 1) {
    built.input.recovery = built.input.recovery.map((d) => ({ ...d, cdA: d.cdA * opts.recoveryCdScale! }));
  }
  // A ballistic run drops every recovery device so the coast runs to the true apogee.
  const extraMasses: PointMass[] =
    opts.ballastKg && opts.ballastKg > 0
      ? [{ mass: opts.ballastKg, cg: noseBallastStation(design), ownInertia: 0, source: "Nose ballast" }]
      : [];
  const withExtras = extraMasses.length ? { ...built.input, extraMasses } : built.input;
  const scaled =
    (opts.thrustScale !== undefined && opts.thrustScale !== 1) ||
    (opts.massScale !== undefined && opts.massScale !== 1) ||
    (opts.dragScale !== undefined && opts.dragScale !== 1)
      ? {
          ...withExtras,
          ...(opts.thrustScale !== undefined && opts.thrustScale !== 1 ? { thrustScale: opts.thrustScale } : {}),
          ...(opts.massScale !== undefined && opts.massScale !== 1 ? { massScale: opts.massScale } : {}),
          ...(opts.dragScale !== undefined && opts.dragScale !== 1 ? { dragScale: opts.dragScale } : {}),
        }
      : withExtras;
  const base = opts.timeStep ? { ...scaled, timeStep: opts.timeStep } : scaled;
  const input = opts.ballistic ? { ...base, recovery: [] } : base;
  const result = simulate(input);
  // Optimum ejection delay must reflect the true (ballistic) apogee — a stable property of the
  // rocket, motor, and launch conditions, not the delay actually flown. When a too-short delay
  // opens the canopy before apogee, the primary run's coast is cut short, so its apogee time (and
  // the optimum delay derived from it) reads low — which would recommend an even shorter delay,
  // compounding the mistake. Recompute it from a recovery-free coast under the same conditions.
  //
  // Recomputed from `input` — the flight that was actually flown — and NOT from `built.input`, which
  // is the raw build before any of the caller's options were folded in. Reading the raw one dropped
  // `extraMasses` (the flyer's nose ballast), `thrustScale`, `massScale`, `dragScale` and `timeStep`
  // silently, so the delay on screen belonged to a different vehicle than every other number beside
  // it. Measured on `The Red Hunter.ork`, which deploys before apogee and so takes this branch: the
  // delay sat at exactly 4.66 s for ballast 0, 0.01, 0.02, 0.05 and 0.1 kg while apogee fell
  // 258.5 → 147.4 m. The correct figures are 4.66 / 4.99 / 5.20 / 5.31 / 4.58 — so at 0.05 kg a
  // flyer was told 4.66 s for a rocket that wants 5.31, on a number they set on the motor itself.
  // `input` is `base` on this branch (the ballistic strip is the other one), so this is the same
  // flight minus its recovery, which is exactly the quantity the comment above describes.
  if (!opts.ballistic && result.deployedBeforeApogee && input.recovery.length > 0) {
    const freeCoast = simulate({ ...input, recovery: [] });
    result.summary.optimumDelay = freeCoast.summary.optimumDelay;
  }
  const hasPropulsion = resolutions.some((r) => r.match !== null);
  // A motor the bundled database doesn't carry is a hole in LOFT, not a disagreement with the
  // design tool. The flight still runs — on the motors that did resolve, with the rest **left out of
  // the build entirely** — and it is warned about loudly, but comparing it to results the file
  // stored for the COMPLETE vehicle reports Loft's missing curve as an accuracy gap. On a two-stage
  // RASAero design whose booster motor isn't bundled that reads as −36% on apogee, which is a
  // statement about the motor database and nothing else. Withhold it, the same way a reduced
  // vehicle's is withheld.
  //
  // ("riding as dead mass" is what this comment used to say, and it was wrong: `setup.ts` pushes the
  // resolution and then `continue`s on no match, so an unmatched motor contributes neither thrust
  // NOR mass. That mistaken belief is why the loaded figures were published on this path at all.)
  const allMotorsResolved = resolutions.every((r) => r.match !== null);
  // A no-thrust run "flies" to zero apogee; comparing that to stored results yields a
  // meaningless −100%, so skip validation entirely unless the flight actually had propulsion.
  // A ballistic run flew a different (recovery-stripped) trajectory than the stored one describes,
  // so its stored comparison would be misleading — skip it there too.
  const validation =
    !opts.ballistic && hasPropulsion && allMotorsResolved && opts.validateAgainst && opts.validateAgainst.hasResults
      ? compareToStored(result.summary, opts.validateAgainst.results)
      : undefined;
  return {
    result,
    config,
    resolutions,
    hasPropulsion,
    motorsComplete: hasPropulsion && allMotorsResolved,
    phases: built.input.phases ?? [],
    validation,
  };
}

/** A stored simulation offered as a selectable flight configuration in the UI. */
export interface ConfigChoice {
  /** Index into `doc.simulations`. */
  simIndex: number;
  /** Unique motor designations for this configuration, e.g. ["H128W"] or ["K550W", "I211W"]. */
  motors: string[];
  /** OpenRocket's stored apogee (m AGL) for this simulation, if it carries results. */
  storedApogeeM?: number;
  /** The simulation's name (e.g. "H128W", "Simulation 3 - too short delay"). */
  name: string;
  /** The source tool's own status for this run — `outdated`, `notsimulated`, `external`, … — so a
   *  surface quoting its stored apogee can say whether the tool stands behind it. */
  status?: string;
}

/** The design's stored simulations as selectable configurations, each labelled by its motor(s)
 *  and OpenRocket's stored apogee. A design with two or more lets the UI offer a picker; with
 *  one (or none) there is nothing to choose. Order matches `doc.simulations`. */
export function configChoices(doc: OrkDocument): ConfigChoice[] {
  return doc.simulations.map((sim, simIndex) => {
    const cfg = doc.rocket.configurations.find((c) => c.id === sim.conditions.configId);
    const motors = cfg
      ? [...new Set(cfg.instances.map((i) => i.motor.designation).filter(Boolean))]
      : [];
    const apo = sim.results.maxAltitude;
    return {
      simIndex,
      motors,
      storedApogeeM: sim.hasResults && Number.isFinite(apo) ? apo : undefined,
      name: sim.name,
      status: sim.status,
    };
  });
}

/** Run straight from an imported document: pick the config that matches the first stored
 *  sim (or the default), fly under the stored conditions, and validate. */
export function runFromDocument(doc: OrkDocument, opts: RunOptions = {}): FlightRun {
  const firstSim = doc.simulations[0];
  const overrides = opts.overrides ?? (firstSim ? overridesFromStored(firstSim) : undefined);
  // When Loft flew a simplified vehicle (staging/pods/parallel/cluster dropped), the stored
  // results describe a different flight, so an accuracy comparison would be misleading — skip it.
  const validateAgainst = opts.validateAgainst ?? (doc.flownAsReduced ? undefined : firstSim);
  // Everything else the caller asked for, forwarded rather than named.
  //
  // This used to list the three options below and nothing else, so the other NINE —
  // `ballistic`, `timeStep`, `ballastKg`, `motorSwap`, `geometry`, `thrustScale`, `massScale`,
  // `dragScale`, `recoveryCdScale` — were accepted by the signature and silently dropped. A caller
  // got a flight, with no error and no warning, that had ignored what it asked for: measured on
  // `03.Three-stage.ork`, `dragScale` 0.1 and 3.0 both returned exactly the same −7.57% apogee
  // error. Nothing user-facing depended on it because the app calls `runFlight` directly, but this
  // is the function the corpus suite drives, so no corpus-wide sensitivity to any of those nine
  // could be measured at all — which is R7's own instrument, broken.
  //
  // Spread-then-override, so a new option is forwarded the day it is added rather than the day
  // somebody notices. The three below are derived from the document when the caller omits them,
  // which is the whole reason this wrapper exists.
  return runFlight(doc.rocket, {
    ...opts,
    configId: opts.configId ?? firstSim?.conditions.configId,
    overrides,
    validateAgainst,
  });
}
