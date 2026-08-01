/** Serialize the internal `Rocket` model back to an OpenRocket `.ork` file — the write side of the
 *  importer, so a design built or edited in Loft is durable and portable (it re-opens in Loft and,
 *  using OpenRocket's own 1.10 schema and container, in OpenRocket). Element names, units, and
 *  nesting mirror exactly what `adapt.ts` reads, so a design round-trips through export → import
 *  unchanged. Motors live in the rocket's configurations (keyed by mount), so they are indexed by
 *  mount and emitted back onto the owning component's `<motormount>`. */

import type {
  Rocket,
  RocketComponent,
  Material,
  SurfaceFinish,
  Placement,
  MotorInstance,
  DeployEvent,
  DeploySetting,
  SeparationSetting,
} from "../model/types";
import type { OrkDocument } from "./import";
import { storeZip } from "./zipwrite";
import { uniqueUuidFrom } from "../model/id";

/** Internal finish → OpenRocket `<finish>` token (the inverse of the importer's parseFinish). */
const FINISH_OUT: Record<SurfaceFinish, string> = {
  rough: "rough",
  unfinished: "unfinished",
  "regular-paint": "normal",
  "smooth-paint": "smooth",
  polished: "polished",
  mirror: "polished",
};

/** Internal motor type → OpenRocket `<type>` token. */
const MOTOR_TYPE_OUT: Record<string, string> = {
  "single-use": "single",
  reload: "reload",
  hybrid: "hybrid",
  unknown: "single",
};

/** Internal deploy event → OpenRocket `<deployevent>` token (inverse of the importer's map; note
 *  OpenRocket spells lower-stage separation without the hyphen). */
const DEPLOY_OUT: Record<DeployEvent, string> = {
  launch: "launch",
  ejection: "ejection",
  apogee: "apogee",
  altitude: "altitude",
  never: "never",
  "lowerstage-separation": "lowerstageseparation",
};

/** Per-configuration deployment overrides — a recovery device deploying differently per motor
 *  config (drogue at apogee in one, main at altitude in another). Without these a multi-config
 *  design's recovery falls back to the default event, which can deploy at the wrong time. */
function deployConfigsXml(configs: Record<string, DeploySetting> | undefined, pad: string): string {
  if (!configs) return "";
  return Object.entries(configs)
    .map(
      ([cid, s]) =>
        `${pad}<deploymentconfiguration configid="${esc(cid)}">\n` +
        `${pad}  <deployevent>${DEPLOY_OUT[s.event]}</deployevent>\n` +
        (s.altitude !== undefined ? `${pad}  <deployaltitude>${num(s.altitude)}</deployaltitude>\n` : "") +
        `${pad}  <deploydelay>${num(s.delay)}</deploydelay>\n` +
        `${pad}</deploymentconfiguration>\n`,
    )
    .join("");
}

/** Per-configuration stage-separation overrides — a booster that drops at its ejection charge on
 *  one motor but at upper-stage ignition on another. Without these a saved multi-config staged
 *  design would fall back to the default separation event, which can carry the booster far past
 *  staging (a large apogee error on re-open). */
function separationConfigsXml(configs: Record<string, SeparationSetting> | undefined, pad: string): string {
  if (!configs) return "";
  return Object.entries(configs)
    .map(
      ([cid, s]) =>
        `${pad}<separationconfiguration configid="${esc(cid)}">\n` +
        (s.event ? `${pad}  <separationevent>${s.event}</separationevent>\n` : "") +
        (s.delay !== undefined ? `${pad}  <separationdelay>${num(s.delay)}</separationdelay>\n` : "") +
        `${pad}</separationconfiguration>\n`,
    )
    .join("");
}

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/** Trim a number to a compact but loss-free-enough decimal (avoids 1.2000000000004 noise). */
function num(x: number): string {
  if (!Number.isFinite(x)) return "0";
  return String(Number(x.toFixed(6)));
}

function materialXml(m: Material | undefined, pad: string): string {
  if (!m) return "";
  return `${pad}<material type="${m.type}" density="${num(m.density)}">${esc(m.name)}</material>\n`;
}

