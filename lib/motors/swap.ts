/** Which bundled motors to offer as substitutes for the design's own, and how to tell the design's
 *  own row apart from a same-named motor by another maker.
 *
 *  Split out of the workspace so the policy can be tested directly: the swap picker and the motor
 *  sweep are both gated on it, and getting it wrong either hides them or makes a claim about
 *  physical fit that the design file does not support. */
import { allMotors, resolveMotor, type MotorDbEntry } from "./db";

/** A bundled motor offered as a substitute, as the picker and the sweep both describe it. */
export interface SwapOption {
  designation: string;
  manufacturer: string;
  /** Casing diameter in metres, passed through to the motor swap. */
  diameter: number;
  motorClass: string;
}

/** The catalog's spelling of a motor's maker. A curve header carries whatever its author typed
 *  ("E", "Q", "AT"); the certification record has the real name. Both the offered options and the
 *  design's own identity go through this one function, because the sweep marks the design's row by
 *  comparing the two — spelling them differently in two places would silently unmark it. */
function makerOf(entry: MotorDbEntry): string {
  return entry.manufacturer ?? entry.curve.manufacturer ?? "";
}

/** Every bundled motor of the given casing, weakest total impulse first. */
export function swapOptions(casingMm: number): SwapOption[] {
  if (!(casingMm > 0)) return [];
  return allMotors()
    .filter((m) => Math.round(m.curve.diameterMm) === casingMm)
    .sort((a, b) => a.curve.totalImpulse - b.curve.totalImpulse)
    .map((m) => ({
      designation: m.designation,
      manufacturer: makerOf(m),
      diameter: m.curve.diameterMm / 1000,
      motorClass: m.curve.motorClass,
    }));
}

/** What can be said about the design's own motor, for filtering and marking swaps. */
export interface DesignMotorIdentity {
  /** Casing diameter in mm to offer swaps at. 0 means nothing can be said, and both surfaces stay
   *  off rather than offer a list built on a guess. */
  casingMm: number;
  /** The manufacturer as the bundled catalog spells it — set ONLY on an exact designation match,
   *  because that is the only quality at which the entry is certainly this motor. Undefined leaves
   *  the sweep marking the design's row by designation alone, which is all an unmatched motor
   *  supports. */
  manufacturer?: string;
  /** Whether the design's motor resolves to a bundled thrust curve at all — i.e. whether this design
   *  flies. False on a design whose motor is not in the catalog, where the casing came from the
   *  file's stated figure instead. The copy branches on this: "the casing of the motor this design
   *  already flies" is a claim about a flight, and a design with an unmatched motor makes none —
   *  asserting it on the same page as "there is no thrust to fly" contradicts that page. */
  resolves: boolean;
}

/** Identify the design's motor for the swap surfaces.
 *
 *  The casing comes from the design file when the file states one — OpenRocket does. RockSim and
 *  RASAero do not: RockSim's `MotorDia` is the mount's BORE (76 mm on the mount of a 75 mm motor)
 *  and RASAero records only the nozzle exit diameter, so their adapters leave the casing 0. For
 *  those, the casing of the motor the design ALREADY FLIES is the honest filter — that motor
 *  demonstrably fits this rocket, so a bundled motor of the same casing fits it too, which is the
 *  identical claim the OpenRocket path makes from the file's own figure.
 *
 *  Two things it deliberately does NOT do. It does not fall back to the bore: a bore is an upper
 *  bound, and filtering on it drops the design's own motor out of the very list of motors said to
 *  fit (the 76 mm mount above would offer no 75 mm motor at all). And it does not accept a loose
 *  catalog match: `resolveMotor` scores a bare two-way substring test as a "designation" match, so
 *  "H225-14A-8" comes back as an 18 mm Estes A8 — seeding a fit claim from a coincidence of
 *  spelling. */
export function designMotorIdentity(motor: {
  designation?: string;
  manufacturer?: string;
  /** Casing diameter in metres, as the design file stated it. */
  diameter?: number;
}): DesignMotorIdentity {
  const statedMm = Math.round((motor.diameter ?? 0) * 1000);
  if (!motor.designation) return { casingMm: statedMm > 0 ? statedMm : 0, resolves: false };
  const hit = resolveMotor({ designation: motor.designation, manufacturer: motor.manufacturer });
  const matched: MotorDbEntry | null = hit?.quality === "exact" ? hit.entry : null;
  return {
    // The file's own figure wins where it has one; the catalog only fills a silence.
    casingMm: statedMm > 0 ? statedMm : Math.round(matched?.curve.diameterMm ?? 0),
    manufacturer: matched ? makerOf(matched) : undefined,
    // ANY quality, not just exact: a loose match is not good enough to seed a casing from,
    // but it is what the simulator flies, so it is the honest answer to "does this fly?".
    resolves: hit !== null,
  };
}
