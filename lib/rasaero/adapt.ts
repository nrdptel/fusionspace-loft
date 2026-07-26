/** The RASAero II `.CDX1` adapter: translate a RASAero design INTO the same canonical rocket
 *  model the `.ork` and `.rkt` adapters produce, so the simulator — which never sees a file
 *  format — flies a RASAero design exactly as it flies the others. A sibling of
 *  `lib/ork/adapt.ts` and `lib/rkt/adapt.ts`: a thin adapter into the one internal model.
 *
 *  Clean-room: `.CDX1` is plain XML and RASAero's design fields are documented in the published
 *  RASAero II user manual; this is implemented from that description and from inspecting real
 *  `.CDX1` exports. No RASAero source is used, and RASAero's own aerodynamics are not
 *  reimplemented — only its *design file* is read.
 *
 *  Units — RASAero works in US customary throughout: lengths and diameters in INCHES, weights in
 *  POUNDS, altitudes in FEET, velocity in ft/s, temperature in °F, pressure in inHg, wind in mph.
 *  Everything is converted to SI here.
 *
 *  Mass — this is the one place a RASAero design differs in kind from an OpenRocket or RockSim
 *  one. A `.CDX1` carries NO materials and NO per-part masses: RASAero is an aerodynamics and
 *  trajectory tool, and the flyer types in a single launch weight and CG per simulation. So the
 *  geometry here is massless, and the design's stated launch weight is carried as one airframe
 *  mass component with the resolved motor's loaded mass subtracted and its station chosen so the
 *  loaded CG lands exactly where the file says. That keeps a single component tree that every
 *  surface — the mass panel, the diagram, the solver, the exports — reads the same way, and it
 *  means swapping the motor in the app correctly keeps the airframe and changes only the motor.
 */

import type {
  Rocket,
  RocketComponent,
  BodyTube,
  NoseCone,
  Transition,
  TrapezoidFinSet,
  MassComponent,
  Parachute,
  MotorConfiguration,
  MotorInstance,
  NoseShape,
  SurfaceFinish,
  FinCrossSection,
} from "../model/types";
import { parseXml, child, children, childText, childNum, type XmlNode } from "../ork/xml";
import type { OrkDocument, StoredSimulation, StoredResults, StoredConditions } from "../ork/adapt";
import { resolveMotor } from "../motors/db";

// --- unit conversions ------------------------------------------------------------------
const IN = 0.0254; // inch → metre
const LB = 0.45359237; // pound → kilogram
const FT = 0.3048; // foot → metre
const MPH = 0.44704; // mile per hour → metre per second
const INHG = 3386.389; // inch of mercury → pascal
const fToK = (f: number): number => (f - 32) / 1.8 + 273.15;

let idCounter = 0;
const nextId = (): string => `a${++idCounter}`;

/** A numeric child, or `fallback` when absent/non-numeric. */
function n(node: XmlNode, name: string, fallback = 0): number {
  const v = childNum(node, name, NaN);
  return Number.isFinite(v) ? v : fallback;
}

/** RASAero nose/transition shape names → Loft's contour set. RASAero's names are spelled out in
 *  the design file ("Von Karman Ogive", "Tangent Ogive", "LV-Haack", …). Power- and Haack-series
 *  shapes carry a series parameter Loft expresses as `shapeParameter`. Unknown ⇒ tangent ogive,
 *  RASAero's own default. */
function noseShape(raw: string | undefined): { shape: NoseShape; shapeParameter?: number } {
  const s = (raw ?? "").trim().toLowerCase();
  if (s.includes("von karman") || s.includes("haack")) return { shape: "haack", shapeParameter: s.includes("lv") ? 0 : 0 };
  if (s.includes("conical") || s.includes("cone")) return { shape: "conical" };
  if (s.includes("elliptical") || s.includes("ellipsoid")) return { shape: "ellipsoid" };
  if (s.includes("power")) return { shape: "power", shapeParameter: 0.5 };
  if (s.includes("parabolic")) return { shape: "parabolic", shapeParameter: 1 };
  return { shape: "ogive", shapeParameter: 1 }; // "Tangent Ogive" and anything unrecognised
}

