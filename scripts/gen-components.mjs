// Regenerate the bundled component catalogue (lib/components/catalog.ts) from the vendored
// OpenRocket component-database files under lib/components/orc/ and their provenance record
// (orc/provenance.json).
//
// The `.orc` files are the Apache-2.0 licensed openrocket-database — real commercial parts
// with their manufacturer, part number, published dimensions and named material. This script
// inlines them into a TypeScript module, normalised to SI, so the builder can offer a flyer a
// real body tube by part number with no filesystem and no network. It is a DEV tool: it is not
// part of the build (`prebuild` is gen-og + pyodide) and needs no network. Re-run it after
// re-vendoring the database:  node scripts/gen-components.mjs
//
// It reuses lib/ork/xml.ts — the same parser that reads a flyer's `.ork` design — rather than
// carrying a second XML implementation that could disagree with it. Node ≥22 strips the types.
//
// TWO PROPERTIES OF THE SOURCE DATA ARE LOAD-BEARING, and both are measured rather than assumed:
//
//  1. A material's unit comes from its `<Type>` (BULK / SURFACE / LINE), NEVER from the
//     `UnitsOfMeasure` attribute. The database's own maintainer records that the attribute is
//     frequently wrong, and it is: six SURFACE materials declare `g/m2` while carrying values in
//     kg/m² (1.9 oz ripstop at 0.0589). A parser that believed the attribute would divide those
//     canopies by 1000 and fly a parachute that weighs nothing.
//
//  2. A density outside the physically possible band for its type is REFUSED, not shipped. Two
//     files define `Paper, bulk` as 0.0011 kg/m³ — six orders of magnitude light, lighter than
//     air — and 18 real parts reference it. Mass feeds CG, stability, and every number downstream,
//     so a part whose material cannot mean anything physically ships WITHOUT a density and the
//     app has to ask, rather than flying a confident number out of a typo.
//
//  3. Geometry that cannot be built is refused on the same grounds. Three parts state a bore
//     WIDER than their outside — a Quest centring ring, a SEMROC coupler, a SEMROC ring — which
//     gives a negative material volume and therefore a negative mass. They are dropped, with the
//     figures kept in REFUSED_PARTS so the gap is auditable instead of invisible.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseXml, child, children, childText } from "../lib/ork/xml.ts";

const here = dirname(fileURLToPath(import.meta.url));
const orcDir = resolve(here, "..", "lib", "components", "orc");
const outFile = resolve(here, "..", "lib", "components", "catalog.ts");

const prov = JSON.parse(await readFile(resolve(orcDir, "provenance.json"), "utf-8"));
const vendorOf = new Map(prov.files.map((f) => [f.file, f.vendor]));

// --- units ---------------------------------------------------------------------------------
// The `.orc` dimensions carry their unit in the element's own attribute. Every unit that
// actually occurs in the vendored database is listed; an unrecognised one is a hard error
// rather than a silent 1:1, because a wrong length is a wrong rocket.
const LENGTH_TO_M = { in: 0.0254, mm: 0.001, cm: 0.01, m: 1, ft: 0.3048 };
const MASS_TO_KG = { oz: 0.028349523125, g: 0.001, kg: 1, lb: 0.45359237 };

function convert(node, table, what) {
  if (!node) return undefined;
  const raw = Number(node.text);
  if (!Number.isFinite(raw)) return undefined;
  // An ABSENT unit is an error too, not an assumed metre. 96% of this database is in inches, so
  // defaulting would turn a 0.976 in tube into a 0.976 m one — a 39x error, silently, straight
  // into CG and stability. Every one of the 12,863 dimension and mass elements carries a Unit
  // today; this is the guard for the day a re-vendored file does not.
  const unit = node.attrs.Unit;
  if (unit === undefined) {
    throw new Error(`gen-components: <${node.name}> states no Unit — refusing to assume one`);
  }
  const factor = table[unit];
  if (factor === undefined) throw new Error(`gen-components: unknown ${what} unit "${unit}"`);
  return raw * factor;
}

const len = (node, name) => convert(child(node, name), LENGTH_TO_M, "length");
const mass = (node, name) => convert(child(node, name), MASS_TO_KG, "mass");

