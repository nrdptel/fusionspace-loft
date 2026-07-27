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

/** Fields that say which component the panel is POINTING AT rather than what it changed. */
const SELECTION_ONLY_FIELDS = new Set(["finSetId"]);
/** The fin edits `finSetId` decides the target of. While any of them is set, moving the selection
 *  moves the edit onto a different fin, which IS a different rocket. */
const FIN_VALUE_FIELDS = [
  "finSpan",
  "finCount",
  "finRootChord",
  "finTipChord",
  "finSweepLength",
  "finStation",
  "finThickness",
  "finCrossSection",
  "finMaterial",
];

export function designKey(d: FlownDesign): string {
  const g = (d.geometry ?? {}) as Record<string, unknown>;
  // A selection on its own alters no geometry, so it stays out of the key: a Monte-Carlo already
  // flown still describes the design on screen, and resetting it would throw minutes of work away
  // for a click that changed nothing. But once a fin VALUE edit is set, the selection decides which
  // fin that value lands on — so the same numbers on a different set are a different rocket, and a
  // panel that kept its results would be presenting another design's numbers as this one's.
  const finEditActive = FIN_VALUE_FIELDS.some((k) => g[k] !== undefined && g[k] !== "");
  const edits = Object.keys(g)
    .filter((k) => finEditActive || !SELECTION_ONLY_FIELDS.has(k))
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
