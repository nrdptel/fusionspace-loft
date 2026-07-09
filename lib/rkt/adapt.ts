/** The RockSim `.rkt` adapter: translate a parsed RockSim design tree INTO the same canonical
 *  rocket model the `.ork` adapter produces, so the simulator — which never sees a file format
 *  — flies a RockSim design exactly as it flies an OpenRocket one. This is a sibling of
 *  `lib/ork/adapt.ts`: a thin adapter into the one internal model, not a second engine.
 *
 *  Clean-room: RockSim's format is documented publicly (the `RockSim_Xml_Doc.txt` shipped with
 *  RockSim, the RockSim engine-file spec, and OpenRocket's documented RockSim compatibility);
 *  this is implemented from those descriptions and from inspecting real `.rkt` exports. No
 *  RockSim or OpenRocket source is used.
 *
 *  Units — RockSim stores linear dimensions in millimetres and part masses in grams; diameters
 *  are diameters (halved to a radius); material densities and the stored flight results are
 *  already SI. Every value is converted to SI here (metres, kilograms, seconds, radians, kelvin).
 *  Angles are stored in radians. Unknown parts are collected as warnings and skipped, never
 *  thrown on, matching the "degrade gracefully on unknowns" requirement.
 *
 *  Mass — unlike a `.ork` (which stores no per-part mass, so Loft computes it from geometry), a
 *  `.rkt` carries RockSim's own per-part mass (`CalcMass`, or `KnownMass` when the design is in
 *  known-mass mode). Loft honours those as explicit per-component overrides, so an imported
 *  RockSim design flies the exact masses RockSim assigned — the honest representation, and it
 *  keeps the Loft-vs-RockSim comparison about the aerodynamics and integration rather than a
 *  mass-model difference. */

import type {
  Rocket,
  RocketComponent,
  Stage,
  Material,
  Placement,
  AxialMethod,
  NoseShape,
  SurfaceFinish,
  MotorConfiguration,
  MotorInstance,
  MotorSpec,
  MotorMount,
} from "../model/types";
import { radToDeg, cToK } from "../units";
import { parseXml, child, children, childText, childNum, type XmlNode } from "../ork/xml";
import type {
  OrkDocument,
  StoredSimulation,
  StoredResults,
  StoredConditions,
} from "../ork/adapt";

// --- unit conversions ----------------------------------------------------------------
const MM = 1 / 1000; // millimetre → metre
const RAD = 1 / 2000; // diameter (mm) → radius (m)
const G = 1 / 1000; // gram → kilogram
const MMHG_TO_PA = 133.322387415; // mm of mercury → pascal

let idCounter = 0;
const nextId = (): string => `r${++idCounter}`;

/** A numeric child, or `fallback` (default 0) when absent/non-numeric. */
function n(node: XmlNode, name: string, fallback = 0): number {
  const v = childNum(node, name, NaN);
  return Number.isFinite(v) ? v : fallback;
}

// --- enum mappings (documented RockSim shape / finish codes) --------------------------

/** Nose-cone / transition shape codes. RockSim's PARABOLIC (2) is closest to an ellipsoid in
 *  Loft's contour set, matching OpenRocket's own RockSim mapping; an unknown code defaults to
 *  ellipsoid (RockSim's documented default). */
function noseShape(code: number): NoseShape {
  switch (code) {
    case 0:
      return "conical";
    case 1:
      return "ogive";
    case 2:
      return "ellipsoid"; // RockSim PARABOLIC
    case 3:
      return "ellipsoid"; // ELLIPTICAL
    case 4:
      return "power"; // POWER_SERIES
    case 5:
      return "parabolic"; // PARABOLIC_SERIES
    case 6:
      return "haack"; // HAACK / Von Kármán
    default:
      return "ellipsoid";
  }
}

/** Surface finish codes → equivalent roughness category; unknown defaults to matt paint. */
function finish(code: number): SurfaceFinish {
  switch (code) {
    case 0:
      return "polished";
    case 1:
      return "smooth-paint"; // GLOSS
    case 2:
      return "regular-paint"; // MATT
    case 3:
      return "unfinished";
    default:
      return "regular-paint";
  }
}

/** Ring usage code → the concentric-ring kind. All are annular cylinders for mass; the kind
 *  only refines labelling and auto-radius intent. */
type RingKind = "tubecoupler" | "centeringring" | "bulkhead" | "engineblock";
function ringKind(code: number): RingKind {
  switch (code) {
    case 1:
      return "bulkhead";
    case 2:
      return "engineblock";
    case 4:
      return "tubecoupler";
    default:
      return "centeringring";
  }
}

