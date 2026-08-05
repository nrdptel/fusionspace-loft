/** The `.ork` adapter: translate a parsed OpenRocket XML tree INTO the canonical rocket
 *  model, and pull out the stored simulation results (OpenRocket's own numbers) that the
 *  validation harness diffs against. This is the only module that knows what a `.ork` is;
 *  the simulator never sees it. A RocketPy adapter later would sit exactly here, producing
 *  the same `Rocket` from Python-defined objects.
 *
 *  Unknown component tags are collected as warnings and skipped, not thrown on. All values
 *  are converted to SI (the file is already SI for geometry; angles are converted from
 *  degrees where noted in the format reference). */

import type {
  Rocket,
  RocketComponent,
  Stage,
  SeparationEvent,
  SeparationSetting,
  Material,
  MaterialType,
  Placement,
  AxialMethod,
  NoseShape,
  SurfaceFinish,
  FinCrossSection,
  MotorConfiguration,
  MotorInstance,
  MotorSpec,
  MotorType,
  DeployEvent,
  DeploySetting,
} from "../model/types";
import { degToRad } from "../units";
import { parseXml, child, children, childText, childNum, parseNum, type XmlNode } from "./xml";
import { planformFromPoints, type FinPoint, type Planform } from "../model/planform";
import { ORK_PARACHUTE_CD, ORK_STREAMER_CD } from "../sim/recovery-defaults";

export interface StoredResults {
  maxAltitude?: number;
  maxVelocity?: number;
  maxAcceleration?: number;
  maxMach?: number;
  timeToApogee?: number;
  flightTime?: number;
  groundHitVelocity?: number;
  launchRodVelocity?: number;
  deploymentVelocity?: number;
  optimumDelay?: number;
}

/** One row of a design tool's stored per-step flight log — the values it recorded at one instant
 *  of its own simulation. Used to cross-check Loft's solver against the numbers the file already
 *  carries; the drag coefficient in particular is an independent per-step drag oracle. */
export interface StoredFlightPoint {
  time: number; // s
  altitude: number; // m AGL
  velocity: number; // m/s, total
  mach: number;
  /** Total (zero-lift) drag coefficient the design tool computed at this step. NaN if not stored. */
  cd: number;
}

/** The per-step flight log a design file stores from its own simulation, if any. A single branch
 *  (OpenRocket stores one per stage on a staged flight); the primary/longest one is taken. */
export interface StoredFlightData {
  /** Branch name as stored (e.g. "Main", "Sustainer"). */
  branch: string;
  points: StoredFlightPoint[];
}

export interface StoredConditions {
  configId?: string;
  rodLength?: number;
  rodAngleDeg?: number;
  rodDirectionDeg?: number;
  windSpeed?: number;
  windDirectionDeg?: number;
  launchAltitude?: number;
  baseTempK?: number;
  basePressurePa?: number;
}

export interface StoredSimulation {
  name: string;
  status?: string;
  /** WHICH QUANTITY `groundHitVelocity` above actually is, because the tool that wrote it changed
   *  its mind and the file does not say.
   *
   *  OpenRocket interpolates the stored attribute out of `TYPE_VELOCITY_TOTAL` at the `GROUND_HIT`
   *  event — logic that is byte-identical across every release — but what that series HOLDS during
   *  descent flipped between 23.09 and 24.12:
   *
   *    - **<= 23.09** `AbstractEulerStepper.java:168` does
   *      `data.setValue(TYPE_VELOCITY_TOTAL, airSpeed.length())` with
   *      `airSpeed = getRocketVelocity().add(windSpeed)` — the AIR-relative speed. Under an open
   *      canopy the rocket drifts with the air, so the horizontal term is ~0 and the figure is
   *      effectively the vertical descent rate.
   *    - **>= 24.12** that stepper contains no reference to the type at all (verified: zero
   *      occurrences), and `SimulationStatus.java:643` sets it from `getRocketVelocity().length()` —
   *      the GROUND-frame total, wind drift included. The same quantity RockSim stores.
   *
   *  Loft's own `groundHitVelocity` is the vertical descent rate, deliberately (wind moves the total
   *  without making the canopy any smaller). So comparing every `.ork` against it was right for the
   *  older era and wrong for the newer one, in a single direction — a total is never smaller than its
   *  own vertical component. Measured on this corpus: 27 stored simulations were written by 23.09 or
   *  earlier and 64 by 24.12 or later, so most of the OpenRocket census was on the wrong side of it.
   *
   *  Undefined where the creator string is missing or unparseable, which is honest rather than a
   *  guess: `lib/validation/compare.ts` then falls back to the older reading, the one Loft has always
   *  used and the one `COMPETITION.md` row 34 established empirically. */
  groundHitVelocityFrame?: "vertical" | "total";
  /** WHICH FLIGHT the stored `optimumDelay` describes — the same class of question as the frame
   *  above, on a metric where the two formats genuinely disagree.
   *
   *    - **OpenRocket stores the FREE-COAST delay.** Its `optimumdelay` attribute is the flight
   *      log's `timeToOptimumAltitude` minus the last burnout event — exact on 73 of 73 stored
   *      simulations in this corpus, where "apogee − burnout" matches only 56 of 73. Optimum
   *      altitude is the altitude the vehicle would have reached without a canopy, so an early
   *      deployment does not drag the figure down with it.
   *    - **RockSim stores the AS-FLOWN delay.** `<OptimalDelay>` is exactly
   *      `<TimeToApogee> − <TimeToBurnout>` of the run it sits in: 4.765 = 10.8263 − 6.06125,
   *      4.53 = 5.98125 − 1.45125, 1.34375 = 3.65375 − 2.31, 17.9325 = 20.2425 − 2.31. Every stored
   *      RockSim simulation in the corpus, to five decimal places.
   *
   *  `lib/sim/run.ts` substitutes a recovery-free coast whenever a device opened before apogee,
   *  which is right for a flyer and right for OpenRocket, and wrong here: `FullScaleModelTH.rkt`'s
   *  four `[L1940X-0]` runs open at burnout, so RockSim's own apogee is 3.65 s and its stored delay
   *  1.34 s, against Loft's free coast of 16.16 s. Four census rows comparing two different flights,
   *  which is the third time this milestone has found that shape.
   *
   *  Undefined means free-coast — the reading Loft has always used, and the correct one for the
   *  format that supplies most of the corpus. */
  optimumDelayBasis?: "free-coast" | "as-flown";
  /** Whether the writing tool says a recovery device actually deployed on THIS run.
   *
   *  A descent under a canopy and a descent with nothing out are different flights, and pooling them
   *  makes a census of "how close is Loft's landing speed" meaningless in both directions. Measured
   *  on this corpus: `FullScaleModelTH.rkt` stores 15 runs of one design — 4 with three devices out,
   *  landing at 8.8–9.2 m/s, and 11 plugged (`[L1940X-P]`) landing at 83–162 m/s. Eleven lawn darts
   *  were being averaged in with four canopy descents.
   *
   *  RockSim states it per device, as `<HasDeployed>` inside the `<SimulationEvents>` of each stored
   *  run. Scoping to that element is load-bearing: the same tag appears in `<Booster1Staging>` and
   *  `<Booster2Staging>`, which are STAGING events, and a file-wide grep pools those in.
   *
   *  `<FinalState>` corroborates it on 17 of 17 stored simulations in the corpus — 0 or 1 wherever a
   *  device deployed, 4 wherever none did — and is used only to tell "the file ran this and nothing
   *  came out" from "the file records no events at all". It is deliberately NOT the primary signal:
   *  it is an undocumented enum whose values would be guesswork, where `HasDeployed` says exactly
   *  what it says.
   *
   *  OpenRocket states it too, and the first version of this comment said it did not — an assumption
   *  that survived because the `.ork` importer reads `<flightdata>`'s summary ATTRIBUTES and had
   *  never looked inside its `<databranch>`. It keeps a per-step event timeline in there, and 77 of
   *  this corpus's 91 stored flights carry a `recoverydevicedeployment` event.
   *
   *  Undefined means that file states nothing — an `.ork` saved with summary results and no event
   *  log (14 here), or a `.rkt` with neither events nor a final state. The census counts those as
   *  their own population rather than assuming a canopy. */
  recoveryDeployed?: boolean;
  conditions: StoredConditions;
  results: StoredResults;
  hasResults: boolean;
  /** The design tool's own per-step flight log, when the file stores one — for cross-checking
   *  Loft's solver against the trajectory and drag the file already carries. Undefined when the
   *  file saved only summary results (or none). */
  flightData?: StoredFlightData;
}