function finishXml(f: SurfaceFinish | undefined, pad: string): string {
  return f ? `${pad}<finish>${FINISH_OUT[f]}</finish>\n` : "";
}

/** Axial offset element — omitted for the default (after / 0), matching how OpenRocket files stack
 *  top-level body components without an explicit offset. */
function axialXml(p: Placement, pad: string): string {
  if (p.method === "after" && p.offset === 0) return "";
  return `${pad}<axialoffset method="${p.method}">${num(p.offset)}</axialoffset>\n`;
}

/** Mass/CG overrides — a measured weight standing in for the computed one. Shared by components and
 *  stages (a stage is a component assembly that can carry its own measured mass). */
function overrideXml(
  c: { overrideMass?: number; overrideCGx?: number; overrideSubcomponents?: boolean },
  pad: string,
): string {
  return (
    (c.overrideMass !== undefined ? `${pad}<overridemass>${num(c.overrideMass)}</overridemass>\n` : "") +
    (c.overrideCGx !== undefined ? `${pad}<overridecg>${num(c.overrideCGx)}</overridecg>\n` : "") +
    (c.overrideSubcomponents ? `${pad}<overridesubcomponentsmass>true</overridesubcomponentsmass>\n` : "")
  );
}

/** A nose/transition shoulder (the tube stub that plugs into the neighbouring body) — carries its
 *  own material mass, so it must survive the round-trip. Emitted only when a shoulder is present. */
function shoulderXml(
  end: "fore" | "aft",
  length: number | undefined,
  radius: number | undefined,
  thickness: number | undefined,
  capped: boolean | undefined,
  pad: string,
): string {
  if (!length) return "";
  return (
    `${pad}<${end}shoulderlength>${num(length)}</${end}shoulderlength>\n` +
    (radius !== undefined ? `${pad}<${end}shoulderradius>${num(radius)}</${end}shoulderradius>\n` : "") +
    (thickness !== undefined ? `${pad}<${end}shoulderthickness>${num(thickness)}</${end}shoulderthickness>\n` : "") +
    (capped ? `${pad}<${end}shouldercapped>true</${end}shouldercapped>\n` : "")
  );
}

/** A motor mount holding more than one motor — OpenRocket's cluster preset (`N-ring`), read back
 *  as the motor count. Sits on the mount component, beside its <motormount>. */
function clusterXml(clusterCount: number | undefined, pad: string): string {
  return clusterCount && clusterCount > 1 ? `${pad}<clusterconfiguration>${clusterCount}-ring</clusterconfiguration>\n` : "";
}

/** Ids for the elements the internal model does not carry one for — the rocket and its stages. A
 *  `Rocket` has no id and neither does a `Stage`, so there is nothing to preserve and a per-export
 *  counter is the honest answer. Reset at the top of `serializeRocketXml`, so the same design always
 *  serialises byte-identically. COMPONENT ids are different: they come from the component itself, via
 *  `componentId` below. */
let uid = 0;
function nextUuid(): string {
  let out: string;
  do {
    uid += 1;
    out = `10f70000-0000-4000-8000-${String(uid).padStart(12, "0")}`;
  } while (writtenIds.has(out));
  writtenIds.add(out);
  return out;
}

/** Every id written in this serialisation, so nothing can be given the same one twice. The rocket and
 *  stage mints above share it: their values land in different elements, so a clash would be harmless, but
 *  a single set costs nothing and removes the question — and it is uniqueness WITHIN a file that the
 *  format requires. Reset alongside `uid`. */
let writtenIds = new Set<string>();

/** The `<id>` to write for a component: its OWN id, which is the whole point — a design exported and
 *  re-imported has to come back as the same parts, or an aim or an operation addressed at one of them
 *  resolves to nothing. Non-UUID ids (the adapters' positional fallbacks, and the derived ids a
 *  structural add mints) go through `uniqueUuidFrom`, which derives a stable UUID rather than a fresh
 *  one. See `lib/model/id.ts` for why the shape is not negotiable. */