/** RASAero fin airfoil names → Loft's fin edge cross-section, which sets leading-edge pressure
 *  drag. RASAero offers a square section, a rounded ("Round") one, and streamlined sections
 *  (hexagonal, NACA, wedge) whose edges behave as an airfoil for this purpose. */
function finCrossSection(raw: string | undefined): FinCrossSection {
  const s = (raw ?? "").trim().toLowerCase();
  if (s.includes("round")) return "rounded";
  if (s.includes("square") || s === "") return "square";
  return "airfoil"; // Hexagonal, NACA, Wedge — all streamlined edges
}

/** RASAero surface finish names → Loft's roughness categories. */
function surfaceFinish(raw: string | undefined): SurfaceFinish | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (s.includes("polished")) return "polished";
  if (s.includes("smooth")) return "smooth-paint";
  if (s.includes("paint")) return "regular-paint";
  if (s.includes("unfinished") || s.includes("bare")) return "unfinished";
  if (s.includes("rough")) return "rough";
  return "regular-paint";
}

/** A `<Fin>` block hanging off a body tube, fin can, or boattail → a trapezoidal fin set placed
 *  at the fin's own station within its parent. RASAero gives root chord, tip chord, span, sweep
 *  distance and thickness directly, all in inches. */
function finSet(node: XmlNode, parentLength: number): TrapezoidFinSet | null {
  const count = Math.round(n(node, "Count", 0));
  const chord = n(node, "Chord", 0) * IN;
  if (count < 1 || !(chord > 0)) return null;
  // `Location` is the fin root leading edge measured aft from the parent's fore end.
  const offset = Math.min(Math.max(0, n(node, "Location", 0) * IN), Math.max(0, parentLength - chord));
  return {
    id: nextId(),
    name: "Fins",
    kind: "trapezoidfinset",
    placement: { method: "top", offset },
    finCount: count,
    rootChord: chord,
    tipChord: n(node, "TipChord", 0) * IN,
    height: n(node, "Span", 0) * IN,
    sweepLength: n(node, "SweepDistance", 0) * IN,
    thickness: n(node, "Thickness", 0) * IN || 0.003,
    crossSection: finCrossSection(childText(node, "AirfoilSection")),
    children: [],
  };
}

/** A launch lug or rail guide declared on a body-tube-like part, for its parasitic drag. */
function externals(node: XmlNode): RocketComponent[] {
  const out: RocketComponent[] = [];
  const lugDia = n(node, "LaunchLugDiameter", 0) * IN;
  const lugLen = n(node, "LaunchLugLength", 0) * IN;
  if (lugDia > 0) {
    out.push({
      id: nextId(),
      name: "Launch lug",
      kind: "launchlug",
      placement: { method: "top", offset: 0 },
      radius: lugDia / 2,
      length: lugLen || undefined,
      children: [],
    } as RocketComponent);
  }
  const railDia = n(node, "RailGuideDiameter", 0) * IN;
  if (railDia > 0) {
    out.push({
      id: nextId(),
      name: "Rail guide",
      kind: "railbutton",
      placement: { method: "top", offset: 0 },
      radius: railDia / 2,
      instanceCount: 2,
      children: [],
    } as RocketComponent);
  }
  return out;
}

/** A boattail declared inline on a body tube (RASAero lets a tube carry its own tapered tail
 *  rather than a separate part) → a contracting transition appended after the tube. */
function inlineBoattail(node: XmlNode, foreRadius: number): Transition | null {
  const len = n(node, "BoattailLength", 0) * IN;
  const rear = (n(node, "BoattailRearDiameter", 0) * IN) / 2;
  if (!(len > 0) || !(rear > 0)) return null;
  return {
    id: nextId(),
    name: "Boattail",
    kind: "transition",
    placement: { method: "after", offset: 0 },
    length: len,
    foreRadius,
    aftRadius: rear,
    shape: "conical",
    children: [],
  };
}

/** Translate one `<RocketDesign>` part into body components, in nose→tail order. A part may
 *  expand into more than one component (a tube with an inline boattail, a fin can that is a tube
 *  plus its fin set). Unsupported parts are reported and skipped. */
