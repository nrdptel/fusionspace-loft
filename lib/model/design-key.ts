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
import { AIM_SLOTS } from "./edit";

export interface FlownDesign {
  /** Which design is loaded, as an opaque token minted once per load. It is deliberately NOT the
   *  design's name: the name is editable metadata that touches neither the airframe nor the flight,
   *  and keying on it made every keystroke in the rename field re-fly the Monte-Carlo and both
   *  sweeps, and mark the RocketPy cross-check stale — that one is button-driven and never re-runs
   *  itself, so it kept its figures under a staleness label the flyer could only clear by fetching
   *  the engine again. Either way it is the "throw minutes of work away for a change that changed
   *  nothing" this key exists to prevent. */
  loadId: string | number;
  /** The motor configuration being flown, and which stored simulation's conditions it uses. */
  configId?: string;
  simIndex: number;
  /** Flight what-ifs that are not part of the airframe. */
  ballastKg?: number;
  recoveryCdScale?: number;
  /** Carries the manufacturer as well as the designation, because a designation alone does not
   *  identify a motor: an 18 mm swap list holds both an Estes C6 and a Quest C6, and they fly
   *  measurably differently. Keyed on the designation alone, swapping between them left every heavy
   *  panel showing the previous motor's flight as the current one. `motorSweep` already had to take
   *  the manufacturer for the same reason. */
  motorSwap?: { manufacturer?: string; designation: string };
  /** Every structural what-if, whatever the editor grows. */
  geometry?: GeometryEdits;
}

/** Each field that says which component the panel is POINTING AT, against the value fields it decides
 *  the target of. While any of ITS value fields is set, moving that selection moves the edit onto a
 *  different component, which IS a different rocket.
 *
 *  Read from the edit model's own aim registry rather than restated here. Kept per role rather than as
 *  one pooled test: with the selections pooled, picking a fin set would have thrown away a Monte-Carlo
 *  because a body-length edit happened to be active, and picking a canopy would have done the same to a
 *  design whose only edit was a fin span — minutes of work discarded for a click that changed nothing
 *  about the rocket.
 *
 *  A selection field the registry does not know is treated as a plain edit and stays IN the key. That is
 *  the safe direction to be wrong in: a panel resets when it did not strictly have to, rather than
 *  showing one part's numbers as another's. */
/** One edit's value, serialised STRUCTURALLY rather than by string interpolation.
 *
 *  `${v}` on an object — or on an array of objects — gives "[object Object]", so every value of that
 *  shape collapses to the same token and the key stops moving. That was invisible while every field was
 *  a scalar or a list of ids; the moment the editor grew a list of AUTHORED PARTS, resizing one left the
 *  key identical and the heavy panels kept an answer computed for a different rocket. Measured: a design
 *  with one authored 300 mm tube and the same design with it at 400 mm produced the same key.
 *
 *  This is the failure mode the whole module exists to prevent, arriving through the serialiser instead
 *  of through a missing field — which is why it survived a helper that walks the object rather than
 *  naming its fields. */
function value(v: unknown): string {
  if (v === undefined || v === null) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export function designKey(d: FlownDesign): string {
  const g = (d.geometry ?? {}) as Record<string, unknown>;
  // A selection on its own alters no geometry, so it stays out of the key: a Monte-Carlo already
  // flown still describes the design on screen, and resetting it would throw minutes of work away
  // for a click that changed nothing. But once one of the VALUE edits it aims is set, the selection
  // decides which component that value lands on — so the same numbers on a different part are a
  // different rocket, and a panel that kept its results would be presenting another design's numbers
  // as this one's.
  const aimMatters = (k: string) =>
    (AIM_SLOTS[k]?.targets ?? []).some((f) => g[f] !== undefined && g[f] !== "");
  const edits = Object.keys(g)
    .filter((k) => !(k in AIM_SLOTS) || aimMatters(k))
    .sort()
    .map((k) => `${k}=${value(g[k])}`)
    .join(",");
  return [
    d.loadId,
    d.configId ?? "",
    d.simIndex,
    d.ballastKg ?? 0,
    d.recoveryCdScale ?? 1,
    d.motorSwap ? `${d.motorSwap.manufacturer ?? ""}|${d.motorSwap.designation}` : "",
    edits,
  ].join(":");
}
