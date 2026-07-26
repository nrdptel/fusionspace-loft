/** One string standing for "the design this result was computed from".
 *
 *  The heavy analysis panels — a second-solver cross-check, a motor sweep, a parameter sweep, a
 *  Monte-Carlo — are user-triggered and then sit there holding their answer. If the flyer edits the
 *  design underneath them, that answer describes a rocket that is no longer on screen. Keying each
 *  panel on this string resets it instead, so a stale number is never shown as a current one.
 *
 *  It walks the edits object rather than naming its fields, because it used to be spelled out once
 *  per panel: a what-if added to the editor then reset one panel and silently failed to reset the
 *  other three. */
import type { GeometryEdits } from "./edit";

export interface FlownDesign {
  /** The design's own name — changing which design is loaded changes this. */
  name: string;
  /** The motor configuration being flown, and which stored simulation's conditions it uses. */
  configId?: string;
  simIndex: number;
  /** Flight what-ifs that are not part of the airframe. */
  ballastKg?: number;
  recoveryCdScale?: number;
  motorSwap?: { designation: string };
  /** Every structural what-if, whatever the editor grows. */
  geometry?: GeometryEdits;
}

/** Fields that say which component the panel is POINTING AT rather than what it changed. They must
 *  stay out of the key: selecting a different fin set alters no geometry, so a Monte-Carlo already
 *  flown still describes the design on screen, and resetting it would throw away minutes of work
 *  for a click that changed nothing. The moment a value edit follows, the key moves on its own. */
const SELECTION_ONLY_FIELDS = new Set(["finSetId"]);

export function designKey(d: FlownDesign): string {
  const g = (d.geometry ?? {}) as Record<string, unknown>;
  const edits = Object.keys(g)
    .filter((k) => !SELECTION_ONLY_FIELDS.has(k))
    .sort()
    .map((k) => `${k}=${g[k] ?? ""}`)
    .join(",");
  return [
    d.name,
    d.configId ?? "",
    d.simIndex,
    d.ballastKg ?? 0,
    d.recoveryCdScale ?? 1,
    d.motorSwap?.designation ?? "",
    edits,
  ].join(":");
}