function parseParts(
  design: XmlNode,
  warnings: string[],
): { components: RocketComponent[]; boosters: RocketComponent[][] } {
  const components: RocketComponent[] = [];
  // One list per `<Booster>` part, nose→tail, each the makings of one stage below the sustainer.
  const boosters: RocketComponent[][] = [];
  let lastRadius = 0;

  for (const node of design.children) {
    const type = childText(node, "PartType") ?? node.name;
    const length = n(node, "Length", 0) * IN;
    const radius = (n(node, "Diameter", 0) * IN) / 2;

    switch (type) {
      case "NoseCone": {
        const { shape, shapeParameter } = noseShape(childText(node, "Shape"));
        const nose: NoseCone = {
          id: nextId(),
          name: "Nose cone",
          kind: "nosecone",
          placement: { method: "after", offset: 0 },
          length,
          aftRadius: radius,
          shape,
          shapeParameter,
          children: [],
        };
        lastRadius = radius;
        components.push(nose);
        break;
      }
      case "BodyTube":
      case "FinCan":
      case "Booster": {
        // A `<Booster>` is structurally a tube with its own fins and (usually) an inline
        // boattail — the same shape as a fin can — so it is built exactly the same way and then
        // collected into its own stage rather than appended to the sustainer's stack.
        const into = type === "Booster" ? [] : components;
        const kids: RocketComponent[] = [...externals(node)];
        const fin = child(node, "Fin");
        if (fin) {
          const set = finSet(fin, length);
          if (set) kids.push(set);
        }
        const tube: BodyTube = {
          id: nextId(),
          name: type === "Booster" ? "Booster tube" : type === "FinCan" ? "Fin can" : "Body tube",
          kind: "bodytube",
          placement: { method: "after", offset: 0 },
          length,
          outerRadius: radius || lastRadius,
          children: kids,
        };
        lastRadius = tube.outerRadius;
        into.push(tube);
        const bt = inlineBoattail(node, tube.outerRadius);
        if (bt) {
          into.push(bt);
          lastRadius = bt.aftRadius;
        }
        if (type === "Booster") boosters.push(into);
        break;
      }
      case "Transition":
      case "BoatTail": {
        const rear = (n(node, "RearDiameter", 0) * IN) / 2;
        const fore = radius || lastRadius;
        const tr: Transition = {
          id: nextId(),
          name: type === "BoatTail" ? "Boattail" : "Transition",
          kind: "transition",
          placement: { method: "after", offset: 0 },
          length,
          foreRadius: fore,
          aftRadius: rear || fore,
          shape: "conical",
          children: [],
        };
        // A boattail or transition can carry its own fin set (a tail-mounted fin on a tapered
        // section). It is mounted rather than dropped: the aerodynamics take a fin's body radius
        // from the airframe at the fin's own station, not from a constant-radius assumption, so a
        // taper is handled — and dropping the set loses ALL of its drag and normal force, which is
        // a far bigger error than the taper's own small radius variation across the root chord.
        const fin = child(node, "Fin");
        if (fin) {
          const set = finSet(fin, length);
          if (set) tr.children.push(set);
        }
        lastRadius = tr.aftRadius;
        components.push(tr);
        break;
      }
      case "Protuberance":
        warnings.push("A protuberance (an external fitting RASAero drags explicitly) isn't modelled yet.");
        break;
      default:
        break; // <Surface>, <CP>, <Comments> and the other design-level settings, read elsewhere
    }
  }
  return { components, boosters };
}

/** RASAero names a motor as "N1000W  (AT)" — the designation, then the manufacturer's short code
 *  in parentheses. Split it so the bundled database can resolve it the same way it resolves an
 *  OpenRocket or RockSim reference. */
export function parseEngineName(raw: string): { designation: string; manufacturer?: string } {
  const m = raw.match(/^\s*(.*?)\s*\(([^)]*)\)\s*$/);
  if (m) return { designation: m[1].trim(), manufacturer: m[2].trim() || undefined };
  return { designation: raw.trim() };
}

/** Total axial length of a stack of body components (m). */
function stackLength(components: RocketComponent[]): number {
  let total = 0;
  for (const c of components) {
    if (c.kind === "nosecone" || c.kind === "bodytube" || c.kind === "transition") total += c.length;
  }
  return total;
}

