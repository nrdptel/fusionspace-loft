/** The bundled component catalogue. Resolves a real commercial part — by number, by kind, or by
 *  what it has to fit — into the dimensions and material the internal Rocket model needs, entirely
 *  client-side so it works offline.
 *
 *  This is the counterpart to `lib/motors/db.ts`: that one turns a motor *reference* in a design
 *  file into a real thrust curve; this one turns a flyer's *choice* in the builder into real
 *  published geometry. Both read an inlined catalogue and neither touches the network.
 *
 *  Two things it deliberately does NOT do:
 *
 *  - **It never invents a density.** A part whose upstream material is physically impossible
 *    (`density: null` — see `catalog.ts`) resolves to a part with no material rather than to a
 *    plausible-looking guess. The caller has to decide what to do about it, which is the point:
 *    mass feeds CG, stability and apogee, and a silent fallback would put a made-up number under
 *    all three.
 *  - **It never matches fuzzily on identity.** Motors need forgiving matching because a design
 *    file carries whatever designation its author typed; a part number here is chosen from a list
 *    the flyer is looking at, so an approximate match would only ever be a wrong part confidently
 *    selected. Search is separate from lookup, and only search is fuzzy.
 */

import {
  COMPONENT_CATALOG,
  COMPONENT_SOURCES,
  type CatalogPart,
  type CatalogSource,
  type PartKind,
} from "./catalog";
import type { Material } from "../model/types";

export type { CatalogPart, CatalogSource, PartKind };

/** Every catalogued part, in the order the sources were generated. */
export function allParts(): readonly CatalogPart[] {
  return COMPONENT_CATALOG;
}

export function allSources(): readonly CatalogSource[] {
  return COMPONENT_SOURCES;
}

/** The vendored `.orc` a part came from, with its copyright and upstream commit. */
export function sourceOf(part: CatalogPart): CatalogSource | undefined {
  return COMPONENT_SOURCES[part.source];
}

let byNumber: Map<string, CatalogPart[]> | null = null;

const key = (s: string) => s.trim().toLowerCase();

function index(): Map<string, CatalogPart[]> {
  if (byNumber) return byNumber;
  const m = new Map<string, CatalogPart[]>();
  for (const p of COMPONENT_CATALOG) {
    const k = key(p.partNumber);
    const bucket = m.get(k);
    if (bucket) bucket.push(p);
    else m.set(k, [p]);
  }
  byNumber = m;
  return m;
}

/** Resolve a part number to its published part.
 *
 *  Part numbers are NOT unique across the catalogue — several vendors use the same scheme, and
 *  Estes' classic and Pro Series II files both carry a "BT-60". Pass `manufacturer` to
 *  disambiguate; without one, a number carried by more than one manufacturer returns `undefined`
 *  rather than an arbitrary winner, because picking the wrong vendor's tube silently is exactly
 *  the failure this catalogue exists to prevent. Use `findParts` when you want all the candidates.
 */
export function findPart(partNumber: string, manufacturer?: string): CatalogPart | undefined {
  const matches = findParts(partNumber, manufacturer);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Every part carrying this number, optionally narrowed to one manufacturer. */
export function findParts(partNumber: string, manufacturer?: string): CatalogPart[] {
  const bucket = index().get(key(partNumber)) ?? [];
  if (!manufacturer) return bucket;
  const m = key(manufacturer);
  return bucket.filter((p) => key(p.manufacturer) === m);
}

export function partsOfKind(kind: PartKind): CatalogPart[] {
  return COMPONENT_CATALOG.filter((p) => p.kind === kind);
}

/** The distinct manufacturers offering parts of a kind (or of any kind), sorted. */
export function manufacturers(kind?: PartKind): string[] {
  const set = new Set<string>();
  for (const p of COMPONENT_CATALOG) if (!kind || p.kind === kind) set.add(p.manufacturer);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export interface PartQuery {
  kind?: PartKind;
  manufacturer?: string;
  /** Matched case-insensitively against part number and description. */
  text?: string;
  /** Metres. Keeps parts whose inner diameter is within `tolerance` of this — what a coupler or
   *  centring ring has to fit INSIDE. */
  fitsInnerDiameter?: number;
  /** Metres. Keeps parts whose outer diameter is within `tolerance` of this — what has to fit
   *  inside a given tube. */
  fitsOuterDiameter?: number;
  /** Metres, default 0.5 mm — about the slip fit a real coupler has. */
  tolerance?: number;
}

/** Filter the catalogue. Every clause is a narrowing AND, and an absent clause narrows nothing. */
export function searchParts(q: PartQuery): CatalogPart[] {
  const tol = q.tolerance ?? 0.0005;
  const text = q.text ? key(q.text) : undefined;
  const mfr = q.manufacturer ? key(q.manufacturer) : undefined;
  return COMPONENT_CATALOG.filter((p) => {
    if (q.kind && p.kind !== q.kind) return false;
    if (mfr && key(p.manufacturer) !== mfr) return false;
    if (text && !key(p.partNumber).includes(text) && !key(p.description).includes(text))
      return false;
    if (q.fitsInnerDiameter !== undefined) {
      if (p.innerDiameter === undefined) return false;
      if (Math.abs(p.innerDiameter - q.fitsInnerDiameter) > tol) return false;
    }
    if (q.fitsOuterDiameter !== undefined) {
      if (p.outerDiameter === undefined) return false;
      if (Math.abs(p.outerDiameter - q.fitsOuterDiameter) > tol) return false;
    }
    return true;
  });
}

/** The part's material as the internal model expresses it, or `undefined` when the catalogue has
 *  no usable density for it — see the note at the top of this file. A caller that gets
 *  `undefined` must NOT substitute a default silently; the flyer chose a specific part, and a
 *  mass they did not choose is a mass they will not check. */
export function materialOf(part: CatalogPart): Material | undefined {
  const m = part.material;
  if (!m || m.density === null) return undefined;
  return { name: m.name, density: m.density, type: m.type };
}

/** True when the part is catalogued but its published material cannot be used — the case a
 *  picker has to surface rather than paper over. */
export function hasUnusableMaterial(part: CatalogPart): boolean {
  return part.material !== undefined && part.material.density === null;
}
