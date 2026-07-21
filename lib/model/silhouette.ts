/** A to-scale 2D side-view outline of a rocket, built from the same internal model the simulator
 *  flies. Pure and format-agnostic: it takes a `Rocket` and returns geometry in metres (axial x
 *  from the nose tip, radial r from the centreline), leaving all pixels, colours, and units to the
 *  view. This is the geometric substrate a visual builder/editor draws on — the picture that answers
 *  "did Loft read my rocket right?" far better than a table, for an imported design or a built one.
 *
 *  Body components (nose, tubes, transitions) form one continuous top profile (mirror it for the
 *  bottom); fin sets become planform polygons standing off the body. Nose contours follow the
 *  standard nose-cone profiles (see `noseHalfProfile`); transitions are drawn as a straight taper
 *  (exact for the common conical/boattail case, a faithful schematic for the rare shaped one — the
 *  aerodynamics still use the true shape). */

import type { Rocket, NoseShape } from "./types";
import { flattenRocket, isBody, outerRadius, radiusAtStation } from "./geometry";

/** A point on the outline: `[axial x from the nose tip (m), radius from the centreline (m)]`. */
export type OutlinePoint = [number, number];

/** One body component's own top profile (nose tip → aft, `[x, r]` points), tagged with the
 *  component id so a part can be highlighted on the diagram from its row in the parts table. */
export interface OutlineBodyPart {
  id: string;
  kind: string;
  profile: OutlinePoint[];
}

/** One fin set's planform, tagged with its component id. `poly` is a closed ring of `[x, r]`
 *  points on the +r side (mirror for the bottom fin): root LE → tip LE → tip TE → root TE. */
export interface OutlineFin {
  id: string;
  poly: OutlinePoint[];
}

export interface RocketOutline {
  /** The airframe's top profile, nose tip → aft, as `[x, r]` points (r ≥ 0). Mirror across r = 0
   *  for the bottom; together they close the body silhouette. Empty for a bodyless design. This is
   *  the clean, seamless outline for the base fill. */
  body: OutlinePoint[];
  /** The same body split per component (nose, each tube, each transition), so an individual part
   *  can be drawn or highlighted on its own. Same geometry as `body`, addressable by id. */
  parts: OutlineBodyPart[];
  /** One planform per fin set, tagged by id, standing off the body on the +r side. */
  fins: OutlineFin[];
  /** Nose-tip-to-aft on-axis length (m). */
  length: number;
  /** Largest body radius (m). */
  maxRadius: number;
  /** Largest radial extent (m) — max of the body radius and every fin tip — so the view can frame
   *  the whole silhouette, fins included. */
  maxExtent: number;
}

/** Samples along a nose or shaped contour — enough for a smooth curve, cheap to draw. */
const CONTOUR_SAMPLES = 24;

/** Half-profile of a nose cone: `[x from the tip (m), r (m)]` points from tip (0, 0) to base
 *  (length, radius), following the named contour. The standard nose-cone geometries — conical,
 *  tangent ogive, ellipsoid, power series, parabolic series, and Haack series — as in the nose-cone
 *  design literature (e.g. Crowell, "The Descriptive Geometry of Nose Cones", 1996; OpenRocket
 *  Technical Documentation §A). `param` is the series parameter where the shape takes one (power n,
 *  parabolic K, Haack C); it is ignored otherwise. */
export function noseHalfProfile(
  shape: NoseShape,
  param: number | undefined,
  length: number,
  radius: number,
  samples = CONTOUR_SAMPLES,
): OutlinePoint[] {
  const pts: OutlinePoint[] = [];
  if (!(length > 0) || !(radius > 0)) return [[0, 0], [Math.max(0, length), Math.max(0, radius)]];
  const fr = radius / length; // radius-to-length ratio (drives the ogive)
  const rho = (1 + fr * fr) / (2 * fr); // tangent-ogive radius, in units of length
  for (let i = 0; i <= samples; i++) {
    const xi = i / samples; // 0 at the tip, 1 at the base
    let f: number; // normalised radius r/radius at this station
    switch (shape) {
      case "conical":
        f = xi;
        break;
      case "ellipsoid":
        f = Math.sqrt(Math.max(0, 1 - (1 - xi) * (1 - xi)));
        break;
      case "power": {
        const n = param ?? 0.5;
        f = Math.pow(xi, n);
        break;
      }
      case "parabolic": {
        const k = param ?? 1; // K = 1 is the full parabola; 0 collapses to a cone
        f = (2 * xi - k * xi * xi) / (2 - k);
        break;
      }
      case "haack": {
        const c = param ?? 0; // C = 0 is Von Kármán (LD-Haack); 1/3 is LV-Haack
        const theta = Math.acos(Math.min(1, Math.max(-1, 1 - 2 * xi)));
        const v = theta - Math.sin(2 * theta) / 2 + c * Math.pow(Math.sin(theta), 3);
        f = Math.sqrt(Math.max(0, v / Math.PI));
        break;
      }
      case "ogive":
      default: {
        // Tangent ogive: r(xi)/length = sqrt(rho^2 - (1-xi)^2) - (rho - fr).
        f = (Math.sqrt(Math.max(0, rho * rho - (1 - xi) * (1 - xi))) - (rho - fr)) / fr;
        break;
      }
    }
    pts.push([xi * length, Math.max(0, f) * radius]);
  }
  return pts;
}