// --- placement ------------------------------------------------------------------------

interface Ctx {
  warnings: string[];
  /** All body/inner tubes by their RockSim serial number, so an EngineSet's MountSerialNo can
   *  find the mount it loads and mark it (with the cluster count) as a motor mount. */
  mounts: Map<number, BodyMount>;
  reduced: boolean;
}

/** A mounted tube whose motor-mount role is filled in once an EngineSet references it. */
type BodyMount = Extract<RocketComponent, { motorMount?: MotorMount }>;

/** RockSim `LocationMode`: 0 = measured from the front of the parent, 2 = from its rear (with a
 *  negative offset moving the part forward). Both map onto Loft's parent-relative placement; a
 *  top-level body part instead stacks after the previous one (the airframe is a nose→tail run). */
function placement(node: XmlNode, topLevel: boolean): Placement {
  const offset = n(node, "Xb", 0) * MM;
  const radial = n(node, "RadialLoc", 0) * MM;
  const radialOffset = radial > 0 ? radial : undefined;
  if (topLevel) return { method: "after", offset, radialOffset };
  const mode = Math.round(n(node, "LocationMode", 0));
  const method: AxialMethod = mode === 2 ? "bottom" : "top";
  return { method, offset, radialOffset };
}

// --- materials & mass -----------------------------------------------------------------

function material(node: XmlNode): Material | undefined {
  const density = n(node, "Density", 0);
  if (!(density > 0)) return undefined;
  const dt = Math.round(n(node, "DensityType", 0));
  const type = dt === 1 ? "surface" : dt === 2 ? "line" : "bulk";
  return { name: childText(node, "Material") || "material", density, type };
}

/** The part mass (kg) RockSim would fly for this component: its known (measured) mass when the
 *  design is in known-mass mode, otherwise RockSim's calculated mass, falling back across the
 *  two so a populated value always wins. Returns undefined when neither is positive. */
function fileMassKg(node: XmlNode, useKnownMass: boolean): number | undefined {
  const known = n(node, "KnownMass", 0);
  const calc = n(node, "CalcMass", 0);
  const grams = useKnownMass && known > 0 ? known : calc > 0 ? calc : known;
  return grams > 0 ? grams * G : undefined;
}

const STRUCTURAL = new Set<RocketComponent["kind"]>([
  "nosecone",
  "bodytube",
  "transition",
  "innertube",
  "tubecoupler",
  "centeringring",
  "bulkhead",
  "engineblock",
  "trapezoidfinset",
  "launchlug",
]);

// --- component parsing ----------------------------------------------------------------

function baseOf(node: XmlNode, topLevel: boolean) {
  return {
    id: nextId(),
    name: childText(node, "Name") || node.name,
    placement: placement(node, topLevel),
    material: material(node),
    finish: finish(Math.round(n(node, "FinishCode", 2))),
    children: [] as RocketComponent[],
  };
}

/** Depth-first parse of a part's `<AttachedParts>` children (nested tubes, rings, recovery,
 *  mass, fins) into the model, warning on anything unsupported. */
function attached(node: XmlNode, ctx: Ctx, useKnownMass: boolean): RocketComponent[] {
  const ap = child(node, "AttachedParts");
  if (!ap) return [];
  const out: RocketComponent[] = [];
  for (const c of ap.children) {
    const comp = parseComponent(c, ctx, false, useKnownMass);
    if (comp) out.push(comp);
    else noteUnsupported(c, ctx);
  }
  return out;
}

/** Flag part types Loft can't fly and record why, so a comparison against the design's stored
 *  results is withheld rather than reported as a misleading error. */
function noteUnsupported(node: XmlNode, ctx: Ctx): void {
  const name = node.name;
  if (name === "TubeFinSet" || name === "RingTail") {
    ctx.reduced = true;
    ctx.warnings.push(`Tube fins (<${name}>) aren't modelled yet — the design was flown without them.`);
  } else if (name === "Pod" || name === "ExternalPod" || name === "SubAssembly") {
    ctx.reduced = true;
    ctx.warnings.push(`A pod/sub-assembly (<${name}>) isn't simulated — only the primary stack flies.`);
  } else if (name !== "AttachedParts") {
    ctx.warnings.push(`Skipped unsupported RockSim part: <${name}>`);
  }
}