// --- materials -----------------------------------------------------------------------------
// The band a density must fall inside to be shipped, per material type. These are deliberately
// generous — wide enough to admit every real material in the database (expanded foam at 48
// kg/m³, 24 kt gold at 19286, 2 g/m² tissue, a 20 micron-per-metre shroud line) and narrow
// enough to refuse a value that cannot describe matter.
const DENSITY_BAND = {
  BULK: [10, 25000], // kg/m³ — below the lightest practical foam, above the densest metal used
  SURFACE: [1e-3, 2], // kg/m² — 1 g/m² tissue to a 2 kg/m² heavy canvas
  LINE: [1e-5, 1], // kg/m — fine thread to heavy webbing
};
const TYPE_TO_SI = { BULK: "bulk", SURFACE: "surface", LINE: "line" };

const files = (await readdir(orcDir)).filter((f) => f.toLowerCase().endsWith(".orc")).sort();

/** Per-file material tables, plus the shared table every vendor file is written against.
 *
 *  A vendor file that redefines a material name means "for MY parts, this value" — six names are
 *  defined more than once with different densities — so resolution is file-local FIRST. The
 *  fallback is `generic_materials.orc`, which is the database's own shared table, named as such
 *  rather than "whichever file happened to sort first": a `readdir().sort()` fallback put
 *  `BMS.ORC` ahead of it purely because uppercase sorts first, which is not a decision anyone
 *  made. A name in neither is resolved from the remaining files in sorted order, as a last resort.
 *
 *  Refused definitions (see below) are authoritative for their OWN file — a part whose own vendor
 *  states an impossible density gets nothing rather than someone else's number — but they are kept
 *  OUT of the fallback tables, so one file's bad row cannot shadow a good row for another file's
 *  parts. */
const SHARED_MATERIALS_FILE = "generic_materials.orc";
const perFile = new Map();
const sharedMats = new Map();
const otherMats = new Map();
const refused = [];

for (const file of files) {
  const root = parseXml(await readFile(resolve(orcDir, file), "utf-8"));
  const table = new Map();
  const mats = child(root, "Materials");
  for (const m of mats ? children(mats, "Material") : []) {
    const name = childText(m, "Name");
    const type = childText(m, "Type");
    const density = Number(childText(m, "Density"));
    if (!name || !TYPE_TO_SI[type]) continue;
    const band = DENSITY_BAND[type];
    if (!Number.isFinite(density) || density < band[0] || density > band[1]) {
      refused.push({ file, name, type, density });
      table.set(name, { type: TYPE_TO_SI[type], density: null });
      continue;
    }
    table.set(name, { type: TYPE_TO_SI[type], density });
  }
  perFile.set(file, table);
  const fallback = file === SHARED_MATERIALS_FILE ? sharedMats : otherMats;
  for (const [k, v] of table) {
    if (v.density === null) continue; // never let a refused row become another file's answer
    if (!fallback.has(k)) fallback.set(k, v);
  }
}

const resolveMaterial = (file, name) =>
  (name &&
    (perFile.get(file).get(name) ?? sharedMats.get(name) ?? otherMats.get(name))) ||
  undefined;