function componentId(c: { id: string }): string {
  return uniqueUuidFrom(c.id, writtenIds);
}

/** Motors indexed by the id of the mount they sit in, so a mount component can emit its `<motor>`s. */
type MotorsByMount = Map<string, Array<{ configId: string; inst: MotorInstance }>>;

function motorMountXml(mountId: string, overhang: number, motors: MotorsByMount, pad: string): string {
  const list = motors.get(mountId) ?? [];
  const inner = list
    .map(({ configId, inst }) => {
      const m = inst.motor;
      const type = MOTOR_TYPE_OUT[m.type] ?? "single";
      return (
        `${pad}  <motor configid="${esc(configId)}">\n` +
        `${pad}    <type>${type}</type>\n` +
        (m.manufacturer ? `${pad}    <manufacturer>${esc(m.manufacturer)}</manufacturer>\n` : "") +
        `${pad}    <designation>${esc(m.designation)}</designation>\n` +
        `${pad}    <diameter>${num(m.diameter)}</diameter>\n` +
        `${pad}    <length>${num(m.length)}</length>\n` +
        (m.delay !== undefined ? `${pad}    <delay>${num(m.delay)}</delay>\n` : "") +
        `${pad}  </motor>\n`
      );
    })
    .join("");
  const first = list[0]?.inst;
  // Per-configuration ignition, one `<ignitionconfiguration configid=…>` per config that differs from
  // the mount default. The importer has always READ these (`adapt.ts`, `ignByConfig`) — writing only
  // the mount-level pair meant `list[0]`'s timing was applied to every configuration, so a design
  // whose whole reason for existing is a staggered airstart came back with the stagger gone.
  // Measured on `Airstart timing.ork`: four configurations at +1 s, +2 s, +4 s and +6 s all returned
  // at +0 s, and its five configurations — which fly 1268.50 m to 1296.52 m — all flew the identical
  // 1296.52 m. Written only where a configuration DIFFERS from the mount default, so a design that
  // never used the feature gains no elements.
  const ignConfigs = list
    .filter(
      ({ inst }) =>
        (inst.ignitionEvent ?? first?.ignitionEvent) !== first?.ignitionEvent ||
        (inst.ignitionDelay ?? 0) !== (first?.ignitionDelay ?? 0),
    )
    .map(
      ({ configId, inst }) =>
        `${pad}  <ignitionconfiguration configid="${esc(configId)}">\n` +
        `${pad}    <ignitionevent>${esc(inst.ignitionEvent ?? first?.ignitionEvent ?? "automatic")}</ignitionevent>\n` +
        `${pad}    <ignitiondelay>${num(inst.ignitionDelay ?? 0)}</ignitiondelay>\n` +
        `${pad}  </ignitionconfiguration>\n`,
    )
    .join("");
  return (
    `${pad}<motormount>\n` +
    `${pad}  <ignitionevent>${esc(first?.ignitionEvent ?? "automatic")}</ignitionevent>\n` +
    `${pad}  <ignitiondelay>${num(first?.ignitionDelay ?? 0)}</ignitiondelay>\n` +
    ignConfigs +
    `${pad}  <overhang>${num(overhang)}</overhang>\n` +
    inner +
    `${pad}</motormount>\n`
  );
}

function childrenXml(cs: RocketComponent[], motors: MotorsByMount, depth: number): string {
  if (cs.length === 0) return "";
  const pad = "  ".repeat(depth);
  return (
    `${pad}<subcomponents>\n` +
    cs.map((c) => componentXml(c, motors, depth + 1)).join("") +
    `${pad}</subcomponents>\n`
  );
}

/** Serialize one component (and its subtree) to its OpenRocket element.
 *
 *  Every case writes `overrides`. Six of them did not, and the mass a design STATED for those parts
 *  was silently replaced on a round trip by the one Loft computes from their material. Measured across
 *  the 27 real `.ork` designs in the corpus: 5 changed dry mass on a download → re-import, and on
 *  `USLI2025-FULLSCALE` the shock cord's stated 304.0 g became its computed 2,220.7 g — the whole
 *  design going 12,620.2 g → 14,528.7 g, +15.1%, with the CG moving 60.8 mm, and nothing said. A
 *  stated mass is a measurement the flyer put on the scale; a computed one is a guess from a density.
 *  Replacing the first with the second is the worst direction that trade can go. */