export interface OrkDocument {
  rocket: Rocket;
  simulations: StoredSimulation[];
  formatVersion: string;
  creator?: string;
  /** Things Loft could NOT fully read: a part it skipped, a fin type it can't model, a dimension it
   *  had to guess. These are gaps, and the UI says so in as many words. */
  warnings: string[];
  /** Things Loft read fine and wants the flyer to know it did — how a staged design is flown, which
   *  figure a format without materials is using for mass. Explanations, not failures; showing them
   *  under "weren't fully understood" made a correct reading look like a broken one. */
  notes: string[];
  /** True when Loft flew a *simplified* version of the design — multi-stage, parallel/strap-on
   *  stages, pods, or a motor cluster reduced to a single motor. The stored OpenRocket results
   *  then describe a different flight than Loft simulated, so the accuracy comparison is withheld. */
  flownAsReduced: boolean;
}

const KNOWN_COMPONENTS = new Set([
  "nosecone",
  "bodytube",
  "transition",
  "trapezoidfinset",
  "ellipticalfinset",
  "freeformfinset",
  "tubefinset",
  "innertube",
  "tubecoupler",
  "centeringring",
  "bulkhead",
  "engineblock",
  "masscomponent",
  "parachute",
  "streamer",
  "shockcord",
  "launchlug",
  "railbutton",
]);

let idCounter = 0;
const nextId = (): string => `c${++idCounter}`;

function parseMaterial(node: XmlNode): Material | undefined {
  const m = child(node, "material");
  if (!m) return undefined;
  const type = (m.attrs.type as MaterialType) || "bulk";
  const density = parseNum(m.attrs.density, 0);
  return { name: m.text || "material", density, type };
}

function parseFinish(node: XmlNode): SurfaceFinish | undefined {
  const f = childText(node, "finish");
  if (!f) return undefined;
  switch (f) {
    case "rough":
      return "rough";
    case "unfinished":
      return "unfinished";
    case "normal":
      return "regular-paint";
    case "smooth":
      return "smooth-paint";
    case "polished":
      return "polished";
    default:
      return "regular-paint";
  }
}

/** Fin edge cross-section from an OpenRocket `<crosssection>` element. Absent ⇒ undefined,
 *  which the drag model treats as square (OpenRocket's own default). */
function parseFinCrossSection(node: XmlNode): FinCrossSection | undefined {
  const s = childText(node, "crosssection");
  switch (s) {
    case "square":
      return "square";
    case "rounded":
      return "rounded";
    case "airfoil":
      return "airfoil";
    default:
      return undefined;
  }
}

function parsePlacement(node: XmlNode): Placement {
  // Prefer <axialoffset method=...>; fall back to legacy <position type=...>; absence ⇒ after.
  const ax = child(node, "axialoffset");
  const pos = child(node, "position");
  const el = ax ?? pos;
  if (!el) return { method: "after", offset: 0 };
  const method = ((el.attrs.method || el.attrs.type || "after") as AxialMethod);
  const offset = parseNum(el.text, 0);
  const radialOffset =
    childNum(node, "radialposition", NaN) || childNum(node, "radiusoffset", NaN);
  return {
    method,
    offset,
    radialOffset: Number.isFinite(radialOffset) ? radialOffset : undefined,
  };
}

function parseShape(node: XmlNode): { shape: NoseShape; param: number } {
  const s = (childText(node, "shape") || "ogive") as NoseShape;
  const param = childNum(node, "shapeparameter", defaultShapeParam(s));
  return { shape: s, param };
}

function defaultShapeParam(s: NoseShape): number {
  if (s === "power") return 0.5;
  if (s === "parabolic") return 0.5;
  if (s === "haack") return 0; // Von Kármán
  return 0;
}

function overrides(node: XmlNode): Partial<RocketComponent> {
  const out: Partial<RocketComponent> = {};
  const om = childText(node, "overridemass");
  const oc = childText(node, "overridecg");
  if (om !== undefined) (out as { overrideMass?: number }).overrideMass = parseNum(om);
  if (oc !== undefined) (out as { overrideCGx?: number }).overrideCGx = parseNum(oc);
  const subMass = childText(node, "overridesubcomponentsmass") ?? childText(node, "overridesubcomponents");
  if (subMass === "true") (out as { overrideSubcomponents?: boolean }).overrideSubcomponents = true;
  return out;
}

function mapSeparationEvent(s: string | undefined): SeparationEvent | undefined {
  switch (s) {
    case "burnout":
      return "burnout";
    case "ejection":
      return "ejection";
    case "apogee":
      return "apogee";
    case "launch":
    case "ignition":
      return "launch";
    case "upperignition":
      return "upperignition";
    case "altitude":
      return "altitude";
    case "never":
      return "never";
    default:
      return undefined; // unknown / absent ⇒ Loft's serial-staging default
  }
}

function mapDeployEvent(s: string | undefined): DeployEvent {
  switch (s) {
    case "automatic":
    case "apogee":
      return "apogee";
    case "ejection":
      return "ejection";
    case "altitude":
      return "altitude";
    case "launch":
      return "launch";
    case "lowerstageseparation":
      return "lowerstage-separation";
    case "never":
      return "never";
    default:
      return "apogee";
  }
}

/** Per-configuration deployment overrides: OpenRocket writes a `<deploymentconfiguration
 *  configid=…>` for each motor config a recovery device deploys differently in (e.g. drogue at
 *  apogee in one config, main at a set altitude in another). Keyed by configuration id. */
function parseDeployConfigs(node: XmlNode): Record<string, DeploySetting> | undefined {
  const out: Record<string, DeploySetting> = {};
  for (const dc of children(node, "deploymentconfiguration")) {
    const cid = dc.attrs.configid;
    if (!cid) continue;
    out[cid] = {
      event: mapDeployEvent(childText(dc, "deployevent")),
      altitude: childNum(dc, "deployaltitude", 0) || undefined,
      delay: childNum(dc, "deploydelay", 0) || 0,
    };
  }
  return Object.keys(out).length ? out : undefined;
}