function parseComponent(
  node: XmlNode,
  ctx: Ctx,
  topLevel: boolean,
  useKnownMass: boolean,
): RocketComponent | null {
  const b = baseOf(node, topLevel);
  let comp: RocketComponent | null = null;

  switch (node.name) {
    case "NoseCone": {
      const hollow = Math.round(n(node, "ConstructionType", 0)) === 1;
      const wall = n(node, "WallThickness", 0) * MM;
      comp = {
        ...b,
        kind: "nosecone",
        length: n(node, "Len", 0) * MM,
        aftRadius: n(node, "BaseDia", 0) * RAD,
        thickness: hollow && wall > 0 ? wall : undefined,
        shape: noseShape(Math.round(n(node, "ShapeCode", 1))),
        shapeParameter: n(node, "ShapeParameter", 0) || undefined,
        aftShoulderLength: n(node, "ShoulderLen", 0) * MM || undefined,
        aftShoulderRadius: n(node, "ShoulderOD", 0) * RAD || undefined,
        children: attached(node, ctx, useKnownMass),
      };
      break;
    }
    case "BodyTube": {
      const od = n(node, "OD", 0) * RAD;
      const id = n(node, "ID", 0) * RAD;
      const inside = Math.round(n(node, "IsInsideTube", 0)) === 1;
      const serial = Math.round(n(node, "SerialNo", 0));
      if (inside) {
        comp = {
          ...b,
          kind: "innertube",
          length: n(node, "Len", 0) * MM,
          outerRadius: od,
          innerRadius: Math.min(id, od),
          children: [],
        };
      } else {
        comp = {
          ...b,
          kind: "bodytube",
          length: n(node, "Len", 0) * MM,
          outerRadius: od,
          thickness: od > id && id > 0 ? od - id : undefined,
          children: [],
        };
      }
      // Record every tube by serial so an EngineSet can mark its mount later; parse children
      // after so nested inner tubes are recorded too.
      if (serial > 0) ctx.mounts.set(serial, comp as BodyMount);
      (comp as { children: RocketComponent[] }).children = attached(node, ctx, useKnownMass);
      break;
    }
    case "Transition": {
      const hollow = Math.round(n(node, "ConstructionType", 0)) === 1;
      const wall = n(node, "WallThickness", 0) * MM;
      comp = {
        ...b,
        kind: "transition",
        length: n(node, "Len", 0) * MM,
        foreRadius: n(node, "FrontDia", 0) * RAD,
        aftRadius: n(node, "RearDia", 0) * RAD,
        thickness: hollow && wall > 0 ? wall : undefined,
        shape: noseShape(Math.round(n(node, "ShapeCode", 1))),
        shapeParameter: n(node, "ShapeParameter", 0) || undefined,
        foreShoulderLength: n(node, "FrontShoulderLen", 0) * MM || undefined,
        aftShoulderLength: n(node, "RearShoulderLen", 0) * MM || undefined,
        children: attached(node, ctx, useKnownMass),
      };
      break;
    }
    case "FinSet": {
      comp = {
        ...b,
        kind: "trapezoidfinset",
        finCount: Math.max(1, Math.round(n(node, "FinCount", 3))),
        rootChord: n(node, "RootChord", 0) * MM,
        tipChord: n(node, "TipChord", 0) * MM,
        height: n(node, "SemiSpan", 0) * MM,
        sweepLength: n(node, "SweepDistance", 0) * MM,
        thickness: n(node, "Thickness", 0) * MM || 0.003,
        cantAngle: n(node, "CantAngle", 0),
        children: attached(node, ctx, useKnownMass),
      };
      break;
    }
    case "Ring": {
      const od = n(node, "OD", 0) * RAD;
      const id = n(node, "ID", 0) * RAD;
      const kind = ringKind(Math.round(n(node, "UsageCode", 0)));
      comp = {
        ...b,
        kind,
        length: n(node, "Len", 0) * MM,
        outerRadius: od,
        innerRadius: kind === "bulkhead" ? 0 : Math.min(id, od),
        children: attached(node, ctx, useKnownMass),
      };
      break;
    }
    case "MassObject": {
      const mass = fileMassKg(node, useKnownMass) ?? 0;
      comp = {
        ...b,
        kind: "masscomponent",
        mass,
        length: n(node, "Len", 0) * MM || undefined,
        massType: childText(node, "Name"),
        children: [],
      };
      break;
    }
    case "Parachute": {
      comp = {
        ...b,
        kind: "parachute",
        cd: n(node, "DragCoefficient", 0.8) || 0.8,
        diameter: n(node, "Dia", 0) * MM,
        mass: fileMassKg(node, useKnownMass) ?? 0,
        // The design tree doesn't pin a deploy event/altitude (that lives in the sim setup);
        // default to apogee, the common single-deploy case, and let the flight report it.
        deployEvent: "apogee",
        deployDelay: 0,
        packedLength: n(node, "Len", 0) * MM || undefined,
        children: [],
      };
      break;
    }
    case "Streamer": {
      comp = {
        ...b,
        kind: "streamer",
        cd: n(node, "DragCoefficient", 0.75) || 0.75,
        stripLength: n(node, "Len", 0) * MM,
        stripWidth: n(node, "Width", 0) * MM,
        mass: fileMassKg(node, useKnownMass) ?? 0,
        deployEvent: "apogee",
        deployDelay: 0,
        packedLength: n(node, "Len", 0) * MM || undefined,
        children: [],
      };
      break;
    }
    case "LaunchLug": {
      comp = {
        ...b,
        kind: "launchlug",
        mass: fileMassKg(node, useKnownMass),
        length: n(node, "Len", 0) * MM || undefined,
        children: [],
      };
      break;
    }
    default:
      return null;
  }

  // Honour the file's per-part mass as an explicit override (see the module header). Mass-only
  // parts already carry their mass directly; this covers the structural parts Loft would
  // otherwise compute from geometry.
  if (comp && STRUCTURAL.has(comp.kind)) {
    const om = fileMassKg(node, useKnownMass);
    if (om !== undefined) (comp as { overrideMass?: number }).overrideMass = om;
  }
  return comp;
}