function componentXml(c: RocketComponent, motors: MotorsByMount, depth: number): string {
  const pad = "  ".repeat(depth);
  const p = pad + "  ";
  const head = `${pad}<${c.kind}>\n${p}<name>${esc(c.name)}</name>\n${p}<id>${componentId(c)}</id>\n`;
  const common = axialXml(c.placement, p) + finishXml(c.finish, p) + materialXml(c.material, p);
  const overrides = overrideXml(c, p);
  const kids = childrenXml(c.children, motors, depth + 1);
  const close = `${pad}</${c.kind}>\n`;

  switch (c.kind) {
    case "nosecone":
      return (
        head + common + overrides +
        `${p}<length>${num(c.length)}</length>\n` +
        (c.thickness ? `${p}<thickness>${num(c.thickness)}</thickness>\n` : "") +
        `${p}<shape>${c.shape}</shape>\n` +
        (c.shapeParameter !== undefined ? `${p}<shapeparameter>${num(c.shapeParameter)}</shapeparameter>\n` : "") +
        `${p}<aftradius>${num(c.aftRadius)}</aftradius>\n` +
        shoulderXml("aft", c.aftShoulderLength, c.aftShoulderRadius, c.aftShoulderThickness, c.aftShoulderCapped, p) +
        kids + close
      );
    case "bodytube":
      return (
        head + common + overrides +
        `${p}<length>${num(c.length)}</length>\n` +
        (c.thickness ? `${p}<thickness>${num(c.thickness)}</thickness>\n` : "") +
        `${p}<radius>${num(c.outerRadius)}</radius>\n` +
        (c.motorMount ? clusterXml(c.motorMount.clusterCount, p) + motorMountXml(c.id, c.motorMount.overhang, motors, p) : "") +
        kids + close
      );
    case "transition":
      return (
        head + common + overrides +
        `${p}<length>${num(c.length)}</length>\n` +
        (c.thickness ? `${p}<thickness>${num(c.thickness)}</thickness>\n` : "") +
        `${p}<shape>${c.shape}</shape>\n` +
        (c.shapeParameter !== undefined ? `${p}<shapeparameter>${num(c.shapeParameter)}</shapeparameter>\n` : "") +
        `${p}<foreradius>${num(c.foreRadius)}</foreradius>\n` +
        `${p}<aftradius>${num(c.aftRadius)}</aftradius>\n` +
        shoulderXml("fore", c.foreShoulderLength, c.foreShoulderRadius, c.foreShoulderThickness, c.foreShoulderCapped, p) +
        shoulderXml("aft", c.aftShoulderLength, c.aftShoulderRadius, c.aftShoulderThickness, c.aftShoulderCapped, p) +
        kids + close
      );
    case "trapezoidfinset":
      return (
        head + common + overrides +
        `${p}<fincount>${c.finCount}</fincount>\n` +
        `${p}<thickness>${num(c.thickness)}</thickness>\n` +
        (c.crossSection ? `${p}<crosssection>${c.crossSection}</crosssection>\n` : "") +
        `${p}<rootchord>${num(c.rootChord)}</rootchord>\n` +
        `${p}<tipchord>${num(c.tipChord)}</tipchord>\n` +
        `${p}<sweeplength>${num(c.sweepLength)}</sweeplength>\n` +
        `${p}<height>${num(c.height)}</height>\n` +
        kids + close
      );
    case "ellipticalfinset":
      // An elliptical fin is a half-ellipse fully described by its root chord and span, so write it
      // back as an ellipticalfinset: the importer re-derives the same area (πab/4) and the aero
      // recomputes its exact centre of pressure and leading-edge sweep — a lossless round-trip.
      return (
        head + common + overrides +
        `${p}<fincount>${c.finCount}</fincount>\n` +
        `${p}<thickness>${num(c.thickness)}</thickness>\n` +
        (c.crossSection ? `${p}<crosssection>${c.crossSection}</crosssection>\n` : "") +
        `${p}<rootchord>${num(c.rootChord)}</rootchord>\n` +
        `${p}<height>${num(c.height)}</height>\n` +
        `${p}<sweeplength>${num(c.sweepLength)}</sweeplength>\n` +
        kids + close
      );
    case "freeformfinset": {
      // A freeform fin's outline (its <finpoints>) isn't retained after import — only its reduced
      // area, span, and sweep — so it is written as the aerodynamically-equivalent trapezoid (equal
      // area, span, and sweep). The flight is preserved to within the exact-vs-trapezoid CP
      // difference; the true freeform planform is not recoverable. tip = 2·area/height − root.
      //
      // **The equal-area claim above is FALSE whenever the planform tapers hard**, and it is left
      // that way deliberately rather than half-fixed. The tip solution goes negative once
      // 2·area/height < root — which is much of what freeform fins are drawn for — and the clamp then
      // exports a fin strictly LARGER than the one drawn: on `Pods--airframes and winglets.ork` the
      // "Wings" set comes back 42% bigger in area, and the static margin reads 2.13 → 1.45 cal.
      //
      // Shrinking the ROOT to 2·area/height instead was tried on 2026-07-31 and reverted, because it
      // is worse in two ways the area figure hides. A zero-area planform — which `planformFromPoints`
      // can produce from collinear points — would write a root of 0, and `finContribution` drops a fin
      // set with no root entirely, so the set VANISHES from lift and drag rather than being slightly
      // wrong. And `axialLength` of a fin set IS its root chord, so under a `bottom` or `middle`
      // anchor a shorter root translates the whole planform down the tube: the same file's "Wings"
      // moved 52.4 mm aft. A fin 52 mm from where the flyer put it is a worse lie than a fin 42%
      // too big, and the margin it produced was better only by the accident of that displacement.
      //
      // The honest fix is to stop discarding the outline — write `<finpoints>` and round-trip the
      // real planform — which needs the model to retain the points it currently reduces away at
      // import. That is R6's work and is filed in `BACKLOG.md` with these measurements. Until then
      // the loss is disclosed on `/docs/limitations` with its size rather than papered over.
      const tip = c.height > 0 ? Math.max(0, (2 * c.area) / c.height - c.rootChord) : c.rootChord;
      return (
        `${pad}<trapezoidfinset>\n${p}<name>${esc(c.name)}</name>\n${p}<id>${componentId(c)}</id>\n` +
        common + overrides +
        `${p}<fincount>${c.finCount}</fincount>\n` +
        `${p}<thickness>${num(c.thickness)}</thickness>\n` +
        (c.crossSection ? `${p}<crosssection>${c.crossSection}</crosssection>\n` : "") +
        `${p}<rootchord>${num(c.rootChord)}</rootchord>\n` +
        `${p}<tipchord>${num(tip)}</tipchord>\n` +
        `${p}<sweeplength>${num(c.sweepLength)}</sweeplength>\n` +
        `${p}<height>${num(c.height)}</height>\n` +
        childrenXml(c.children, motors, depth + 1) +
        `${pad}</trapezoidfinset>\n`
      );
    }
    case "tubefinset":
      // Written with an explicit radius rather than OpenRocket's "auto", so a set whose tubes were
      // sized against a body Loft has since resized still round-trips to the geometry it flew.
      return (
        head + common + overrides +
        `${p}<fincount>${c.finCount}</fincount>\n` +
        `${p}<length>${num(c.length)}</length>\n` +
        `${p}<radius>${num(c.outerRadius)}</radius>\n` +
        `${p}<thickness>${num(c.thickness)}</thickness>\n` +
        kids + close
      );
    case "innertube":
      return (
        head + common + overrides +
        `${p}<length>${num(c.length)}</length>\n` +
        `${p}<outerradius>${num(c.outerRadius)}</outerradius>\n` +
        `${p}<thickness>${num(Math.max(0, c.outerRadius - c.innerRadius))}</thickness>\n` +
        (c.motorMount ? clusterXml(c.motorMount.clusterCount, p) + motorMountXml(c.id, c.motorMount.overhang, motors, p) : "") +
        kids + close
      );
    case "tubecoupler":
    case "centeringring":
    case "bulkhead":
    case "engineblock":
      return (
        head + common + overrides +
        `${p}<length>${num(c.length)}</length>\n` +
        `${p}<outerradius>${num(c.outerRadius)}</outerradius>\n` +
        `${p}<innerradius>${num(c.innerRadius)}</innerradius>\n` +
        kids + close
      );
    case "masscomponent":
      return (
        head + common + overrides +
        `${p}<mass>${num(c.mass)}</mass>\n` +
        (c.length !== undefined ? `${p}<packedlength>${num(c.length)}</packedlength>\n` : "") +
        (c.radius !== undefined ? `${p}<packedradius>${num(c.radius)}</packedradius>\n` : "") +
        (c.massType ? `${p}<masscomponenttype>${esc(c.massType)}</masscomponenttype>\n` : "") +
        close
      );
    case "parachute":
      return (
        head + common + overrides +
        `${p}<cd>${num(c.cd)}</cd>\n` +
        `${p}<diameter>${num(c.diameter)}</diameter>\n` +
        // The PACKED dimensions, not the canopy's. `lib/sim/mass.ts` puts a packed canopy's CG at
        // half its packed length, so omitting these moved every parachute's mass forward to the
        // front face of its bay on re-import — silently, and on the design's own saved copy.
        // `masscomponent` and `shockcord` already wrote them, so this was an inconsistency inside
        // one file rather than a decision.
        (c.packedLength !== undefined ? `${p}<packedlength>${num(c.packedLength)}</packedlength>\n` : "") +
        (c.packedRadius !== undefined ? `${p}<packedradius>${num(c.packedRadius)}</packedradius>\n` : "") +
        `${p}<deployevent>${DEPLOY_OUT[c.deployEvent]}</deployevent>\n` +
        (c.deployAltitude !== undefined ? `${p}<deployaltitude>${num(c.deployAltitude)}</deployaltitude>\n` : "") +
        (c.deployDelay !== undefined ? `${p}<deploydelay>${num(c.deployDelay)}</deploydelay>\n` : "") +
        deployConfigsXml(c.deployConfigs, p) +
        (c.overrideMass === undefined && c.mass ? `${p}<overridemass>${num(c.mass)}</overridemass>\n` : "") +
        close
      );
    case "streamer":
      return (
        head + common + overrides +
        `${p}<cd>${num(c.cd)}</cd>\n` +
        `${p}<striplength>${num(c.stripLength)}</striplength>\n` +
        `${p}<stripwidth>${num(c.stripWidth)}</stripwidth>\n` +
        (c.packedLength !== undefined ? `${p}<packedlength>${num(c.packedLength)}</packedlength>\n` : "") +
        `${p}<deployevent>${DEPLOY_OUT[c.deployEvent]}</deployevent>\n` +
        (c.deployAltitude !== undefined ? `${p}<deployaltitude>${num(c.deployAltitude)}</deployaltitude>\n` : "") +
        (c.deployDelay !== undefined ? `${p}<deploydelay>${num(c.deployDelay)}</deploydelay>\n` : "") +
        deployConfigsXml(c.deployConfigs, p) +
        (c.overrideMass === undefined && c.mass ? `${p}<overridemass>${num(c.mass)}</overridemass>\n` : "") +
        close
      );
    case "launchlug":
    case "railbutton": {
      // The lug's wall thickness was consumed at import (only its computed mass survives), so write
      // the mass explicitly — the importer takes a stated <mass> verbatim (per instance; it then
      // multiplies by the instance count) rather than recomputing it from a thickness we don't have.
      const count = c.instanceCount ?? 1;
      return (
        head + common + overrides +
        (c.radius !== undefined ? `${p}<radius>${num(c.radius)}</radius>\n` : "") +
        (c.length !== undefined ? `${p}<length>${num(c.length)}</length>\n` : "") +
        (c.mass !== undefined ? `${p}<mass>${num(c.mass / count)}</mass>\n` : "") +
        `${p}<instancecount>${count}</instancecount>\n` +
        close
      );
    }
    case "shockcord":
      // The internal model already holds the cord's mass (its cord length/material were consumed at
      // import), so write it as an explicit mass — the importer's fallback when no cord length is
      // present — preserving the mass through the round-trip.
      return (
        head + common + overrides +
        (c.mass !== undefined ? `${p}<mass>${num(c.mass)}</mass>\n` : "") +
        (c.length !== undefined ? `${p}<packedlength>${num(c.length)}</packedlength>\n` : "") +
        close
      );
    default:
      return "";
  }
}