// --- parts ---------------------------------------------------------------------------------
// One reader per `.orc` element name. Every dimension the database records for that kind is
// carried through — a picker that drops a nose cone's shoulder would populate a design that
// does not fit together. Fields absent for a given part stay undefined rather than 0, so
// "not stated" and "zero" never collapse into each other.
const READERS = {
  BodyTube: (n) => ({
    kind: "bodytube",
    innerDiameter: len(n, "InsideDiameter"),
    outerDiameter: len(n, "OutsideDiameter"),
    length: len(n, "Length"),
  }),
  TubeCoupler: (n) => ({
    kind: "tubecoupler",
    innerDiameter: len(n, "InsideDiameter"),
    outerDiameter: len(n, "OutsideDiameter"),
    length: len(n, "Length"),
  }),
  CenteringRing: (n) => ({
    kind: "centeringring",
    innerDiameter: len(n, "InsideDiameter"),
    outerDiameter: len(n, "OutsideDiameter"),
    length: len(n, "Length"),
  }),
  EngineBlock: (n) => ({
    kind: "engineblock",
    innerDiameter: len(n, "InsideDiameter"),
    outerDiameter: len(n, "OutsideDiameter"),
    length: len(n, "Length"),
  }),
  LaunchLug: (n) => ({
    kind: "launchlug",
    innerDiameter: len(n, "InsideDiameter"),
    outerDiameter: len(n, "OutsideDiameter"),
    length: len(n, "Length"),
  }),
  BulkHead: (n) => ({
    kind: "bulkhead",
    outerDiameter: len(n, "OutsideDiameter"),
    length: len(n, "Length"),
    filled: childText(n, "Filled") === "true" ? true : undefined,
  }),
  NoseCone: (n) => ({
    kind: "nosecone",
    shape: shapeOf(n),
    outerDiameter: len(n, "OutsideDiameter"),
    innerDiameter: len(n, "InsideDiameter"),
    shoulderDiameter: len(n, "ShoulderDiameter"),
    shoulderLength: len(n, "ShoulderLength"),
    length: len(n, "Length"),
    thickness: len(n, "Thickness"),
    filled: childText(n, "Filled") === "true" ? true : undefined,
  }),
  Transition: (n) => ({
    kind: "transition",
    shape: shapeOf(n),
    foreOuterDiameter: len(n, "ForeOutsideDiameter"),
    foreShoulderDiameter: len(n, "ForeShoulderDiameter"),
    foreShoulderLength: len(n, "ForeShoulderLength"),
    aftOuterDiameter: len(n, "AftOutsideDiameter"),
    aftShoulderDiameter: len(n, "AftShoulderDiameter"),
    aftShoulderLength: len(n, "AftShoulderLength"),
    length: len(n, "Length"),
    thickness: len(n, "Thickness"),
    filled: childText(n, "Filled") === "true" ? true : undefined,
  }),
  Parachute: (n) => ({
    kind: "parachute",
    diameter: len(n, "Diameter"),
    sides: intOf(n, "Sides"),
    lineCount: intOf(n, "LineCount"),
    lineLength: len(n, "LineLength"),
  }),
  Streamer: (n) => ({
    kind: "streamer",
    length: len(n, "Length"),
    width: len(n, "Width"),
    thickness: len(n, "Thickness"),
  }),
};

// `.orc` records the same five contours Loft's own NoseShape does, upper-cased.
const SHAPES = {
  OGIVE: "ogive",
  CONICAL: "conical",
  ELLIPSOID: "ellipsoid",
  PARABOLIC: "parabolic",
  HAACK: "haack",
  POWER: "power",
};
function shapeOf(n) {
  const raw = childText(n, "Shape");
  return raw ? SHAPES[raw.toUpperCase()] : undefined;
}
function intOf(n, name) {
  const v = Number(childText(n, name));
  return Number.isFinite(v) ? v : undefined;
}

/** Why a part cannot be built, or undefined when it can. Each test is a strict impossibility, not
 *  a plausibility heuristic: the database contains genuinely unusual parts (a solid coupler states
 *  a bore of 0, a foam nose cone is 48 kg/m³) and none of them trip these. */
function geometryRefusal(part) {
  // A bore wider than the outside is a swapped or mistyped pair. A solid part legitimately states
  // a bore of 0, so the test is `>=` against a POSITIVE outer diameter, not `> 0`.
  if (
    part.innerDiameter !== undefined &&
    part.outerDiameter !== undefined &&
    part.innerDiameter >= part.outerDiameter
  ) {
    return {
      reason: "inner diameter is not smaller than the outer diameter",
      innerDiameter: part.innerDiameter,
      outerDiameter: part.outerDiameter,
    };
  }
  // A wall at least as thick as the radius leaves no bore to be a wall around. One Estes nose cone
  // states 4.250 in of wall on a 0.974 in body — plainly a decimal slip for 0.250 — and nothing in
  // the database sits between a quarter of the diameter and this, so the boundary is unambiguous.
  if (
    part.thickness !== undefined &&
    part.outerDiameter !== undefined &&
    part.thickness * 2 >= part.outerDiameter
  ) {
    return {
      reason: "wall thickness is at least the outer radius, leaving no bore",
      innerDiameter: part.outerDiameter - 2 * part.thickness,
      outerDiameter: part.outerDiameter,
    };
  }
  return undefined;
}