// --- motors ---------------------------------------------------------------------------

/** Build a motor instance from one `<EngineSet>` and mark the mount it loads. Returns null when
 *  the set carries no engine code. */
function engineInstance(set: XmlNode, ctx: Ctx): MotorInstance | null {
  const designation = (childText(set, "EngineCode") || "").trim();
  if (!designation) return null;
  const mountSerial = Math.round(n(set, "MountSerialNo", 0));
  const count = Math.max(1, Math.round(n(set, "EngineCount", 1)));
  const overhang = n(set, "EngineOverhang", 0) * MM;
  const ejection = n(set, "EjectionDelay", -1);
  const mount = ctx.mounts.get(mountSerial) ?? fallbackMount(ctx);
  if (mount) {
    const role: MotorMount = { overhang };
    if (count > 1) role.clusterCount = count;
    (mount as { motorMount?: MotorMount }).motorMount = role;
  }
  const spec: MotorSpec = {
    manufacturer: childText(set, "EngineMfg") || undefined,
    designation,
    type: "unknown",
    diameter: 0,
    length: 0,
    delay: ejection >= 0 ? ejection : undefined,
  };
  return {
    mountId: mount?.id ?? "",
    motor: spec,
    ignitionDelay: n(set, "IgnitionDelay", 0),
  };
}

/** The aft-most recorded tube, so a motor whose `MountSerialNo` doesn't resolve still gets
 *  placed on a real mount (the sensible default for a motor) rather than dropped. */
function fallbackMount(ctx: Ctx): BodyMount | undefined {
  let last: BodyMount | undefined;
  for (const m of ctx.mounts.values()) last = m;
  return last;
}

/** The EngineSets under a container's Stage1/2/3 engine lists. */
function engineSetsIn(container: XmlNode): XmlNode[] {
  const out: XmlNode[] = [];
  for (const stage of ["Stage1Engines", "Stage2Engines", "Stage3Engines"]) {
    const s = child(container, stage);
    if (s) out.push(...children(s, "EngineSet"));
  }
  return out;
}

// --- stored simulations ---------------------------------------------------------------

/** Map one `<SimulationResults>` to Loft's stored-results shape. RockSim stores the kinematic
 *  results in SI already; only the launch-site conditions need unit work. */