/** Index every configuration's motors by the mount id they load into. */
function indexMotors(rocket: Rocket): MotorsByMount {
  const map: MotorsByMount = new Map();
  for (const cfg of rocket.configurations) {
    for (const inst of cfg.instances) {
      const list = map.get(inst.mountId) ?? [];
      list.push({ configId: cfg.id, inst });
      map.set(inst.mountId, list);
    }
  }
  return map;
}

function configsXml(rocket: Rocket): string {
  return rocket.configurations
    .map((cfg) => {
      const def = cfg.id === (rocket.defaultConfigId ?? rocket.configurations[0]?.id) ? ' default="true"' : "";
      // The NAME is how a flyer picks which flight they are looking at — "Airstart @2s", "[J315R-P;
      // J90W-P]", "H128W". The importer reads it (`adapt.ts`); the exporter simply never wrote it, so
      // every configuration came back labelled with its own raw id. 29 configurations across 9 corpus
      // designs, and on a design built here the starter's only motor label "H128W" returned as "cfg-1".
      const name = cfg.name ? `      <name>${esc(cfg.name)}</name>\n` : "";
      return (
        `    <motorconfiguration configid="${esc(cfg.id)}"${def}>\n` +
        name +
        `      <stage number="0" active="true"/>\n` +
        `    </motorconfiguration>\n`
      );
    })
    .join("");
}

