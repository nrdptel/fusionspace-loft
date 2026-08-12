/** Where a part's mass came from, in the words every surface uses for it.
 *
 *  `MassProvenance` in `lib/model/types.ts` carries the fact; this carries the sentence. It lives on
 *  its own because **three surfaces now answer the same question and they must answer it the same
 *  way**: the parts table's *Mass from* column, the identify line under the drawing, and the mass &
 *  balance breakdown. A describer local to one of them is a describer the other two cannot import —
 *  which is exactly how the validation table came to publish a sentinel this same run while the
 *  Flight card withheld it, and why `lib/sim/withheld.ts` exists for the same reason.
 *
 *  **`undefined` means Loft computed it** from the part's geometry and its material, which is the
 *  ordinary case and the one that needs no mark. The other three are claims a surface must be able
 *  to make and a flyer must be able to tell apart. */

import type { MassProvenance, RocketComponent } from "./model/types";

/** The mark and the words for a stated provenance, or `undefined` when the mass is Loft's own.
 *
 *  The MARK is for a dense table that can carry a key within reach of it — the parts table puts one
 *  in its own caption. A surface with nowhere to put a key should use the label and not the mark: a
 *  dagger with no legend says less than nothing, which is why the identify line spells it out. */
export function massSource(c: RocketComponent): { mark: string; label: string } | undefined {
  const from = (c as { massFrom?: MassProvenance }).massFrom;
  if (from === "stated") return { mark: "†", label: "stated by the design" };
  if (from === "tool") return { mark: "‡", label: "computed by the source tool" };
  if (from === "flyer") return { mark: "§", label: "the figure you set" };
  return undefined;
}

/** The words for a part whose mass IS on the row, including the unmarked case.
 *
 *  "Loft's own" rather than "computed here", because unmarked covers two things that are both Loft's
 *  and only one of which is a derivation: a mass computed from geometry and material, and one Loft
 *  itself authored (the starter's avionics, a what-if payload). Saying "computed" of the second would
 *  be a claim about a calculation that never happened.
 *
 *  `hasOwnMass` is false for a part whose mass is counted somewhere else — one subsumed by an
 *  ancestor's whole-assembly override, or one carrying no structural mass at all. **A part with no
 *  mass of its own has no provenance either**, and saying "Loft's own" there would be a claim about a
 *  number that is not on the row; the caller's own Mass cell already says where it went. */
export function massSourceLabel(c: RocketComponent, hasOwnMass: boolean): string {
  if (!hasOwnMass) return "—";
  return massSource(c)?.label ?? "Loft's own";
}

/** The words for where a part's BALANCE POINT came from — the same question as `massSourceLabel`
 *  about the other number the mass model produces per part, so it lives beside it and shares its
 *  vocabulary rather than inventing a second one.
 *
 *  **Loft already FLIES a stated CG and said nothing about it.** Measured 2026-08-11 over the
 *  35-design corpus: 15 stated CGs across 8 designs — 5 nose cones (lead in the tip is the ordinary
 *  reason), 4 parachutes, 2 mass objects and one each of transition, tube coupler, body tube and fin
 *  set — and
 *  honouring them moves the static margin on 6 of the 7, by up to a full caliber. `MassBreakdown`
 *  printed a *CG from nose* figure for every one of them with no way to tell the design's claim from
 *  Loft's arithmetic, which is exactly what the mass column looked like before `massFrom`.
 *
 *  **"flyer" arrives 2026-08-12**: the editor takes a balance point for the nose cone and the body
 *  tube, written by `withStatedCG` with this mark beside the number for exactly the reason
 *  `massFrom` is — without it a hand-typed station reaches the *CG from* column captioned "Loft's
 *  own", a claim about a calculation that never happened, on the one surface whose job is saying
 *  whose figure each number is. Measured across the 35-design corpus: 62 of the 70 nose-cone and
 *  body-tube controls reach the flight and 8 do not, and the panel refuses those 8 rather than
 *  taking a number that changes nothing.
 *
 *  "tool" remains unreached — no importer marks a CG as the source tool's — and its branch stays
 *  written rather than removed, because the question it answers is the same one and the alternative
 *  is a surface inventing a fourth word for it. */
export function cgSourceLabel(c: RocketComponent, hasOwnCg: boolean): string {
  if (!hasOwnCg) return "—";
  const from = (c as { cgFrom?: MassProvenance }).cgFrom;
  if (from === "stated") return "stated by the design";
  if (from === "tool") return "computed by the source tool";
  if (from === "flyer") return "the figure you set";
  return "Loft's own";
}