/** The airframe mass component that carries a RASAero design's stated launch weight.
 *
 *  The file gives a loaded weight and a loaded CG and nothing else, so the airframe is one point
 *  mass: its mass is the launch weight less the motor's own loaded mass, and its station is set so
 *  that airframe + motor balance at exactly the CG the file states. With no motor resolved (or a
 *  launch weight lighter than the motor, which means the file's numbers disagree with themselves)
 *  the whole launch weight is placed at the stated CG instead, and the caller warns. */
export function airframeMass(
  launchMass: number,
  launchCG: number,
  motorMass: number,
  motorCG: number,
): { mass: number; station: number } {
  const mass = launchMass - motorMass;
  if (!(mass > 0) || !(motorMass > 0)) return { mass: Math.max(0, launchMass), station: launchCG };
  // m_a·x_a + m_m·x_m = (m_a + m_m)·x_cg  ⇒  x_a = (M·x_cg − m_m·x_m) / m_a
  const station = (launchMass * launchCG - motorMass * motorCG) / mass;
  return { mass, station };
}

/** What the first booster weighs and where it balances, or null when it shouldn't fly.
 *
 *  RASAero writes `SustainerLaunchWt`/`SustainerCG` and `Booster1LaunchWt`/`Booster1CG`, and the
 *  format documentation doesn't say whether the Booster1 pair describes the booster alone or the
 *  whole stack standing on the pad. The file's own geometry settles it. On the corpus's
 *  `Complex.Two-Stage.CDX1` — whose `<Booster>` spans 55.0–62.5 in — the sustainer is 4.06 lb at
 *  35.96 in and Booster1 is 5.64 lb at 43.06 in:
 *
 *    · read as the WHOLE STACK, the booster alone is 5.64 − 4.06 = 1.58 lb, and the moment balance
 *      puts its centre of gravity at 61.3 in — inside the part, and aft, where its motor and fins
 *      are. Both of that file's simulations agree (the second gives 61.2 in).
 *    · read as the BOOSTER ALONE, its centre of gravity would be 43.1 in — twelve inches forward of
 *      where the booster begins. No part balances outside itself.
 *
 *  So Booster1 is the stack at liftoff. The difference is the booster, and the difference of
 *  moments is where it balances. A file that doesn't support that reading (no booster weight, a
 *  weight at or below the sustainer's, or a derived CG outside the booster) is not flown staged —
 *  a stage with an impossible mass is worse than a stage Loft admits it skipped. */
function planBooster(
  sim: XmlNode,
  boosters: RocketComponent[][],
): { mass: number; cg: number } | null {
  if (!boosters.length) return null;
  if (!/^true$/i.test((childText(sim, "IncludeBooster1") ?? "").trim())) return null;
  const stackWt = n(sim, "Booster1LaunchWt", 0) * LB;
  const stackCg = n(sim, "Booster1CG", 0) * IN;
  const susWt = n(sim, "SustainerLaunchWt", 0) * LB;
  const susCg = n(sim, "SustainerCG", 0) * IN;
  const mass = stackWt - susWt;
  if (!(mass > 0) || !(susWt > 0) || !(stackCg > 0)) return null;
  const cg = (stackWt * stackCg - susWt * susCg) / mass;
  return Number.isFinite(cg) && cg > 0 ? { mass, cg } : null;
}

/** One `<Simulation>` → Loft's stored-results shape. RASAero stores its own predicted apogee and
 *  max velocity in US customary units; they are converted so they sit beside Loft's own numbers
 *  as an independent cross-check, exactly as OpenRocket's and RockSim's stored results do. */