const parts = [];
const sources = [];
const refusedParts = [];
const kindCounts = {};

for (const file of files) {
  const root = parseXml(await readFile(resolve(orcDir, file), "utf-8"));
  const comps = child(root, "Components");
  if (!comps) continue;
  const sourceIndex = sources.length;
  let inFile = 0;

  for (const node of comps.children) {
    const read = READERS[node.name];
    if (!read) continue;
    const partNumber = childText(node, "PartNumber");
    // A part a flyer cannot name is a part they cannot pick. Every one of the 3,449 entries in
    // today's database carries a part number, so this has never fired — it is the guard for a
    // re-vendor that introduces one, and it is counted so that stays visible rather than silent.
    if (!partNumber) {
      refusedParts.push({
        file,
        kind: read(node).kind,
        manufacturer: childText(node, "Manufacturer") ?? vendorOf.get(file) ?? "",
        partNumber: "",
        reason: "no part number, so the part cannot be named or chosen",
        innerDiameter: 0,
        outerDiameter: 0,
      });
      continue;
    }
    const materialName = childText(node, "Material");
    const material = resolveMaterial(file, materialName);
    const lineMaterialName = childText(node, "LineMaterial");
    const lineMaterial = resolveMaterial(file, lineMaterialName);

    const part = {
      ...read(node),
      manufacturer: childText(node, "Manufacturer") ?? vendorOf.get(file) ?? "",
      partNumber,
      description: childText(node, "Description") ?? "",
      material: materialName
        ? {
            name: materialName,
            type: material?.type ?? "bulk",
            density: material?.density ?? null,
          }
        : undefined,
      lineMaterial: lineMaterialName
        ? {
            name: lineMaterialName,
            type: lineMaterial?.type ?? "line",
            density: lineMaterial?.density ?? null,
          }
        : undefined,
      mass: mass(node, "Mass"),
      source: sourceIndex,
    };
    // Drop the keys a kind does not carry, so the emitted module stays readable and small.
    for (const k of Object.keys(part)) if (part[k] === undefined) delete part[k];

    // Geometry that cannot be built. Both tests below describe a part with NEGATIVE material
    // volume, which is a mistyped or swapped figure rather than an unusual design, and which would
    // produce a negative mass if it reached the solver.
    const unbuildable = geometryRefusal(part);
    if (unbuildable) {
      refusedParts.push({
        file,
        kind: part.kind,
        manufacturer: part.manufacturer,
        partNumber: part.partNumber,
        ...unbuildable,
      });
      continue;
    }

    parts.push(part);
    kindCounts[part.kind] = (kindCounts[part.kind] ?? 0) + 1;
    inFile++;
  }

  const record = prov.files.find((f) => f.file === file);
  sources.push({
    file,
    vendor: record?.vendor ?? "",
    copyright: record?.copyright ?? "",
    license: prov.upstream.license,
    repo: prov.upstream.repo,
    commit: prov.upstream.commit,
    parts: inFile,
  });
}

