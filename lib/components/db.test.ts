import { describe, it, expect } from "vitest";
import {
  COMPONENT_CATALOG,
  COMPONENT_SOURCES,
  REFUSED_MATERIALS,
  REFUSED_PARTS,
  type CatalogPart,
} from "./catalog";
import {
  allParts,
  allSources,
  findPart,
  findParts,
  hasUnusableMaterial,
  manufacturers,
  materialOf,
  partsOfKind,
  searchParts,
  sourceOf,
} from "./db";

const IN = 0.0254;
/** Published dimensions are quoted to three decimal places of an inch, so agreement is asserted
 *  to a quarter of that — tight enough that a wrong unit or a dropped conversion fails, loose
 *  enough that it is not asserting the floating-point representation of 0.0254. */
const TOL = 0.00025 * IN;

describe("the bundled component catalogue", () => {
  it("resolves a part number to the dimensions its vendor publishes", () => {
    // LOC Precision's 18 mm motor mount tube, from the vendor's own listing: 0.715 in ID,
    // 0.765 in OD, 34 in long. This is the round trip that matters — the source states inches,
    // the catalogue stores metres, and a flyer picking it gets the tube they ordered.
    const mmt = findPart("MMT-0.71-34", "LOC Precision");
    expect(mmt).toBeDefined();
    expect(mmt!.kind).toBe("bodytube");
    expect(mmt!.innerDiameter!).toBeCloseTo(0.715 * IN, 6);
    expect(mmt!.outerDiameter!).toBeCloseTo(0.765 * IN, 6);
    expect(mmt!.length!).toBeCloseTo(34.0 * IN, 6);

    // A nose cone carries a contour and a shoulder as well as a length; a picker that dropped
    // the shoulder would populate a design whose parts do not fit together.
    const pnc = findPart("PNC-1.52", "LOC Precision");
    expect(pnc).toBeDefined();
    expect(pnc!.kind).toBe("nosecone");
    expect(pnc!.shape).toBe("ogive");
    expect(pnc!.outerDiameter!).toBeCloseTo(1.635 * IN, 6);
    expect(pnc!.shoulderDiameter!).toBeCloseTo(1.51 * IN, 6);
    expect(pnc!.shoulderLength!).toBeCloseTo(2.0 * IN, 6);
    expect(pnc!.length!).toBeCloseTo(8.0 * IN, 6);
    expect(pnc!.thickness!).toBeCloseTo(0.18 * IN, 6);

    // A parachute is geometry plus shroud lines plus a surface material.
    const chute = findPart("LP-14-2022", "LOC Precision");
    expect(chute).toBeDefined();
    expect(chute!.kind).toBe("parachute");
    expect(chute!.diameter!).toBeCloseTo(14.0 * IN, 6);
    expect(chute!.sides).toBe(6);
    expect(chute!.lineCount).toBe(6);
    expect(chute!.lineLength!).toBeCloseTo(14.0 * IN, 6);
    expect(chute!.lineMaterial?.type).toBe("line");
  });

  it("reproduces the industry-standard BT tube sizes independently of the file it read", () => {
    // BT-50 and BT-60 are the model-rocketry body-tube standard, published in Estes literature
    // long before this database existed: BT-50 is 0.950 in ID / 0.976 in OD, BT-60 is 1.595 /
    // 1.637. Asserting them checks the conversion against a figure that does NOT come from the
    // vendored file — if the pipeline drifted, these are what would notice.
    for (const [pn, id, od] of [
      ["BT-50", 0.95, 0.976],
      ["BT-60", 1.595, 1.637],
    ] as const) {
      const tube = findPart(pn, "Rocketarium");
      expect(tube, pn).toBeDefined();
      expect(Math.abs(tube!.innerDiameter! - id * IN)).toBeLessThan(TOL);
      expect(Math.abs(tube!.outerDiameter! - od * IN)).toBeLessThan(TOL);
    }
  });

  it("gives every part a source that names its licence, repository and commit", () => {
    // The catalogue is redistributed under Apache-2.0, which requires the notices to travel with
    // the data. A part whose provenance did not resolve would be a figure with no published
    // origin — the exact thing this repo does not ship.
    expect(COMPONENT_SOURCES.length).toBeGreaterThan(0);
    for (const s of allSources()) {
      expect(s.file, s.file).toMatch(/\.orc$/i);
      expect(s.vendor.length, s.file).toBeGreaterThan(0);
      expect(s.copyright.length, s.file).toBeGreaterThan(0);
      expect(s.license, s.file).toBe("Apache-2.0");
      expect(s.repo, s.file).toMatch(/^https:\/\/github\.com\//);
      // Pinned by COMMIT, not by a branch or tag that could move underneath the assertion.
      expect(s.commit, s.file).toMatch(/^[0-9a-f]{40}$/);
    }
    for (const p of allParts()) {
      expect(sourceOf(p), p.partNumber).toBeDefined();
    }
    // The per-source part counts must add up to the catalogue, or a file was read and dropped.
    const summed = allSources().reduce((n, s) => n + s.parts, 0);
    expect(summed).toBe(COMPONENT_CATALOG.length);
  });

  it("ships no density that cannot describe matter, and says which it refused", () => {
    // The upstream database defines `Paper, bulk` as 0.0011 kg/m³ in two files — lighter than
    // air by three orders of magnitude — and real parts reference it. Mass feeds CG, stability
    // and apogee, so the generator refuses the figure instead of flying it. This asserts both
    // halves: nothing impossible shipped, and the refusal is recorded rather than silent.
    const BAND = {
      bulk: [10, 25000],
      surface: [1e-3, 2],
      line: [1e-5, 1],
    } as const;
    for (const p of allParts()) {
      for (const m of [p.material, p.lineMaterial]) {
        if (!m || m.density === null) continue;
        const [lo, hi] = BAND[m.type];
        expect(m.density, `${p.partNumber} · ${m.name}`).toBeGreaterThanOrEqual(lo);
        expect(m.density, `${p.partNumber} · ${m.name}`).toBeLessThanOrEqual(hi);
      }
    }
    expect(REFUSED_MATERIALS.length).toBeGreaterThan(0);
    for (const r of REFUSED_MATERIALS) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(r.density)).toBe(true);
    }
    // And the parts that reference one are reachable as such, rather than looking ordinary.
    const affected = allParts().filter(hasUnusableMaterial);
    expect(affected.length).toBeGreaterThan(0);
    for (const p of affected) expect(materialOf(p)).toBeUndefined();
  });

  it("ships no part whose geometry cannot be built, and says which it dropped", () => {
    // Three upstream entries state a bore wider than the outside, which makes the material
    // volume — and so the mass — negative. They are refused at generate time, and a flyer
    // cannot reach one; the record of what was dropped stays in the bundle.
    for (const p of allParts()) {
      if (p.innerDiameter === undefined || p.outerDiameter === undefined) continue;
      expect(p.innerDiameter, `${p.manufacturer} ${p.partNumber}`).toBeLessThan(p.outerDiameter);
    }
    expect(REFUSED_PARTS.length).toBeGreaterThan(0);
    for (const r of REFUSED_PARTS) {
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.innerDiameter).toBeGreaterThanOrEqual(r.outerDiameter);
      // The dropped part must genuinely be absent, not merely listed.
      expect(findParts(r.partNumber, r.manufacturer).length).toBe(0);
    }
  });

  it("hands the model a material only when it has a real density behind it", () => {
    const tube = findPart("MMT-0.71-34", "LOC Precision")!;
    const mat = materialOf(tube);
    expect(mat).toBeDefined();
    expect(mat!.type).toBe("bulk");
    // Kraft glassine tube stock, a few hundred kg/m³ — not a placeholder 1000.
    expect(mat!.density).toBeGreaterThan(300);
    expect(mat!.density).toBeLessThan(1500);
    expect(mat!.name).toBe(tube.material!.name);
  });

  it("refuses to guess when a part number names more than one part", () => {
    // 113 numbers are carried by more than one manufacturer and 21 are duplicated WITHIN one, so
    // a lookup that returned the first hit would hand a flyer another vendor's tube under the
    // number they typed. Ambiguity resolves to nothing, and the candidates stay reachable.
    const ambiguous = COMPONENT_CATALOG.reduce((m, p) => {
      const k = p.partNumber.toLowerCase();
      (m[k] ??= new Set<string>()).add(p.manufacturer);
      return m;
    }, {} as Record<string, Set<string>>);
    const collided = Object.entries(ambiguous).find(([, v]) => v.size > 1);
    expect(collided).toBeDefined();
    const [number, vendors] = collided!;
    expect(findPart(number)).toBeUndefined();
    expect(findParts(number).length).toBeGreaterThan(1);
    // Narrowing to one manufacturer resolves it, unless that manufacturer itself repeats it.
    const one = [...vendors][0];
    expect(findParts(number, one).every((p) => p.manufacturer === one)).toBe(true);
  });

  it("looks a part up however the flyer typed it", () => {
    const exact = findPart("MMT-0.71-34", "LOC Precision");
    expect(findPart("mmt-0.71-34", "loc precision")).toBe(exact);
    expect(findPart("  MMT-0.71-34  ", "LOC Precision")).toBe(exact);
    expect(findPart("MMT-0.71-34", "Estes")).toBeUndefined();
    expect(findPart("no such part")).toBeUndefined();
  });

  it("filters by what a part has to fit, not just by its name", () => {
    // The question a builder actually asks: what coupler goes inside this tube? The tube's inner
    // diameter is the coupler's outer one, to a slip fit.
    const tube = findPart("MMT-0.71-34", "LOC Precision")!;
    const fits = searchParts({ fitsOuterDiameter: tube.innerDiameter, tolerance: 0.0005 });
    expect(fits.length).toBeGreaterThan(0);
    for (const p of fits) expect(Math.abs(p.outerDiameter! - tube.innerDiameter!)).toBeLessThan(0.0005);

    const locTubes = searchParts({ kind: "bodytube", manufacturer: "LOC Precision" });
    expect(locTubes.length).toBeGreaterThan(0);
    for (const p of locTubes) {
      expect(p.kind).toBe("bodytube");
      expect(p.manufacturer).toBe("LOC Precision");
    }
    // Text runs over the description too, which is where a size like "18mm" is written.
    const byText = searchParts({ kind: "bodytube", text: "MMT-0.71" });
    expect(byText.some((p) => p.partNumber === "MMT-0.71-34")).toBe(true);
    // An empty query narrows nothing.
    expect(searchParts({}).length).toBe(COMPONENT_CATALOG.length);
  });

  it("covers the vendors and part kinds a builder needs, with sane geometry throughout", () => {
    // Breadth is the point of the milestone: authoring becomes selection only if the part a
    // flyer owns is in the list. These floors are the honest measured counts, ratcheted so a
    // re-vendor that silently loses a file fails here rather than in a picker.
    expect(COMPONENT_CATALOG.length).toBeGreaterThanOrEqual(3446);
    expect(manufacturers().length).toBeGreaterThanOrEqual(16);
    for (const [kind, floor] of [
      ["bodytube", 1089],
      ["nosecone", 855],
      ["centeringring", 497],
      ["transition", 360],
      ["tubecoupler", 236],
      ["parachute", 151],
      ["bulkhead", 115],
      ["launchlug", 59],
      ["streamer", 46],
      ["engineblock", 38],
    ] as const) {
      expect(partsOfKind(kind).length, kind).toBeGreaterThanOrEqual(floor);
    }

    // Geometry that cannot be built is geometry that would fly wrong. A tube whose bore is
    // wider than its outside has had two fields swapped somewhere in the pipeline.
    const dims = (p: CatalogPart) => [
      p.length,
      p.outerDiameter,
      p.innerDiameter,
      p.thickness,
      p.diameter,
      p.width,
    ];
    for (const p of allParts()) {
      for (const d of dims(p)) {
        if (d === undefined) continue;
        expect(Number.isFinite(d), `${p.partNumber}`).toBe(true);
        expect(d, `${p.partNumber}`).toBeGreaterThanOrEqual(0);
        // Nothing in a hobby parts catalogue is 5 m across or long.
        expect(d, `${p.partNumber}`).toBeLessThan(5);
      }
      if (p.innerDiameter !== undefined && p.outerDiameter !== undefined) {
        expect(p.innerDiameter, `${p.partNumber}`).toBeLessThan(p.outerDiameter);
      }
      expect(p.partNumber.trim().length, "blank part number").toBeGreaterThan(0);
      expect(p.manufacturer.trim().length, p.partNumber).toBeGreaterThan(0);
    }
  });

  it("keeps a stated mass where the vendor publishes one, in kilograms", () => {
    // 229 parts carry a mass the vendor measured; the rest are computed from geometry and
    // material exactly as a hand-typed part is. A stated mass in the wrong unit would be off by
    // 28x (ounces) or 1000x (grams), so the whole set is bounded rather than spot-checked.
    const stated = allParts().filter((p) => p.mass !== undefined);
    expect(stated.length).toBeGreaterThan(100);
    for (const p of stated) {
      expect(p.mass!, p.partNumber).toBeGreaterThan(0);
      // A gram to five kilograms covers every part in a hobby catalogue.
      expect(p.mass!, p.partNumber).toBeLessThan(5);
      expect(p.mass!, p.partNumber).toBeGreaterThan(1e-5);
    }
  });
});