/** Aerodynamically-equivalent tip chord of a generic (elliptical/freeform) fin set, so it draws as
 *  the same equal-area trapezoid the aero reduces it to: area = ½·(root + tip)·height. */
function equivalentTipChord(area: number, rootChord: number, height: number): number {
  if (!(height > 0)) return rootChord;
  return Math.max(0, (2 * area) / height - rootChord);
}

/** Build the to-scale side-view outline of a rocket from its component tree. Bodies are walked in
 *  axial order into one top profile; fin sets become planform polygons seated on the body radius at
 *  their station. All coordinates are metres. */
export function rocketOutline(rocket: Rocket): RocketOutline {
  const flat = flattenRocket(rocket);

  // Body top profile, in axial order. Each body part contributes its own top edge; a radius step
  // between neighbours (a nose base narrower than the tube it meets) shows as a vertical jump.
  const bodies = flat
    .filter((p) => isBody(p.component))
    .sort((a, b) => a.xFore - b.xFore);

  const body: OutlinePoint[] = [];
  const parts: OutlineBodyPart[] = [];
  let maxRadius = 0;
  for (const p of bodies) {
    const c = p.component;
    let profile: OutlinePoint[];
    if (c.kind === "nosecone") {
      profile = noseHalfProfile(c.shape, c.shapeParameter, c.length, c.aftRadius).map(([x, r]) => [p.xFore + x, r]);
      maxRadius = Math.max(maxRadius, c.aftRadius);
    } else if (c.kind === "transition") {
      profile = [[p.xFore, c.foreRadius], [p.xFore + c.length, c.aftRadius]];
      maxRadius = Math.max(maxRadius, c.foreRadius, c.aftRadius);
    } else {
      const r = outerRadius(c);
      profile = [[p.xFore, r], [p.xFore + p.length, r]];
      maxRadius = Math.max(maxRadius, r);
    }
    for (const pt of profile) body.push(pt);
    parts.push({ id: c.id, kind: c.kind, profile });
  }

  // Fin planforms. A side view shows one fin standing off the body (mirror it for the bottom),
  // regardless of the set's fin count. Seat it on the body radius at the root's mid-chord.
  const fins: OutlineFin[] = [];
  let maxExtent = maxRadius;
  for (const p of flat) {
    const c = p.component;
    let rootChord: number, tipChord: number, sweep: number, height: number;
    if (c.kind === "trapezoidfinset") {
      ({ rootChord, height, sweepLength: sweep } = c);
      tipChord = c.tipChord;
    } else if (c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
      rootChord = c.rootChord;
      height = c.height;
      sweep = c.sweepLength;
      tipChord = equivalentTipChord(c.area, c.rootChord, c.height);
    } else {
      continue;
    }
    if (!(height > 0) || !(rootChord > 0)) continue;
    const seatR = radiusAtStation(rocket, p.xFore + rootChord / 2) || maxRadius;
    const tipR = seatR + height;
    fins.push({
      id: c.id,
      poly: [
        [p.xFore, seatR], // root leading edge
        [p.xFore + sweep, tipR], // tip leading edge
        [p.xFore + sweep + tipChord, tipR], // tip trailing edge
        [p.xFore + rootChord, seatR], // root trailing edge
      ],
    });
    maxExtent = Math.max(maxExtent, tipR);
  }

  let length = 0;
  for (const [x] of body) length = Math.max(length, x);

  return { body, parts, fins, length, maxRadius, maxExtent };
}