const header = `// GENERATED by scripts/gen-components.mjs — do not edit by hand.
//
// The bundled offline component catalogue: real commercial rocketry parts from the Apache-2.0
// licensed openrocket-database, normalised to SI and inlined so the builder resolves a part by
// number client-side with no network. Every entry records which vendored \`.orc\` it came from,
// and that source carries the upstream repository, commit and copyright notice, so any figure
// here is traceable to a published one. Licence terms: THIRD-PARTY-NOTICES.md. Regenerate with:
//   node scripts/gen-components.mjs
//
// Dimensions are METRES and masses KILOGRAMS throughout — the source encodes its unit per
// element (inches, mostly) and this module has already applied it.
//
// A material \`density\` of \`null\` is not "zero" and not "unknown by omission": it is a value the
// upstream database states that cannot describe matter — two files define \`Paper, bulk\` as
// 0.0011 kg/m³ — which is refused at generate time rather than flown. A part carrying one has
// good published DIMENSIONS and no usable mass, and the app must ask rather than assume.

export type PartKind =
  | "bodytube"
  | "nosecone"
  | "transition"
  | "centeringring"
  | "tubecoupler"
  | "bulkhead"
  | "engineblock"
  | "launchlug"
  | "parachute"
  | "streamer";

export interface CatalogMaterial {
  /** The upstream material name, verbatim — the string the vendor's own file uses. */
  name: string;
  /** SI unit follows the type: kg/m³ (bulk), kg/m² (surface), kg/m (line). */
  type: "bulk" | "surface" | "line";
  /** \`null\` when the published figure is physically impossible and was refused. */
  density: number | null;
}

/** One vendored \`.orc\` file, and the terms it travels under. */
export interface CatalogSource {
  file: string;
  vendor: string;
  copyright: string;
  license: string;
  repo: string;
  commit: string;
  parts: number;
}

/** A real commercial part. Every length is metres, every mass kilograms. A field the database
 *  does not state for this part is ABSENT rather than zero. */
export interface CatalogPart {
  kind: PartKind;
  manufacturer: string;
  partNumber: string;
  description: string;
  material?: CatalogMaterial;
  /** Shroud-line material — parachutes only. */
  lineMaterial?: CatalogMaterial;
  /** Stated mass (kg), where the vendor publishes one. Otherwise the mass is computed from
   *  the geometry and the material, exactly as it is for a part a flyer typed by hand. */
  mass?: number;
  length?: number;
  outerDiameter?: number;
  innerDiameter?: number;
  thickness?: number;
  /** Nose cones and transitions: the contour, matching the internal model's \`NoseShape\`. */
  shape?: "ogive" | "conical" | "ellipsoid" | "parabolic" | "haack" | "power";
  shoulderDiameter?: number;
  shoulderLength?: number;
  foreOuterDiameter?: number;
  foreShoulderDiameter?: number;
  foreShoulderLength?: number;
  aftOuterDiameter?: number;
  aftShoulderDiameter?: number;
  aftShoulderLength?: number;
  /** Solid rather than hollow — the source's \`Filled\` flag. */
  filled?: boolean;
  /** Parachutes: canopy diameter (m), gore count, and shroud lines. */
  diameter?: number;
  sides?: number;
  lineCount?: number;
  lineLength?: number;
  /** Streamers: streamer width (m). */
  width?: number;
  /** Index into \`COMPONENT_SOURCES\`. */
  source: number;
}

/** Material definitions the generator refused, with the figure it refused. Kept in the bundle
 *  so the gap is auditable from the shipped code rather than only from a commit message. */
export interface RefusedMaterial {
  file: string;
  name: string;
  type: string;
  density: number;
}

/** A catalogued part the generator dropped because its stated geometry cannot be built. Kept
 *  with its figures so the gap is visible from the shipped code, and so a re-vendor that fixes
 *  one upstream shows up as this list getting shorter. */
export interface RefusedPart {
  file: string;
  kind: PartKind;
  manufacturer: string;
  partNumber: string;
  reason: string;
  innerDiameter: number;
  outerDiameter: number;
}

export const COMPONENT_SOURCES: CatalogSource[] = ${JSON.stringify(sources, null, 2)};

export const REFUSED_MATERIALS: RefusedMaterial[] = ${JSON.stringify(refused, null, 2)};

export const REFUSED_PARTS: RefusedPart[] = ${JSON.stringify(refusedParts, null, 2)};

export const COMPONENT_CATALOG: CatalogPart[] = ${JSON.stringify(parts)};
`;

await writeFile(outFile, header);

const kindSummary = Object.entries(kindCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`)
  .join(", ");
console.log(
  `gen-components: wrote ${parts.length} parts from ${sources.length} files to lib/components/catalog.ts`,
);
console.log(`  ${kindSummary}`);
console.log(
  `  refused ${refused.length} material definition(s) as physically impossible: ` +
    (refused.map((r) => `${r.file}:${r.name}=${r.density}`).join(", ") || "none"),
);
console.log(
  `  refused ${refusedParts.length} part(s): ` +
    (refusedParts.map((r) => `${r.file}:${r.partNumber || "(unnamed)"} — ${r.reason}`).join("; ") ||
      "none"),
);