function storedSim(sim: XmlNode, site: XmlNode | undefined, index: number, configId: string): StoredSimulation {
  const results: StoredResults = {};
  const alt = n(sim, "MaxAltitude", NaN);
  if (Number.isFinite(alt) && alt > 0) results.maxAltitude = alt * FT;
  const vel = n(sim, "MaxVelocity", NaN);
  if (Number.isFinite(vel) && vel > 0) results.maxVelocity = vel * FT;
  const tta = n(sim, "TimetoApogee", NaN);
  if (Number.isFinite(tta) && tta > 0) results.timeToApogee = tta;
  const ft = n(sim, "FlightTime", NaN);
  if (Number.isFinite(ft) && ft > 0) results.flightTime = ft;

  const conditions: StoredConditions = { configId };
  if (site) {
    const siteAlt = n(site, "Altitude", NaN);
    if (Number.isFinite(siteAlt)) conditions.launchAltitude = siteAlt * FT;
    const temp = n(site, "Temperature", NaN);
    if (Number.isFinite(temp)) conditions.baseTempK = fToK(temp);
    const press = n(site, "Pressure", NaN);
    if (Number.isFinite(press) && press > 0) conditions.basePressurePa = press * INHG;
    const wind = n(site, "WindSpeed", NaN);
    if (Number.isFinite(wind)) conditions.windSpeed = wind * MPH;
    const rodAngle = n(site, "RodAngle", NaN);
    if (Number.isFinite(rodAngle)) conditions.rodAngleDeg = rodAngle;
    // RASAero states the launch rod/rail length in feet.
    const rodLen = n(site, "RodLength", NaN);
    if (Number.isFinite(rodLen) && rodLen > 0) conditions.rodLength = rodLen * FT;
  }

  const engine = childText(sim, "SustainerEngine") ?? "";
  return {
    name: engine.trim() ? parseEngineName(engine).designation : `Simulation ${index + 1}`,
    conditions,
    results,
    hasResults: Number.isFinite(results.maxAltitude ?? NaN),
  };
}

/** Recovery devices from the design-level `<Recovery>` block. RASAero models up to two events,
 *  each with a device type, a drag coefficient and a diameter (feet), deploying at apogee (event
 *  1) or at a set altitude (event 2) — the standard dual-deploy arrangement. */
function recovery(rec: XmlNode | undefined, warnings: string[]): Parachute[] {
  if (!rec) return [];
  const out: Parachute[] = [];
  for (const i of [1, 2] as const) {
    const type = (childText(rec, `DeviceType${i}`) ?? "None").trim();
    if (!type || type.toLowerCase() === "none") continue;
    const size = n(rec, `Size${i}`, 0) * FT; // canopy diameter, feet
    const cd = n(rec, `CD${i}`, 0.8) || 0.8;
    if (!(size > 0)) continue;
    if (!/chute|parachute/i.test(type)) {
      warnings.push(`Recovery device ${i} is a ${type}; it was flown as a canopy of the stated size and Cd.`);
    }
    // Event 1 is the apogee event; event 2 deploys at its stated altitude.
    const altitudeFt = n(rec, `Altitude${i}`, 0);
    out.push({
      id: nextId(),
      name: i === 1 ? "Drogue" : "Main",
      kind: "parachute",
      placement: { method: "top", offset: 0 },
      cd,
      diameter: size,
      mass: 0, // the stated launch weight already includes it; see the mass note at the top
      deployEvent: i === 1 ? "apogee" : "altitude",
      deployAltitude: i === 2 && altitudeFt > 0 ? altitudeFt * FT : undefined,
      deployDelay: 0,
      children: [],
    });
  }
  return out;
}