interface WalkContext {
  warnings: string[];
  /** Explanations of how the design was read, kept apart from the gaps above. */
  notes: string[];
  motorInstances: Array<{
    mountId: string;
    configId: string;
    spec: MotorSpec;
    ignitionEvent?: string;
    ignitionDelay?: number;
  }>;
}

function parseSubcomponents(node: XmlNode, ctx: WalkContext): RocketComponent[] {
  const sub = child(node, "subcomponents");
  if (!sub) return [];
  const out: RocketComponent[] = [];
  for (const c of sub.children) {
    const comp = parseComponent(c, ctx);
    if (comp) out.push(comp);
    else if (!KNOWN_COMPONENTS.has(c.name) && c.name !== "subcomponents") {
      ctx.warnings.push(`Skipped unsupported component: <${c.name}>`);
    }
  }
  return out;
}

function base(node: XmlNode) {
  return {
    id: childText(node, "id") || nextId(),
    name: childText(node, "name") || node.name,
    placement: parsePlacement(node),
    material: parseMaterial(node),
    finish: parseFinish(node),
    children: [] as RocketComponent[],
    ...overrides(node),
  };
}

function parseMotorMount(node: XmlNode, mountId: string, ctx: WalkContext): boolean {
  const mm = child(node, "motormount");
  if (!mm) return false;
  const overhang = childNum(mm, "overhang", 0) || 0;
  // Mount-level default ignition, used when a configuration carries no override.
  const defaultIgnEvent = childText(mm, "ignitionevent");
  const defaultIgnDelay = childNum(mm, "ignitiondelay", 0);
  // Per-configuration ignition overrides. A design can airstart a mount's motor at a different
  // delay in each configuration (one <ignitionconfiguration configid=…> block per config), which
  // is exactly how a staggered/airstart study is set up. Read them so the airstart timing is
  // honoured per configuration instead of being flattened to the mount default.
  const ignByConfig = new Map<string, { event?: string; delay: number }>();
  for (const ic of children(mm, "ignitionconfiguration")) {
    const cid = ic.attrs.configid;
    if (!cid) continue;
    const delay = childNum(ic, "ignitiondelay", 0);
    ignByConfig.set(cid, {
      event: childText(ic, "ignitionevent") || defaultIgnEvent,
      delay: Number.isFinite(delay) ? delay : 0,
    });
  }
  for (const motor of children(mm, "motor")) {
    const configId = motor.attrs.configid || "default";
    // OpenRocket writes `<delay>none</delay>` for a plugged motor — no ejection charge at all,
    // as flown with altimeter deployment. That is a different statement from a missing <delay>,
    // which says only that the design never pinned one.
    const delayText = (childText(motor, "delay") || "").trim().toLowerCase();
    const spec: MotorSpec = {
      manufacturer: childText(motor, "manufacturer"),
      designation: childText(motor, "designation") || "",
      type: (childText(motor, "type") as MotorType) || "unknown",
      diameter: childNum(motor, "diameter", 0),
      length: childNum(motor, "length", 0),
      digest: childText(motor, "digest"),
      delay: parseNum(childText(motor, "delay"), NaN),
      plugged: delayText === "none" || undefined,
    };
    if (spec.designation) {
      const ign = ignByConfig.get(configId);
      ctx.motorInstances.push({
        mountId,
        configId,
        spec,
        ignitionEvent: ign?.event ?? defaultIgnEvent,
        ignitionDelay: ign ? ign.delay : Number.isFinite(defaultIgnDelay) ? defaultIgnDelay : 0,
      });
    }
  }
  void overhang;
  return true;
}

/** OpenRocket's cluster configuration for an inner/body tube → the number of motors it holds.
 *  The preset names carry the count as a leading number ("3-tower", "4-ring", "4-square", …),
 *  plus the two non-numeric singles. Anything unrecognised is a single motor. */
