/** Fin planform geometry from an outline of points — format-agnostic, so every importer that can
 *  produce an outline gets the same treatment.
 *
 *  A freeform (custom) fin is defined only by its shape: OpenRocket writes `<finpoints>`, RockSim
 *  writes a `<PointList>`. Both mean the same thing — a closed polygon in the fin's own plane, x
 *  chordwise from the root leading edge and y spanwise from the root — so the maths belongs here
 *  rather than in either adapter.
 */

/** A point on a fin outline: `x` chordwise, `y` spanwise, both in the outline's own units. */
export interface FinPoint {
  x: number;
  y: number;
}

/** The exact chordwise centre of pressure of a planform, measured from the root leading edge, by
 *  Barrowman strip theory: each spanwise strip carries lift at its own quarter-chord, and the
 *  planform's CP is the chord-weighted mean of those. This is what lets a freeform fin keep its
 *  real shape instead of being reduced to an equal-area trapezoid, whose CP can sit noticeably
 *  differently — the shape is the whole point of drawing one. Span-scale invariant, so it stays
 *  valid when a geometry edit stretches the fin. */
export function freeformChordwiseCp(pts: FinPoint[], span: number, rootLe: number): number {
  if (pts.length < 3 || !(span > 0)) return 0;
  const N = 200; // strips; the CP is computed once per design, so this is negligible.
  let num = 0;
  let den = 0;
  for (let i = 0; i < N; i++) {
    const y = ((i + 0.5) / N) * span;
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < pts.length; j++) {
      const a = pts[j];
      const b = pts[(j + 1) % pts.length];
      // Half-open span test so a vertex shared by two edges is counted once.
      if ((a.y <= y && y < b.y) || (b.y <= y && y < a.y)) {
        const x = a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    if (hi <= lo) continue;
    const c = hi - lo;
    num += (lo + 0.25 * c) * c; // dy is constant, so it cancels in the ratio
    den += c;
  }
  return den > 0 ? num / den - rootLe : 0;
}

/** Everything the model needs about one fin, derived from its outline. Units are the outline's. */
export interface Planform {
  /** Planform area of one fin. */
  area: number;
  /** Leading-edge sweep: the chordwise offset of the tip's leading edge from the root's. */
  sweep: number;
  /** Semi-span: the outline's greatest spanwise extent. */
  span: number;
  /** Root chord: the chordwise extent of the edge that meets the body. */
  rootChord: number;
  /** Exact chordwise CP from the root leading edge (see `freeformChordwiseCp`). */
  cpChord: number;
}

/** Derive a fin's span, root chord, area, sweep and exact CP from its outline, so a custom shape
 *  isn't treated as a degenerate zero-span fin and the aero doesn't have to guess a trapezoid. */
export function planformFromPoints(pts: FinPoint[]): Planform {
  if (pts.length < 3) return { area: 0, sweep: 0, span: 0, rootChord: 0, cpChord: 0 };
  // Shoelace area, and the semi-span as the greatest spanwise extent.
  let area = 0;
  let maxY = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
    if (a.y > maxY) maxY = a.y;
  }
  // Leading-edge sweep: the tip's LEADING edge, i.e. the smallest x among the points at the tip —
  // NOT simply the first point that reaches the tip. The two agree only if the outline happens to
  // be traversed leading-edge first: OpenRocket writes its `<finpoints>` that way, RockSim writes
  // its `<PointList>` the other way round, and taking the first would hand back the tip's TRAILING
  // edge on a RockSim custom fin (177.8 mm instead of 101.6 mm on the corpus's USLI design),
  // over-stating the sweep in both the normal-force slope and the leading-edge drag factor.
  const tipBand = Math.max(1e-9, maxY * 1e-6);
  let sweep = Infinity;
  for (const p of pts) if (p.y >= maxY - tipBand) sweep = Math.min(sweep, p.x);
  if (!Number.isFinite(sweep)) sweep = 0;
  // Root chord: the x-extent of the fin edge that meets the body (y within a small band of 0).
  const eps = Math.max(1e-4, maxY * 0.02);
  let rootMin = Infinity;
  let rootMax = -Infinity;
  for (const p of pts) {
    if (p.y <= eps) {
      rootMin = Math.min(rootMin, p.x);
      rootMax = Math.max(rootMax, p.x);
    }
  }
  let rootChord = rootMax - rootMin;
  if (!(rootChord > 0)) {
    // Degenerate root band — fall back to the overall chordwise extent.
    const xs = pts.map((p) => p.x);
    rootChord = Math.max(...xs) - Math.min(...xs);
  }
  const rootLe = Number.isFinite(rootMin) ? rootMin : Math.min(...pts.map((p) => p.x));
  const cpChord = freeformChordwiseCp(pts, maxY, rootLe);
  return { area: Math.abs(area) / 2, sweep, span: maxY, rootChord, cpChord };
}
