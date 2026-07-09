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
  Material,
  MaterialType,
  Placement,
  AxialMethod,
  NoseShape,
  SurfaceFinish,
  MotorConfiguration,
  MotorInstance,
  MotorSpec,
  MotorType,
  DeployEvent,
} from "../model/types";
import { degToRad } from "../units";
import { parseXml, child, children, childText, childNum, parseNum, type XmlNode } from "./xml";

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
  conditions: StoredConditions;
  results: StoredResults;
  hasResults: boolean;
}

export interface OrkDocument {
  rocket: Rocket;
  simulations: StoredSimulation[];
  formatVersion: string;
  creator?: string;
  warnings: string[];
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

interface WalkContext {
  warnings: string[];
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
  const defaultIgnEvent = childText(mm, "ignitionevent");
  const defaultIgnDelay = childNum(mm, "ignitiondelay", 0);
  for (const motor of children(mm, "motor")) {
    const configId = motor.attrs.configid || "default";
    const spec: MotorSpec = {
      manufacturer: childText(motor, "manufacturer"),
      designation: childText(motor, "designation") || "",
      type: (childText(motor, "type") as MotorType) || "unknown",
      diameter: childNum(motor, "diameter", 0),
      length: childNum(motor, "length", 0),
      digest: childText(motor, "digest"),
      delay: parseNum(childText(motor, "delay"), NaN),
    };
    if (spec.designation) {
      ctx.motorInstances.push({
        mountId,
        configId,
        spec,
        ignitionEvent: defaultIgnEvent,
        ignitionDelay: Number.isFinite(defaultIgnDelay) ? defaultIgnDelay : 0,
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
        aftShoulderLength: childNum(node, "aftshoulderlength", 0) || undefined,
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
        cantAngle: degToRad(childNum(node, "cant", 0) || 0),
        children: parseSubcomponents(node, ctx),
      };
    }
    case "ellipticalfinset":
    case "freeformfinset": {
      const finCount = Math.round(childNum(node, "fincount", childNum(node, "instancecount", 3)));
      const rootChord = childNum(node, "rootchord", 0);
      const height = childNum(node, "height", 0);
      let area: number;
      let sweep = childNum(node, "sweeplength", 0) || 0;
      if (node.name === "freeformfinset") {
        const fp = freeformPlanform(node);
        area = fp.area;
        sweep = fp.sweep;
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
        sweepLength: sweep,
        thickness: childNum(node, "thickness", 0.003),
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
      const cd = cdText === "auto" || cdText === undefined ? 0.8 : parseNum(cdText, 0.8);
      const mass = parachuteMass(node, diameter);
      return {
        ...b,
        kind: "parachute",
        cd,
        diameter,
        mass,
        deployEvent: mapDeployEvent(childText(node, "deployevent")),
        deployAltitude: childNum(node, "deployaltitude", 0) || undefined,
        deployDelay: childNum(node, "deploydelay", 0) || 0,
        packedLength: childNum(node, "packedlength", 0) || undefined,
        packedRadius: childNum(node, "packedradius", 0) || undefined,
        children: [],
      };
    }
    case "streamer": {
      return {
        ...b,
        kind: "streamer",
        cd: parseNum(childText(node, "cd"), 0.75),
        stripLength: childNum(node, "striplength", 0),
        stripWidth: childNum(node, "stripwidth", 0),
        mass: streamerMass(node),
        deployEvent: mapDeployEvent(childText(node, "deployevent")),
        deployAltitude: childNum(node, "deployaltitude", 0) || undefined,
        deployDelay: childNum(node, "deploydelay", 0) || 0,
        packedLength: childNum(node, "packedlength", 0) || undefined,
        children: [],
      };
    }
    case "shockcord":
    case "launchlug":
    case "railbutton": {
      return {
        ...b,
        kind: node.name,
        mass: childNum(node, "mass", 0) || undefined,
        length: childNum(node, "length", childNum(node, "cordlength", 0)) || undefined,
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

function freeformPlanform(node: XmlNode): { area: number; sweep: number } {
  const fp = child(node, "finpoints");
  if (!fp) return { area: 0, sweep: 0 };
  const pts = children(fp, "point").map((p) => ({ x: parseNum(p.attrs.x, 0), y: parseNum(p.attrs.y, 0) }));
  if (pts.length < 3) return { area: 0, sweep: 0 };
  // Shoelace area, and the LE sweep as the max x at the highest-y point.
  let area = 0;
  let maxY = 0;
  let sweepAtMaxY = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
    if (a.y > maxY) {
      maxY = a.y;
      sweepAtMaxY = a.x;
    }
  }
  return { area: Math.abs(area) / 2, sweep: sweepAtMaxY };
}

function parseStages(rocketNode: XmlNode, ctx: WalkContext): Stage[] {
  const sub = child(rocketNode, "subcomponents");
  if (!sub) return [];
  const stages: Stage[] = [];
  for (const st of children(sub, "stage")) {
    stages.push({
      name: childText(st, "name") || "Stage",
      components: parseSubcomponents(st, ctx),
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
      conditions,
      results,
      hasResults,
    });
  }
  return out;
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
 *  ring) fits inside its enclosing tube. Anything still unresolved is left at zero and
 *  flagged, rather than silently mis-modelled. */
function resolveAutoRadii(rocket: Rocket, warnings: string[]): void {
  let unresolved = false;
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

    resolveInternalRadii(stage.components, NaN);

    for (const c of bodies) {
      const f = rf(c);
      if (c.kind === "nosecone" && !ok(f.aftRadius)) { f.aftRadius = 0; unresolved = true; }
      if (c.kind === "bodytube" && !ok(f.outerRadius)) { f.outerRadius = 0; unresolved = true; }
      if (c.kind === "transition") {
        if (!ok(f.foreRadius)) { f.foreRadius = 0; unresolved = true; }
        if (!ok(f.aftRadius)) { f.aftRadius = 0; unresolved = true; }
      }
    }

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
  if (unresolved) {
    warnings.push(
      'Some component radii were marked "auto" but couldn\'t be resolved from neighbours; ' +
        "those sections were treated as zero-radius.",
    );
  }
}

/** Internal parts (tube couplers, inner tubes, rings, engine blocks) with an auto outer
 *  radius fit inside their enclosing body tube. */
function resolveInternalRadii(components: RocketComponent[], parentInner: number): void {
  for (const c of components) {
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
    if (c.children.length) resolveInternalRadii(c.children, childInner);
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

/** A tube-fin set is a fin geometry Loft doesn't model, so it's skipped on import. A rocket
 *  flown without its fins is a reduced (and aerodynamically very different) vehicle; return
 *  whether one is present so its stored-results comparison is withheld too. The user-facing
 *  "skipped unsupported component" warning is emitted during the component walk. */
function hasTubeFins(node: XmlNode): boolean {
  let found = false;
  const walk = (n: XmlNode): void => {
    if (n.name === "tubefinset") found = true;
    for (const ch of n.children) walk(ch);
  };
  walk(node);
  return found;
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

  const ctx: WalkContext = { warnings: [], motorInstances: [] };
  const stages = parseStages(rocketNode, ctx);
  const { configs, defaultId } = parseMotorConfigs(rocketNode, ctx);

  const reducedAssemblies = warnUnsupportedAssemblies(rocketNode, ctx.warnings);
  const multiStage = stages.length > 1;
  if (multiStage) {
    ctx.warnings.push(
      `This design has ${stages.length} stages; staging (separation, air-starts) isn't simulated yet — the stack was flown as one.`,
    );
  }
  const flownAsReduced = reducedAssemblies || multiStage || hasTubeFins(rocketNode);

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
    flownAsReduced,
  };
}
