import type { MotorConfiguration } from "../model/types";
/** Which bundled motors to offer as substitutes for the design's own, and how to tell the design's
 *  own row apart from a same-named motor by another maker.
 *
 *  Split out of the workspace so the policy can be tested directly: the swap picker and the motor
 *  sweep are both gated on it, and getting it wrong either hides them or makes a claim about
 *  physical fit that the design file does not support. */
import { allMotors, resolveMotor, sameCasing, type MotorDbEntry } from "./db";

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

/** Does a motor swap already chosen still belong to the configuration being selected?
 *
 *  A swap is a choice made against ONE casing, and a design's stored configurations can span
 *  several. `swapMotor` applies whatever swap is in the edit bag unconditionally, so without this a
 *  swap chosen for a 38 mm run went on flying under a 24 mm one — while the picker, rebuilt for the
 *  new casing, could not render it and reset itself to blank. Measured on the corpus design that
 *  stores nine configurations across 24/29/38 mm: 1,068 m, 36.3:1 and 40 m/s off the rail carried
 *  over onto a configuration whose own figures are 90 m, 7:1 and 16 m/s.
 *
 *  An undefined swap is trivially still valid — there is nothing to carry over.
 *
 *  A swap that names NO manufacturer is dropped, and that is deliberate. It is tempting to match it
 *  on designation alone, but the picker cannot: its `<select>` value is `${manufacturer ?? ""}|
 *  ${designation}` while every option's is `${o.manufacturer}|${o.designation}`, so a
 *  manufacturer-less swap composes to `|F67W`, matches no option and renders blank. Keeping such a
 *  swap would preserve precisely the state this function exists to end — a motor being flown with
 *  the one control that names it showing nothing — only now on purpose. The pair is reachable: a
 *  session blob is restored as unvalidated JSON, so a stored edit can arrive without a maker.
 *
 *  It also tells two makers' same-designation motors apart, which is the trap the sweep's DESIGN
 *  badge hit: a bare designation match cannot tell an Estes C6 from a Quest C6. */
export function swapStillOffered(
  swap: { manufacturer?: string; designation: string } | undefined,
  options: SwapOption[],
): boolean {
  if (swap === undefined) return true;
  if (swap.manufacturer === undefined) return false;
  return options.some((o) => o.designation === swap.designation && o.manufacturer === swap.manufacturer);
}

/** Every bundled motor of the given casing, weakest total impulse first.
 *
 *  `sameCasing` rather than rounded equality, and it must stay the SAME predicate the flight's own
 *  casing veto uses (`lib/motors/db.ts`) — two different notions of "fits" would let the sweep offer
 *  a motor the flight refuses to place, or refuse one it flies. It also fixes a list that was already
 *  short: the catalogue certifies 3-inch motors at both 75 and 76 mm, so a 76 mm design saw 2 of the
 *  9 bundled motors that fit it and a 75 mm design saw 7. */
export function swapOptions(casingMm: number): SwapOption[] {
  if (!(casingMm > 0)) return [];
  return allMotors()
    .filter((m) => sameCasing(casingMm, Math.round(m.curve.diameterMm)))
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
   *  flies. The copy branches on it: "the casing of the motor this design already flies" is a claim
   *  about a FLIGHT, and a design whose motor was never matched makes none. Asserting it on the same
   *  page as "there is no thrust to fly" is a page contradicting itself, which was measured on
   *  `e2e/fixtures/unresolved-motor.ork`: "could not be matched … so there is no thrust to fly",
   *  "Z9999-CUSTOM — not found" and "every bundled motor of the same 29 mm casing it already flies"
   *  were all on screen at once. */
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
  // The stated casing rides along, so this asks the SAME question the simulator does. Without it the
  // two surfaces could disagree: `resolveMotor` would veto a non-fitting substitute for the flight
  // while this reported `resolves: true`, leaving the sweep claiming a design flies a motor the
  // flight refused to place.
  const hit = resolveMotor({
    designation: motor.designation,
    manufacturer: motor.manufacturer,
    diameter: motor.diameter,
  });
  const matched: MotorDbEntry | null = hit?.quality === "exact" ? hit.entry : null;
  return {
    // The file's own figure wins where it has one; the catalog only fills a silence.
    casingMm: statedMm > 0 ? statedMm : Math.round(matched?.curve.diameterMm ?? 0),
    manufacturer: matched ? makerOf(matched) : undefined,
    // ANY match quality, not just exact: a loose match is not good enough to seed a CASING from, but
    // it is what the simulator flies, so it is the honest answer to "does this design fly at all?".
    resolves: hit !== null,
  };
}

/** Write a motor swap into a rocket's own configurations, so it survives an export.
 *
 *  Only ever called for a design BUILT here, and that restriction is the whole of the decision. On an
 *  imported file a swap is a hypothesis against the flyer's own design, and baking it in would make
 *  the saved file disagree with the file they brought. On the builder path there is no such file:
 *  "Swap motor" is the only motor control in the app, so for a build that dropdown IS the motor
 *  picker, and leaving it out of the export saved a rocket nobody designed.
 *
 *  Measured on the starter across all 15 swaps the picker offers, before this existed: 7 put the saved
 *  file more than 100% away from the screen, and the worst was in the optimistic direction — an E16
 *  read 67.6 m on screen while the file it wrote flew 993.6 m, +1369%. With this, all 15 round-trip to
 *  within 0.01%. */
export function bakeMotorSwap<R extends { configurations: MotorConfiguration[] }>(
  rocket: R,
  swap: { manufacturer?: string; designation: string; diameter?: number } | undefined,
): R {
  if (!swap) return rocket;
  return {
    ...rocket,
    configurations: rocket.configurations.map((c) => ({
      ...c,
      instances: c.instances.map((i) => ({
        ...i,
        motor: {
          ...i.motor,
          manufacturer: swap.manufacturer ?? i.motor.manufacturer,
          designation: swap.designation,
          diameter: swap.diameter ?? i.motor.diameter,
        },
      })),
    })),
  };
}