function storedSim(res: XmlNode, index: number): StoredSimulation {
  const results: StoredResults = {};
  let hasResults = false;
  const set = (key: keyof StoredResults, tag: string) => {
    const v = childNum(res, tag, NaN);
    if (Number.isFinite(v) && v !== 0) {
      results[key] = v;
      hasResults = true;
    }
  };
  set("maxAltitude", "MaxAltitude");
  set("maxVelocity", "MaxVelocity");
  set("maxAcceleration", "MaxAcceleration");
  set("timeToApogee", "TimeToApogee");
  set("flightTime", "TimeToLanding");
  set("groundHitVelocity", "VelocityAtLanding");
  set("launchRodVelocity", "VelocityAtLaunchGuideEnd");
  set("optimumDelay", "OptimalDelay");

  const conditions: StoredConditions = { configId: `sim${index}` };
  const alt = childNum(res, "LaunchAltitude", NaN);
  if (Number.isFinite(alt)) conditions.launchAltitude = alt;
  const temp = childNum(res, "LaunchTemperature", NaN);
  if (Number.isFinite(temp)) conditions.baseTempK = cToK(temp);
  const baro = childNum(res, "LaunchBarometer", NaN);
  if (Number.isFinite(baro) && baro > 0) conditions.basePressurePa = baro * MMHG_TO_PA;
  const wind = childNum(res, "LaunchWindSpeed", NaN);
  if (Number.isFinite(wind)) conditions.windSpeed = wind;
  const angle = childNum(res, "LaunchAngle", NaN); // radians off vertical
  if (Number.isFinite(angle)) conditions.rodAngleDeg = radToDeg(angle);
  const rail = childNum(res, "LaunchGuideLen", NaN) * MM; // stored in mm
  if (Number.isFinite(rail) && rail > 0.1 && rail < 20) conditions.rodLength = rail;

  return {
    name: (childText(res, "SimulationName") || `Simulation ${index + 1}`).replace(/^\[|\]$/g, ""),
    conditions,
    results,
    hasResults,
  };
}

// --- top level ------------------------------------------------------------------------

export function adaptRktXml(xml: string): OrkDocument {
  idCounter = 0;
  const root = parseXml(xml);
  if (root.name !== "RockSimDocument") {
    throw new Error(`Not a RockSim file (root <${root.name}>)`);
  }
  const design = child(child(root, "DesignInformation") ?? root, "RocketDesign");
  if (!design) throw new Error("RockSim file has no <RocketDesign> element");

  const warnings: string[] = [];
  const ctx: Ctx = { warnings, mounts: new Map(), reduced: false };
  const useKnownMass = Math.round(n(design, "UseKnownMass", 0)) === 1;

  // RockSim numbers stages 3 (top / sustainer, with the nose) down to 1 (aft booster). Flatten
  // the populated stages nose→tail into one axial stack so the whole airframe is present and
  // stacks correctly; flag a multi-stage design as flown-reduced (only the primary stack flies).
  const components: RocketComponent[] = [];
  let populatedStages = 0;
  for (const stageTag of ["Stage3Parts", "Stage2Parts", "Stage1Parts"]) {
    const stage = child(design, stageTag);
    if (!stage) continue;
    const parts: RocketComponent[] = [];
    for (const partNode of stage.children) {
      const comp = parseComponent(partNode, ctx, true, useKnownMass);
      if (comp) parts.push(comp);
      else noteUnsupported(partNode, ctx);
    }
    if (parts.length) {
      populatedStages += 1;
      components.push(...parts);
    }
  }
  if (populatedStages > 1) {
    ctx.reduced = true;
    warnings.push(
      `This design has ${populatedStages} stages; staging (separation, air-starts) isn't simulated yet — the stack was flown as one.`,
    );
  }
  const stages: Stage[] = [{ name: childText(design, "Name") || "Stage", components }];

  // Each <SimulationResults> carries its own <EngineSet>s and stored numbers: map each to a
  // motor configuration (linked by id) and a stored simulation, mirroring how OpenRocket's
  // simulations reference configurations. Marking the mount also fills its motor-mount role.
  const configs: MotorConfiguration[] = [];
  const simulations: StoredSimulation[] = [];
  const resultsList = child(root, "SimulationResultsList");
  const resultNodes = resultsList ? children(resultsList, "SimulationResults") : [];
  resultNodes.forEach((res, i) => {
    const instances = engineSetsIn(res)
      .map((set) => engineInstance(set, ctx))
      .filter((x): x is MotorInstance => x !== null);
    const sim = storedSim(res, i);
    configs.push({ id: `sim${i}`, name: sim.name, instances });
    simulations.push(sim);
  });

  // A design with no stored simulations (so no motor) still needs a configuration to select; an
  // empty one flies with no propulsion, which the run layer detects and withholds honestly.
  if (configs.length === 0) configs.push({ id: "default", instances: [] });

  const rocket: Rocket = {
    name: childText(design, "Name") || "Imported rocket",
    stages,
    configurations: configs,
    defaultConfigId: configs[0]?.id,
    referenceType: "maximum",
  };

  return {
    rocket,
    simulations,
    formatVersion: `RockSim ${childText(root, "FileVersion") || "?"}`,
    creator: "RockSim",
    warnings,
    flownAsReduced: ctx.reduced,
  };
}