function clusterCountOf(node: XmlNode): number {
  const s = (childText(node, "clusterconfiguration") ?? "").trim().toLowerCase();
  if (s === "" || s === "single") return 1;
  if (s === "double") return 2;
  const m = s.match(/^(\d+)/);
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

/** Build a mount's model role, carrying the cluster count when the tube holds more than one. */
function motorMountFrom(node: XmlNode): { overhang: number; clusterCount?: number } {
  const mm = child(node, "motormount");
  const overhang = mm ? childNum(mm, "overhang", 0) : 0;
  const n = clusterCountOf(node);
  return n > 1 ? { overhang, clusterCount: n } : { overhang };
}

function parseComponent(node: XmlNode, ctx: WalkContext): RocketComponent | null {
  const b = base(node);
  switch (node.name) {
    case "nosecone": {
      const { shape, param } = parseShape(node);
      return {
        ...b,
        kind: "nosecone",
        length: childNum(node, "length", 0),
        aftRadius: childNum(node, "aftradius", NaN), // NaN ⇒ "auto"/missing; resolved from neighbours below
        thickness: childNum(node, "thickness", 0) || undefined,
        shape,
        shapeParameter: param,
        aftShoulderLength: childNum(node, "aftshoulderlength", 0) || undefined,
        aftShoulderRadius: childNum(node, "aftshoulderradius", 0) || undefined,
        aftShoulderThickness: childNum(node, "aftshoulderthickness", 0) || undefined,
        aftShoulderCapped: childText(node, "aftshouldercapped") === "true",
        children: parseSubcomponents(node, ctx),
      };
    }
    case "bodytube": {
      const comp: RocketComponent = {
        ...b,
        kind: "bodytube",
        length: childNum(node, "length", 0),
        outerRadius: childNum(node, "radius", NaN), // NaN ⇒ "auto"/missing; resolved from neighbours below
        thickness: childNum(node, "thickness", 0) || undefined,
        children: [],
      };
      if (parseMotorMount(node, b.id, ctx)) comp.motorMount = motorMountFrom(node);
      comp.children = parseSubcomponents(node, ctx);
      return comp;
    }
    case "transition": {
      const { shape, param } = parseShape(node);
      return {
        ...b,
        kind: "transition",
        length: childNum(node, "length", 0),
        foreRadius: childNum(node, "foreradius", NaN), // NaN ⇒ "auto"; resolved from the fore neighbour below
        aftRadius: childNum(node, "aftradius", NaN), // NaN ⇒ "auto"; resolved from the aft neighbour below
        thickness: childNum(node, "thickness", 0) || undefined,
        shape,
        shapeParameter: param,
        foreShoulderLength: childNum(node, "foreshoulderlength", 0) || undefined,
        foreShoulderRadius: childNum(node, "foreshoulderradius", 0) || undefined,
        foreShoulderThickness: childNum(node, "foreshoulderthickness", 0) || undefined,
        foreShoulderCapped: childText(node, "foreshouldercapped") === "true",
        aftShoulderLength: childNum(node, "aftshoulderlength", 0) || undefined,
        aftShoulderRadius: childNum(node, "aftshoulderradius", 0) || undefined,
        aftShoulderThickness: childNum(node, "aftshoulderthickness", 0) || undefined,
        aftShoulderCapped: childText(node, "aftshouldercapped") === "true",
        children: parseSubcomponents(node, ctx),
      };
    }
    case "trapezoidfinset": {
      return {
        ...b,
        kind: "trapezoidfinset",
        finCount: Math.round(childNum(node, "fincount", childNum(node, "instancecount", 3))),
        rootChord: childNum(node, "rootchord", 0),
        tipChord: childNum(node, "tipchord", 0),
        height: childNum(node, "height", 0),
        sweepLength: childNum(node, "sweeplength", 0),
        thickness: childNum(node, "thickness", 0.003),
        crossSection: parseFinCrossSection(node),
        cantAngle: degToRad(childNum(node, "cant", 0) || 0),
        children: parseSubcomponents(node, ctx),
      };
    }
    case "tubefinset": {
      return {
        ...b,
        kind: "tubefinset",
        finCount: Math.round(childNum(node, "fincount", childNum(node, "instancecount", 6))),
        length: childNum(node, "length", 0),
        outerRadius: childNum(node, "radius", NaN), // NaN ⇒ "auto"; sized around the parent body below
        thickness: childNum(node, "thickness", 0.0005),
        children: parseSubcomponents(node, ctx),
      };
    }
    case "ellipticalfinset":
    case "freeformfinset": {
      const finCount = Math.round(childNum(node, "fincount", childNum(node, "instancecount", 3)));
      let rootChord = childNum(node, "rootchord", 0);
      let height = childNum(node, "height", 0);
      let area: number;
      let sweep = childNum(node, "sweeplength", 0) || 0;
      let cpChord: number | undefined;
      let points: FinPoint[] | undefined;
      if (node.name === "freeformfinset") {
        // A freeform fin defines its shape ONLY by <finpoints>; derive the span, root chord,
        // area, and sweep from the outline so it isn't treated as a zero-span (degenerate) fin,
        // and the exact chordwise CP so the aero doesn't have to reduce it to a trapezoid.
        const fp = freeformPlanform(node);
        points = freeformPoints(node);
        area = fp.area;
        sweep = fp.sweep;
        height = fp.span;
        rootChord = fp.rootChord;
        if (fp.cpChord > 0) cpChord = fp.cpChord;
      } else {
        area = (Math.PI / 4) * rootChord * height; // quarter-ellipse fin ≈ πab/4
      }
      return {
        ...b,
        kind: node.name,
        finCount,
        rootChord,
        area,
        height,
        points,
        sweepLength: sweep,
        thickness: childNum(node, "thickness", 0.003),
        crossSection: parseFinCrossSection(node),
        ...(cpChord !== undefined ? { cpChord } : {}),
        children: parseSubcomponents(node, ctx),
      };
    }
    case "innertube": {
      const outer = childNum(node, "outerradius", NaN); // NaN ⇒ "auto"; resolved from the enclosing tube
      const thickness = childNum(node, "thickness", 0);
      const comp: RocketComponent = {
        ...b,
        kind: "innertube",
        length: childNum(node, "length", 0),
        outerRadius: outer,
        innerRadius: Number.isFinite(outer) ? Math.max(0, outer - thickness) : NaN,
        children: [],
      };
      if (parseMotorMount(node, b.id, ctx)) comp.motorMount = motorMountFrom(node);
      comp.children = parseSubcomponents(node, ctx);
      return comp;
    }
    case "tubecoupler":
    case "centeringring":
    case "bulkhead":
    case "engineblock": {
      const outer = childNum(node, "outerradius", childNum(node, "radius", NaN)); // NaN ⇒ "auto"
      const thickness = childNum(node, "thickness", 0);
      const inner = childNum(
        node,
        "innerradius",
        node.name === "bulkhead" ? 0 : Number.isFinite(outer) ? Math.max(0, outer - thickness) : NaN,
      );
      return {
        ...b,
        kind: node.name,
        length: childNum(node, "length", 0),
        outerRadius: outer,
        innerRadius: inner,
        children: parseSubcomponents(node, ctx),
      };
    }
    case "masscomponent": {
      return {
        ...b,
        kind: "masscomponent",
        mass: childNum(node, "mass", 0),
        length: childNum(node, "packedlength", 0) || undefined,
        radius: childNum(node, "packedradius", 0) || undefined,
        massType: childText(node, "masscomponenttype"),
        children: [],
      };
    }
    case "parachute": {
      const diameter = childNum(node, "diameter", 0);
      const cdText = childText(node, "cd");
      // `auto` means "use OpenRocket's own default", so the fallback is a value the file
      // delegated rather than one Loft chose — see `ORK_PARACHUTE_CD` for the provenance and for
      // how often it is actually reached (17 of the corpus's 24 .ork canopies).
      const stated = cdText !== "auto" && cdText !== undefined && Number.isFinite(parseNum(cdText, NaN));
      const cd = stated ? parseNum(cdText, ORK_PARACHUTE_CD.cd) : ORK_PARACHUTE_CD.cd;
      const mass = parachuteMass(node, diameter);
      return {
        ...b,
        kind: "parachute",
        cd,
        cdFrom: stated ? ("file" as const) : ("default" as const),
        diameter,
        mass,
        deployEvent: mapDeployEvent(childText(node, "deployevent")),
        deployAltitude: childNum(node, "deployaltitude", 0) || undefined,
        deployDelay: childNum(node, "deploydelay", 0) || 0,
        deployConfigs: parseDeployConfigs(node),
        packedLength: childNum(node, "packedlength", 0) || undefined,
        packedRadius: childNum(node, "packedradius", 0) || undefined,
        children: [],
      };
    }
    case "streamer": {
      return {
        ...b,
        kind: "streamer",
        cd: parseNum(childText(node, "cd"), ORK_STREAMER_CD.cd),
        cdFrom: Number.isFinite(parseNum(childText(node, "cd"), NaN)) ? ("file" as const) : ("default" as const),
        stripLength: childNum(node, "striplength", 0),
        stripWidth: childNum(node, "stripwidth", 0),
        mass: streamerMass(node),
        deployEvent: mapDeployEvent(childText(node, "deployevent")),
        deployAltitude: childNum(node, "deployaltitude", 0) || undefined,
        deployDelay: childNum(node, "deploydelay", 0) || 0,
        deployConfigs: parseDeployConfigs(node),
        packedLength: childNum(node, "packedlength", 0) || undefined,
        children: [],
      };
    }
    case "shockcord":
    case "launchlug":
    case "railbutton": {
      // A launch lug carries its own outer <radius>; a rail button gives an <outerdiameter>.
      // Either is the fitting's frontal size, used for its protuberance drag.
      const lugRadius = childNum(node, "radius", NaN);
      const buttonRadius = childNum(node, "outerdiameter", NaN) / 2;
      const radius = Number.isFinite(lugRadius)
        ? lugRadius
        : Number.isFinite(buttonRadius)
          ? buttonRadius
          : undefined;
      const instanceCount = Math.max(1, Math.round(childNum(node, "instancecount", 1)));
      // OpenRocket stores these parts' material and geometry, not a mass, so their mass has to
      // be computed or it silently drops out of the total. A shock cord is deliberately a mass
      // component (a long tubular-nylon harness on a high-power rocket is far from negligible);
      // a lug/button is small but still real. An explicit <mass>, if present, still wins.
      const mass =
        node.name === "shockcord"
          ? shockcordMass(node)
          : lugMass(node, radius, childNum(node, "length", 0)) * instanceCount;
      // A shock cord's mass sits packed at its mount over the packed length, not stretched to
      // the full cord length, so place it by the packed extent.
      const length =
        node.name === "shockcord"
          ? childNum(node, "packedlength", 0) || undefined
          : childNum(node, "length", 0) || undefined;
      return {
        ...b,
        kind: node.name,
        mass: mass > 0 ? mass : childNum(node, "mass", 0) || undefined,
        length,
        radius: radius && radius > 0 ? radius : undefined,
        instanceCount,
        children: [],
      };
    }
    default:
      return null;
  }
}

function parachuteMass(node: XmlNode, diameter: number): number {
  const override = childText(node, "overridemass");
  if (override !== undefined) return parseNum(override, 0);
  const mat = child(node, "material");
  const surfaceDensity = mat ? parseNum(mat.attrs.density, 0) : 0;
  const canopyArea = Math.PI * (diameter / 2) * (diameter / 2);
  let mass = canopyArea * surfaceDensity;
  const lineCount = childNum(node, "linecount", 0);
  const lineLen = childNum(node, "linelength", 0);
  const lineMat = child(node, "linematerial");
  const lineDensity = lineMat ? parseNum(lineMat.attrs.density, 0) : 0;
  if (lineCount && lineLen && lineDensity) mass += lineCount * lineLen * lineDensity;
  return mass;
}

function streamerMass(node: XmlNode): number {
  const override = childText(node, "overridemass");
  if (override !== undefined) return parseNum(override, 0);
  const mat = child(node, "material");
  const density = mat ? parseNum(mat.attrs.density, 0) : 0;
  return childNum(node, "striplength", 0) * childNum(node, "stripwidth", 0) * density;
}

/** Shock-cord mass from its line material (density in kg/m) times the cord length. OpenRocket
 *  stores the material, not a mass, for a shock cord — which it treats purely as a mass
 *  component — so without this the cord drops out of the total. On a high-power rocket a long
 *  tubular-nylon harness is a real, CG-shifting mass. An explicit <mass> still wins. */
function shockcordMass(node: XmlNode): number {
  const explicit = childText(node, "mass");
  if (explicit !== undefined) return parseNum(explicit, 0);
  const mat = child(node, "material");
  const lineDensity = mat ? parseNum(mat.attrs.density, 0) : 0; // kg/m for a "line" material
  const cordLength = childNum(node, "cordlength", childNum(node, "length", 0));
  return Math.max(0, lineDensity * cordLength);
}

/** Launch-lug / rail-button structural mass: bulk material (kg/m³) over the tube-wall volume
 *  (outer radius, wall thickness, length). Small on its own, but like the shock cord it is
 *  stored as material + geometry, not an explicit mass, so it would otherwise be dropped. When
 *  no wall thickness is given the volume is indeterminate, so the mass is left to any explicit
 *  <mass> rather than guessed. */
function lugMass(node: XmlNode, outerRadius: number | undefined, length: number): number {
  const explicit = childText(node, "mass");
  if (explicit !== undefined) return parseNum(explicit, 0);
  const mat = child(node, "material");
  const density = mat ? parseNum(mat.attrs.density, 0) : 0; // kg/m³ for a "bulk" material
  const t = childNum(node, "thickness", 0);
  if (!outerRadius || outerRadius <= 0 || length <= 0 || density <= 0 || t <= 0) return 0;
  const ri = Math.max(0, outerRadius - t);
  return Math.PI * (outerRadius * outerRadius - ri * ri) * length * density;
}

/** A freeform fin's `<finpoints>` outline as plain points, in metres. A freeform fin carries NO
 *  `<rootchord>`/`<height>` elements — its shape is only these points — so the model's span, root
 *  chord, area, sweep and exact CP all come from them (see lib/model/planform.ts, shared with the
 *  RockSim importer, whose custom fin sets carry the same outline in a different spelling). */
function freeformPlanform(node: XmlNode): Planform {
  const pts = freeformPoints(node);
  if (!pts) return { area: 0, sweep: 0, span: 0, rootChord: 0, cpChord: 0 };
  return planformFromPoints(pts);
}

/** The raw outline, kept on the model so the exporter can write the shape back rather than inventing
 *  an equal-area trapezoid for it. The reduction above is one-way. */
function freeformPoints(node: XmlNode): FinPoint[] | undefined {
  const fp = child(node, "finpoints");
  if (!fp) return undefined;
  const pts = children(fp, "point").map((p) => ({ x: parseNum(p.attrs.x, 0), y: parseNum(p.attrs.y, 0) }));
  return pts.length >= 3 ? pts : undefined;
}

/** Per-configuration separation overrides: OpenRocket writes a `<separationconfiguration
 *  configid=…>` for each motor config a stage separates differently in (e.g. at the booster's
 *  ejection charge on one motor, at upper-stage ignition on another). Keyed by configuration id;
 *  the flown config's override wins over the stage's default `<separationevent>`. Missing this is
 *  why a two-stage design could carry its spent booster to apogee instead of dropping it at
 *  staging — a large apogee error. */
function parseSeparationConfigs(st: XmlNode): Record<string, SeparationSetting> | undefined {
  const out: Record<string, SeparationSetting> = {};
  for (const sc of children(st, "separationconfiguration")) {
    const cid = sc.attrs.configid;
    if (!cid) continue;
    const delay = Number(childText(sc, "separationdelay"));
    out[cid] = {
      event: mapSeparationEvent(childText(sc, "separationevent")),
      delay: Number.isFinite(delay) ? delay : undefined,
    };
  }
  return Object.keys(out).length ? out : undefined;
}

function parseStages(rocketNode: XmlNode, ctx: WalkContext): Stage[] {
  const sub = child(rocketNode, "subcomponents");
  if (!sub) return [];
  const stages: Stage[] = [];
  for (const st of children(sub, "stage")) {
    const sepDelay = Number(childText(st, "separationdelay"));
    // A stage is a component assembly, so read its own mass/CG override too (OpenRocket lets you
    // state a measured weight for a whole stage). Reuses the component override reader.
    const ov = overrides(st) as { overrideMass?: number; overrideCGx?: number; overrideSubcomponents?: boolean };
    stages.push({
      name: childText(st, "name") || "Stage",
      components: parseSubcomponents(st, ctx),
      separationEvent: mapSeparationEvent(childText(st, "separationevent")),
      separationDelay: Number.isFinite(sepDelay) ? sepDelay : undefined,
      separationConfigs: parseSeparationConfigs(st),
      overrideMass: ov.overrideMass,
      overrideCGx: ov.overrideCGx,
      overrideSubcomponents: ov.overrideSubcomponents,
    });
  }
  // Some files (older) put components directly under the rocket without a <stage>.
  if (stages.length === 0) {
    const comps = parseSubcomponents(rocketNode, ctx);
    if (comps.length) stages.push({ name: "Stage", components: comps });
  }
  return stages;
}

function parseMotorConfigs(rocketNode: XmlNode, ctx: WalkContext): {
  configs: MotorConfiguration[];
  defaultId?: string;
} {
  const declared = children(rocketNode, "motorconfiguration");
  const byId = new Map<string, MotorInstance[]>();
  for (const inst of ctx.motorInstances) {
    const list = byId.get(inst.configId) ?? [];
    list.push({
      mountId: inst.mountId,
      motor: inst.spec,
      ignitionEvent: inst.ignitionEvent,
      ignitionDelay: inst.ignitionDelay,
    });
    byId.set(inst.configId, list);
  }

  const configs: MotorConfiguration[] = [];
  let defaultId: string | undefined;
  for (const dc of declared) {
    const id = dc.attrs.configid || "default";
    if (dc.attrs.default === "true") defaultId = id;
    configs.push({
      id,
      name: childText(dc, "name"),
      instances: byId.get(id) ?? [],
    });
    byId.delete(id);
  }
  // Any motor configs referenced by mounts but not declared at rocket level.
  for (const [id, instances] of byId) {
    configs.push({ id, instances });
  }
  if (!defaultId && configs.length) {
    defaultId = configs.find((c) => c.instances.length > 0)?.id ?? configs[0].id;
  }
  return { configs, defaultId };
}

/** The release at which OpenRocket's stored landing velocity changed meaning — see
 *  `StoredResults.groundHitVelocityFrame`. Files written by this version or later store the
 *  ground-frame total; earlier ones store the air-relative speed. */
const ORK_GROUND_FRAME_SINCE: readonly [number, number] = [24, 12];

/** Which convention a file's stored landing velocity follows, from its `creator` string.
 *
 *  Returns `undefined` rather than guessing when the string is absent or does not carry a
 *  `YY.MM` version — a wrong era is worse than no era, because it would silently compare the two
 *  different quantities while looking deliberate. Handles the suffixed forms the corpus actually
 *  carries: `24.12.beta.01` and `26.xx.SNAPSHOT-3cc62e47d` (whose minor is not a number, and which
 *  is still unambiguously later than 24.12 by its major). */
export function orkGroundHitFrame(creator: string | undefined): "vertical" | "total" | undefined {
  const m = /OpenRocket\s+(\d+)\.(\d+|xx)/i.exec(creator ?? "");
  if (!m) return undefined;
  const major = Number(m[1]);
  const minor = m[2].toLowerCase() === "xx" ? 99 : Number(m[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return undefined;
  const [gMajor, gMinor] = ORK_GROUND_FRAME_SINCE;
  return major > gMajor || (major === gMajor && minor >= gMinor) ? "total" : "vertical";
}

/** Whether OpenRocket's own event log says a recovery device came out on this stored run.
 *
 *  An `.ork` keeps a per-step flight log as one `<databranch>` per stage, and interleaved with the
 *  data points is a timeline of `<event type="…">` elements — `ignition`, `burnout`, `apogee`,
 *  `recoverydevicedeployment`, `tumble`, `groundhit`. So the format has always said this; nothing
 *  read it. Measured on this corpus: **77 of the 91 stored flights record a deployment, and not one
 *  records events WITHOUT one.** The other 14 store the summary attributes with no event log at all,
 *  and those stay undefined rather than being assumed either way.
 *
 *  The `.rkt` half of this lives in `lib/rkt/adapt.ts`, where RockSim states it per device instead.
 *  Neither is inferred from Loft's own flight — that would be circular, and a run where Loft and the
 *  file disagree about whether recovery deployed is a far larger error than the landing speed the
 *  split exists to compare. */
function orkRecoveryDeployed(fd: XmlNode | undefined): boolean | undefined {
  if (!fd) return undefined;
  let sawEvent = false;
  for (const branch of children(fd, "databranch")) {
    for (const ev of children(branch, "event")) {
      sawEvent = true;
      if (ev.attrs.type === "recoverydevicedeployment") return true;
    }
  }
  return sawEvent ? false : undefined;
}

function parseSimulations(root: XmlNode): StoredSimulation[] {
  const sims = child(root, "simulations");
  if (!sims) return [];
  const out: StoredSimulation[] = [];
  for (const sim of children(sims, "simulation")) {
    const cond = child(sim, "conditions");
    const fd = child(sim, "flightdata");
    const conditions: StoredConditions = {};
    if (cond) {
      conditions.configId = childText(cond, "configid");
      conditions.rodLength = numOrUndef(cond, "launchrodlength");
      conditions.rodAngleDeg = numOrUndef(cond, "launchrodangle");
      conditions.rodDirectionDeg = numOrUndef(cond, "launchroddirection");
      conditions.windSpeed = numOrUndef(cond, "windaverage") ?? numFromWind(cond, "speed");
      conditions.windDirectionDeg = numOrUndef(cond, "launchroddirection");
      conditions.launchAltitude = numOrUndef(cond, "launchaltitude");
      const atm = child(cond, "atmosphere");
      if (atm) {
        conditions.baseTempK = numOrUndef(atm, "basetemperature");
        conditions.basePressurePa = numOrUndef(atm, "basepressure");
      }
    }
    const results: StoredResults = {};
    let hasResults = false;
    if (fd) {
      const a = fd.attrs;
      const set = (key: keyof StoredResults, attr: string) => {
        const v = parseNum(a[attr], NaN);
        if (Number.isFinite(v)) {
          results[key] = v;
          hasResults = true;
        }
      };
      set("maxAltitude", "maxaltitude");
      set("maxVelocity", "maxvelocity");
      set("maxAcceleration", "maxacceleration");
      set("maxMach", "maxmach");
      set("timeToApogee", "timetoapogee");
      set("flightTime", "flighttime");
      set("groundHitVelocity", "groundhitvelocity");
      set("launchRodVelocity", "launchrodvelocity");
      set("deploymentVelocity", "deploymentvelocity");
      set("optimumDelay", "optimumdelay");
    }
    out.push({
      name: childText(sim, "name") || "Simulation",
      status: sim.attrs.status,
      // Recorded here rather than derived later: the creator string is a fact about the FILE, and by
      // the time a comparison runs the document is a Rocket and the string is gone.
      groundHitVelocityFrame: orkGroundHitFrame(root.attrs.creator),
      recoveryDeployed: orkRecoveryDeployed(fd),
      conditions,
      results,
      hasResults,
      flightData: fd ? parseFlightData(fd) : undefined,
    });
  }
  return out;
}

/** Columns of a databranch we surface, keyed to the display names OpenRocket writes in the
 *  `types` attribute. Mapped by name because the column ORDER varies between file-format versions. */
const FLIGHT_COLUMNS: Record<keyof StoredFlightPoint, string> = {
  time: "Time",
  altitude: "Altitude",
  velocity: "Total velocity",
  mach: "Mach number",
  cd: "Drag coefficient",
};

/** Read a design tool's stored per-step flight log from a <flightdata> node. OpenRocket stores it
 *  as one <databranch> per stage, each a `types="Time,Altitude,…"` header plus comma-separated
 *  <datapoint> rows. Columns are located by name (order differs across versions); the longest
 *  branch — the primary flight — is taken. Returns undefined when no usable series is present, so
 *  a file that saved only summary results (or none) simply carries no flight log. */
function parseFlightData(fd: XmlNode): StoredFlightData | undefined {
  let best: StoredFlightData | undefined;
  for (const branch of children(fd, "databranch")) {
    const types = branch.attrs.types;
    if (!types) continue;
    const names = types.split(",");
    const idx = {} as Record<keyof StoredFlightPoint, number>;
    let usable = true;
    for (const key of Object.keys(FLIGHT_COLUMNS) as (keyof StoredFlightPoint)[]) {
      const i = names.indexOf(FLIGHT_COLUMNS[key]);
      // Time, altitude and Mach are the minimum needed to plot a trajectory or a drag curve; a
      // branch missing any of them is not a usable log. A missing Cd/velocity column stays NaN.
      if (i < 0 && (key === "time" || key === "altitude" || key === "mach")) usable = false;
      idx[key] = i;
    }
    if (!usable) continue;
    const points: StoredFlightPoint[] = [];
    for (const dp of children(branch, "datapoint")) {
      const f = dp.text.split(",");
      const at = (i: number) => (i >= 0 ? parseNum(f[i], NaN) : NaN);
      const time = at(idx.time);
      const altitude = at(idx.altitude);
      const mach = at(idx.mach);
      // A row whose core fields are unreadable is dropped (some tools emit a blank trailer row).
      if (!Number.isFinite(time) || !Number.isFinite(altitude) || !Number.isFinite(mach)) continue;
      points.push({ time, altitude, mach, velocity: at(idx.velocity), cd: at(idx.cd) });
    }
    if (points.length > 1 && (!best || points.length > best.points.length)) {
      best = { branch: branch.attrs.name || "flight", points };
    }
  }
  return best;
}

function numOrUndef(node: XmlNode, name: string): number | undefined {
  const v = childNum(node, name, NaN);
  return Number.isFinite(v) ? v : undefined;
}

function numFromWind(cond: XmlNode, field: string): number | undefined {
  const wind = child(cond, "wind");
  if (!wind) return undefined;
  const v = childNum(wind, field, NaN);
  return Number.isFinite(v) ? v : undefined;
}

// --- auto-radius resolution ----------------------------------------------------------

/** Fields the radius resolver reads/writes. The model stores real numbers; during parsing
 *  an "auto"/missing radius is left NaN so it can be resolved from neighbours here. */
interface RadiusFields {
  outerRadius?: number;
  innerRadius?: number;
  foreRadius?: number;
  aftRadius?: number;
  thickness?: number;
}
const rf = (c: RocketComponent): RadiusFields => c as unknown as RadiusFields;
const ok = (x: number | undefined): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
const BODY_KINDS = new Set(["nosecone", "bodytube", "transition"]);
const INTERNAL_KINDS = new Set(["tubecoupler", "innertube", "centeringring", "engineblock", "bulkhead"]);

/** Radius at a body component's fore (nose-ward) end. */
function foreRadius(c: RocketComponent): number {
  if (c.kind === "nosecone") return 0; // the tip
  if (c.kind === "bodytube") return c.outerRadius;
  if (c.kind === "transition") return c.foreRadius;
  return NaN;
}
/** Radius at a body component's aft end. */
function aftRadius(c: RocketComponent): number {
  if (c.kind === "nosecone") return c.aftRadius;
  if (c.kind === "bodytube") return c.outerRadius;
  if (c.kind === "transition") return c.aftRadius;
  return NaN;
}

/** Resolve components whose radius was "auto" (left NaN at parse). OpenRocket's "auto"
 *  means "match the adjacent component": a body tube takes its neighbour's radius, a
 *  transition end takes the body it meets, and an internal part (coupler, inner tube,
 *  ring) fits inside its enclosing tube. A body radius no neighbour can supply falls back to
 *  the rocket's largest known radius; only when nothing resolves at all is a section left at
 *  zero. Either substitution is flagged, rather than silently mis-modelled. */
function resolveAutoRadii(rocket: Rocket, warnings: string[]): void {
  let unresolved = false;
  let filledFromFallback = false;
  for (const stage of rocket.stages) {
    const bodies = stage.components.filter((c) => BODY_KINDS.has(c.kind));

    // Forward: a fore-side auto radius matches the previous body's aft radius.
    let prevAft = NaN;
    for (const c of bodies) {
      if (c.kind === "bodytube" && !ok(c.outerRadius) && ok(prevAft)) c.outerRadius = prevAft;
      else if (c.kind === "transition" && !ok(c.foreRadius) && ok(prevAft)) c.foreRadius = prevAft;
      prevAft = aftRadius(c);
    }
    // Backward: an aft-side auto radius matches the next body's fore radius.
    let nextFore = NaN;
    for (let i = bodies.length - 1; i >= 0; i--) {
      const c = bodies[i];
      if (c.kind === "bodytube" && !ok(c.outerRadius) && ok(nextFore)) c.outerRadius = nextFore;
      else if (c.kind === "nosecone" && !ok(c.aftRadius) && ok(nextFore)) c.aftRadius = nextFore;
      else if (c.kind === "transition" && !ok(c.aftRadius) && ok(nextFore)) c.aftRadius = nextFore;
      nextFore = foreRadius(c);
    }

    // A body radius still "auto" after neighbour propagation gets a last-resort value rather
    // than being left to collapse the airframe. OpenRocket's auto radius searches fore and aft
    // for a dimensioned symmetric component and only then falls back to a default; we use the
    // rocket's largest already-resolved radius — the same value the aerodynamic reference radius
    // is taken from (maxBodyRadius) — so the airframe stays consistent with the reference area
    // instead of flying as a zero-diameter needle with a borrowed reference. Only when nothing
    // anywhere resolved (the fallback is itself zero) is a section genuinely left at zero. This
    // runs before internal resolution so a coupler/ring inside a fallback-filled tube can still
    // fit against it rather than being zeroed in turn.
    const fallbackR = maxResolvedRadius(stage.components);
    const fill = (assign: (r: number) => void): void => {
      assign(fallbackR);
      if (fallbackR > 0) filledFromFallback = true;
      else unresolved = true;
    };
    for (const c of bodies) {
      const f = rf(c);
      if (c.kind === "nosecone" && !ok(f.aftRadius)) fill((r) => (f.aftRadius = r));
      else if (c.kind === "bodytube" && !ok(f.outerRadius)) fill((r) => (f.outerRadius = r));
      else if (c.kind === "transition") {
        if (!ok(f.foreRadius)) fill((r) => (f.foreRadius = r));
        if (!ok(f.aftRadius)) fill((r) => (f.aftRadius = r));
      }
    }

    resolveInternalRadii(stage.components, NaN);

    // Backstop: any internal part (bulkhead, ring, coupler…) still unresolved after the
    // above is zeroed rather than left NaN — a single NaN radius otherwise propagates into
    // the total mass and the reference area and silently collapses the whole flight to zero.
    // Internal parts nest (a bulkhead inside a coupler), so this recurses.
    const zeroUnresolvedInternal = (comps: RocketComponent[]): void => {
      for (const c of comps) {
        if (INTERNAL_KINDS.has(c.kind) && !ok(rf(c).outerRadius)) {
          const f = rf(c);
          f.outerRadius = 0;
          if (!Number.isFinite(f.innerRadius ?? NaN)) f.innerRadius = 0;
          unresolved = true;
        }
        if (c.children.length) zeroUnresolvedInternal(c.children);
      }
    };
    zeroUnresolvedInternal(stage.components);
  }
  if (filledFromFallback) {
    warnings.push(
      'Some component radii were marked "auto" but no neighbour could supply one; they were set ' +
        "to the rocket's largest known radius so the airframe keeps a defined size. Check the " +
        "affected diameters against the design.",
    );
  }
  if (unresolved) {
    warnings.push(
      'Some component radii were marked "auto" but couldn\'t be resolved from neighbours, and the ' +
        "rocket has no other radius to fall back on; those sections were treated as zero-radius.",
    );
  }
}

/** Largest already-resolved outer radius anywhere in the stage (body or internal parts) — the
 *  best proxy for the airframe's scale, used as the last-resort fallback for an "auto" radius no
 *  neighbour could supply. Matches the value the aerodynamic reference radius is taken from, so a
 *  fallback-filled airframe stays consistent with its reference area. */
function maxResolvedRadius(components: RocketComponent[]): number {
  let max = 0;
  const visit = (list: RocketComponent[]): void => {
    for (const c of list) {
      const f = rf(c);
      for (const r of [f.outerRadius, f.foreRadius, f.aftRadius]) {
        if (ok(r)) max = Math.max(max, r);
      }
      if (c.children.length) visit(c.children);
    }
  };
  visit(components);
  return max;
}

/** Outer radius of a tube fin whose radius is "auto": OpenRocket sizes the tubes so that
 *  `count` of them sit tangent to the body of radius `bodyRadius` AND tangent to each other.
 *  Their centres lie on a circle of radius (R + r) spaced by 2π/count, so adjacent centres are
 *  2·(R + r)·sin(π/count) apart; setting that equal to 2r gives r = R·sin(π/n) / (1 − sin(π/n)).
 *  (For the common six-tube set sin(π/6) = ½, so the tubes match the body diameter exactly.) */
function autoTubeFinRadius(bodyRadius: number, count: number): number {
  if (!(bodyRadius > 0) || count < 2) return bodyRadius;
  const s = Math.sin(Math.PI / count);
  if (s >= 1) return bodyRadius; // n = 2: tubes can't close around the body; fall back to the body radius
  return (bodyRadius * s) / (1 - s);
}

/** Internal parts (tube couplers, inner tubes, rings, engine blocks) with an auto outer
 *  radius fit inside their enclosing body tube. Tube fins ride on the OUTSIDE of the same
 *  body, so they are sized from its outer radius instead. */
function resolveInternalRadii(components: RocketComponent[], parentInner: number, parentOuter = NaN): void {
  for (const c of components) {
    if (c.kind === "tubefinset" && !ok(c.outerRadius)) {
      c.outerRadius = ok(parentOuter) ? autoTubeFinRadius(parentOuter, c.finCount) : 0;
    }
    if (INTERNAL_KINDS.has(c.kind)) {
      const f = rf(c);
      if (!ok(f.outerRadius) && ok(parentInner)) f.outerRadius = parentInner;
      if (c.kind !== "bulkhead" && (!Number.isFinite(f.innerRadius ?? NaN) || (f.innerRadius ?? 0) < 0)) {
        // ~1.5 mm wall when the file didn't give us enough to compute it (minor mass part).
        f.innerRadius = ok(f.outerRadius) ? Math.max(0, (f.outerRadius as number) - 0.0015) : 0;
      }
    }
    // The enclosing inner radius handed to nested parts. A body tube encloses at its bore
    // (outer − wall); a coupler, inner tube, nose cone, or transition encloses at its radius.
    // Without propagating through non-tube containers, a bulkhead or ring nested inside a
    // coupler (rather than directly in a tube) never resolved and stayed NaN, which then
    // poisoned the total mass and the reference area for the whole flight.
    const g = rf(c);
    let childInner = parentInner;
    if (c.kind === "bodytube" && ok(g.outerRadius)) childInner = Math.max(0, g.outerRadius - (g.thickness ?? 0));
    else if (ok(g.outerRadius)) childInner = g.outerRadius;
    else if (c.kind === "nosecone" && ok(g.aftRadius)) childInner = g.aftRadius as number;
    else if (c.kind === "transition" && ok(g.aftRadius)) childInner = g.aftRadius as number;
    const childOuter = ok(g.outerRadius)
      ? (g.outerRadius as number)
      : c.kind === "nosecone" || c.kind === "transition"
        ? (g.aftRadius as number)
        : parentOuter;
    if (c.children.length) resolveInternalRadii(c.children, childInner, childOuter);
  }
}

/** Warn (once) about assembly types Loft doesn't simulate yet, so their omission is
 *  visible rather than silent. Returns whether any were found (the flown vehicle is reduced). */
function warnUnsupportedAssemblies(node: XmlNode, warnings: string[]): boolean {
  const LABELS: Record<string, string> = {
    parallelstage: "parallel (strap-on) stages",
    boosterset: "booster sets",
    podset: "pods",
  };
  const found = new Set<string>();
  const walk = (n: XmlNode): void => {
    if (LABELS[n.name]) found.add(LABELS[n.name]);
    for (const ch of n.children) walk(ch);
  };
  walk(node);
  if (found.size) {
    warnings.push(
      `This design has ${[...found].join(", ")}, which aren't simulated yet — only the primary stack was flown.`,
    );
    return true;
  }
  return false;
}

/** Parse a decompressed `rocket.ork` XML string into the canonical document. */
export function adaptOrkXml(xml: string): OrkDocument {
  idCounter = 0;
  const root = parseXml(xml);
  if (root.name !== "openrocket") {
    throw new Error(`Not an OpenRocket file (root <${root.name}>)`);
  }
  const formatVersion = root.attrs.version || "unknown";
  const creator = root.attrs.creator;
  const rocketNode = child(root, "rocket");
  if (!rocketNode) throw new Error("OpenRocket file has no <rocket> element");

  const ctx: WalkContext = { warnings: [], notes: [], motorInstances: [] };
  const stages = parseStages(rocketNode, ctx);
  const { configs, defaultId } = parseMotorConfigs(rocketNode, ctx);

  const reducedAssemblies = warnUnsupportedAssemblies(rocketNode, ctx.warnings);
  if (stages.length > 1) {
    ctx.notes.push(
      `This design has ${stages.length} stages, flown serially: the booster lights at launch, ` +
        `each stage above air-starts when the one below burns out and separates. The separated ` +
        `stages' own descent isn't tracked — only the sustainer is flown to the ground.`,
    );
  }
  // Serial staging and tube fins are now simulated, so neither makes the flown vehicle
  // "reduced". Parallel/strap-on stages and pods still are (warnUnsupportedAssemblies).
  const flownAsReduced = reducedAssemblies;

  const refType = childText(rocketNode, "referencetype");
  const rocket: Rocket = {
    name: childText(rocketNode, "name") || "Imported rocket",
    designer: childText(rocketNode, "designer"),
    stages,
    configurations: configs,
    defaultConfigId: defaultId,
    referenceType: refType === "nose" ? "nose" : refType === "custom" ? "custom" : "maximum",
    referenceRadius: numOrUndef(rocketNode, "customreference"),
  };

  resolveAutoRadii(rocket, ctx.warnings);

  return {
    rocket,
    simulations: parseSimulations(root),
    formatVersion,
    creator,
    warnings: ctx.warnings,
    notes: ctx.notes,
    flownAsReduced,
  };
}