/** Serialize a rocket to OpenRocket 1.10 XML. Stable output (deterministic ids, no wall-clock). */
export function serializeRocketXml(rocket: Rocket): string {
  uid = 0;
  writtenIds = new Set();
  const motors = indexMotors(rocket);
  const stages = rocket.stages
    .map((s) => {
      const sep =
        s.separationEvent ? `        <separationevent>${s.separationEvent}</separationevent>\n` +
          (s.separationDelay ? `        <separationdelay>${num(s.separationDelay)}</separationdelay>\n` : "") : "";
      return (
        `      <stage>\n` +
        `        <name>${esc(s.name)}</name>\n` +
        `        <id>${nextUuid()}</id>\n` +
        overrideXml(s, "        ") +
        sep +
        separationConfigsXml(s.separationConfigs, "        ") +
        `        <subcomponents>\n` +
        s.components.map((c) => componentXml(c, motors, 5)).join("") +
        `        </subcomponents>\n` +
        `      </stage>\n`
      );
    })
    .join("");
  return (
    `<?xml version='1.0' encoding='utf-8'?>\n` +
    `<openrocket version="1.10" creator="Loft">\n` +
    `  <rocket>\n` +
    `    <name>${esc(rocket.name)}</name>\n` +
    `    <id>${nextUuid()}</id>\n` +
    (rocket.designer ? `    <designer>${esc(rocket.designer)}</designer>\n` : "") +
    configsXml(rocket) +
    `    <referencetype>${rocket.referenceType}</referencetype>\n` +
    `    <subcomponents>\n` +
    stages +
    `    </subcomponents>\n` +
    `  </rocket>\n` +
    `</openrocket>\n`
  );
}

/** Export a design as a store-only ZIP `.ork` (the OpenRocket container: a `rocket.ork` XML). */
export function exportOrk(doc: OrkDocument): Uint8Array {
  const xml = serializeRocketXml(doc.rocket);
  return storeZip([{ name: "rocket.ork", data: new TextEncoder().encode(xml) }]);
}