/** Parse a `.CDX1` XML string into the canonical document. */
export function adaptRasAeroXml(xml: string): OrkDocument {
  idCounter = 0;
  const root = parseXml(xml);
  if (root.name !== "RASAeroDocument") {
    throw new Error(`Not a RASAero file (root <${root.name}>)`);
  }
  const design = child(root, "RocketDesign");
  if (!design) throw new Error("RASAero file has no <RocketDesign> element");

  const warnings: string[] = [];
  const { components, boosters } = parseParts(design, warnings);
  if (!components.length) throw new Error("RASAero file has no recognisable airframe parts");

  const finish = surfaceFinish(childText(design, "Surface"));
  if (finish) for (const c of [...components, ...boosters.flat()]) if (!c.finish) c.finish = finish;

  // Recovery hangs off the aftmost body tube, which is where a RASAero design's chute lives.
  const rec = recovery(child(root, "Recovery"), warnings);
  if (rec.length) {
    const host = [...components].reverse().find((c) => c.kind === "bodytube") ?? components[components.length - 1];
    host.children.push(...rec);
  }

  const site = child(root, "LaunchSite");
  const simNodes = children(child(root, "SimulationList") ?? { name: "", attrs: {}, children: [], text: "" }, "Simulation");

  // Whether the first booster flies as a real stage. RASAero states the stack's weights per
  // simulation but the airframe is one document, so this is decided from the first simulation —
  // the same one the sustainer's stated launch weight already comes from.
  const firstSim = simNodes[0];
  const boosterPlan = firstSim ? planBooster(firstSim, boosters) : null;
  const boosterParts = boosterPlan ? boosters[0] : [];
  const boosterTube = boosterParts.find((c) => c.kind === "bodytube") as BodyTube | undefined;
  // RASAero holds the spent booster on for this long after it burns out before letting it go.
  const boosterSeparationDelay = firstSim ? Math.max(0, n(firstSim, "Booster1SeparationDelay", 0)) : 0;
  const droppedBoosters = boosters.length - (boosterPlan ? 1 : 0);
  if (droppedBoosters > 0) {
    warnings.push(
      `This design has ${droppedBoosters === 1 ? "a further RASAero booster stage" : `${droppedBoosters} further RASAero booster stages`}, ` +
        `which aren't simulated yet — only the stages above ${droppedBoosters === 1 ? "it" : "them"} were flown.`,
    );
  }

  const configurations: MotorConfiguration[] = [];
  const simulations: StoredSimulation[] = [];
  simNodes.forEach((sim, i) => {
    const id = `sim${i}`;
    const raw = childText(sim, "SustainerEngine") ?? "";
    const instances: MotorInstance[] = [];
    if (raw.trim()) {
      const { designation, manufacturer } = parseEngineName(raw);
      instances.push({
        mountId: components.find((c) => c.kind === "bodytube")?.id ?? components[0].id,
        // RASAero states a nozzle exit diameter but no casing envelope, so the casing size is
        // left to the bundled curve — which is where Loft reads it from for any format.
        motor: { designation, manufacturer, type: "unknown", diameter: 0, length: 0 },
        // Measured from the stage below burning out, which is exactly what Loft's serial staging
        // does with an upper stage's ignition delay (and from launch on a single-stage design).
        ignitionDelay: n(sim, "SustainerIgnitionDelay", 0),
      });
    }
    const boosterRaw = childText(sim, "Booster1Engine") ?? "";
    if (boosterTube && boosterRaw.trim()) {
      const { designation, manufacturer } = parseEngineName(boosterRaw);
      instances.push({
        mountId: boosterTube.id,
        motor: { designation, manufacturer, type: "unknown", diameter: 0, length: 0 },
        ignitionDelay: n(sim, "Booster1IgnitionDelay", 0),
      });
    }
    configurations.push({ id, name: parseEngineName(raw).designation || `Simulation ${i + 1}`, instances });
    simulations.push(storedSim(sim, site, i, id));
  });
  if (!configurations.length) configurations.push({ id: "default", instances: [] });

  // The mount is the aftmost body tube, so the motor sits where it actually sits. The booster's own
  // motor already points at the booster's tube and must keep doing so.
  const aftTube = [...components].reverse().find((c) => c.kind === "bodytube") as BodyTube | undefined;
  if (aftTube) {
    aftTube.motorMount = { overhang: 0 };
    for (const cfg of configurations) {
      for (const inst of cfg.instances) if (inst.mountId !== boosterTube?.id) inst.mountId = aftTube.id;
    }
  }
  if (boosterTube) boosterTube.motorMount = { overhang: 0 };

  // The stated launch weight, as one airframe mass component (see the mass note at the top).
  const first = simNodes[0];
  const launchMass = first ? n(first, "SustainerLaunchWt", 0) * LB : 0;
  const launchCG = first ? n(first, "SustainerCG", 0) * IN : 0;
  const total = stackLength(components);
  if (launchMass > 0) {
    const raw = first ? (childText(first, "SustainerEngine") ?? "") : "";
    const { designation, manufacturer } = parseEngineName(raw);
    const match = designation ? resolveMotor({ designation, manufacturer }) : null;
    const motorMass = match ? match.entry.curve.totalMass : 0;
    // The motor's CG is taken at the middle of its casing, sitting at the aft end of the stack.
    const motorLen = match ? match.entry.curve.lengthMm / 1000 : 0;
    const motorCG = total - motorLen / 2;
    const { mass, station } = airframeMass(launchMass, launchCG > 0 ? launchCG : total / 2, motorMass, motorCG);
    if (!(match && launchMass > motorMass)) {
      warnings.push(
        "This design's motor couldn't be weighed from the bundled data, so its stated launch weight " +
          "was placed whole at the stated CG — the airframe and motor aren't separated.",
      );
    }
    const airframe: MassComponent = {
      id: nextId(),
      name: "Airframe (stated launch weight)",
      kind: "masscomponent",
      // Clamped into the airframe so a file whose stated CG disagrees with its own geometry can't
      // put the mass outside the rocket.
      placement: { method: "absolute", offset: Math.min(Math.max(0, station), Math.max(0, total)) },
      mass,
      children: [],
    };
    (components.find((c) => c.kind === "bodytube") ?? components[0]).children.push(airframe);
    warnings.push(
      `A RASAero design carries no materials or per-part masses, so the flight uses the file's own ` +
        `stated launch weight (${(launchMass / LB).toFixed(1)} lb) and CG.`,
    );
  } else {
    warnings.push("This design states no launch weight, so it has no mass to fly.");
  }

  // The booster's own mass, by the same reading of the file that decided it flies: the difference
  // between the stack's stated liftoff weight and the sustainer's, balanced at the difference of
  // their moments, with its motor separated out exactly as the sustainer's is.
  if (boosterPlan && boosterParts.length) {
    const boosterRaw = firstSim ? (childText(firstSim, "Booster1Engine") ?? "") : "";
    const { designation, manufacturer } = parseEngineName(boosterRaw);
    const match = designation ? resolveMotor({ designation, manufacturer }) : null;
    const motorMass = match ? match.entry.curve.totalMass : 0;
    const boosterEnd = total + stackLength(boosterParts);
    const motorCG = boosterEnd - (match ? match.entry.curve.lengthMm / 1000 : 0) / 2;
    const { mass, station } = airframeMass(boosterPlan.mass, boosterPlan.cg, motorMass, motorCG);
    const booster: MassComponent = {
      id: nextId(),
      name: "Booster (stated launch weight)",
      kind: "masscomponent",
      placement: { method: "absolute", offset: Math.min(Math.max(total, station), boosterEnd) },
      mass,
      children: [],
    };
    (boosterTube ?? boosterParts[0]).children.push(booster);
    warnings.push(
      `This design's booster flies as its own stage: ${(boosterPlan.mass / LB).toFixed(2)}\u00a0lb, the ` +
        `difference between the stack's stated liftoff weight and the sustainer's, separating at ` +
        `burnout${boosterSeparationDelay > 0 ? ` plus ${boosterSeparationDelay.toFixed(1)}\u00a0s` : ""}. ` +
        `Its own descent isn't tracked — only the sustainer is flown to the ground.`,
    );
  }

  const rocket: Rocket = {
    name: childText(design, "Comments")?.trim().split("\n")[0] || "RASAero design",
    stages: boosterPlan
      ? [
          { name: "Sustainer", components },
          {
            name: "Booster",
            components: boosterParts,
            separationEvent: "burnout" as const,
            separationDelay: boosterSeparationDelay,
          },
        ]
      : [{ name: "Sustainer", components }],
    configurations,
    defaultConfigId: configurations[0]?.id,
    referenceType: "maximum",
  };

  return {
    rocket,
    simulations,
    formatVersion: `RASAero ${childText(root, "FileVersion") ?? "?"}`,
    creator: "RASAero II",
    warnings,
    // RASAero's stored numbers come from its own solver on the same geometry, so the comparison is
    // like-for-like — except when a booster was dropped, which is a different vehicle. A booster
    // Loft actually flies is not a reduction, so the comparison stands.
    flownAsReduced: droppedBoosters > 0,
  };
}
