import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importOrk } from "../ork/import";
import { runFlight, overridesFromStored } from "./run";
import { ballisticGap, motorSweep, parameterSweep, linRange, type SweepMotor } from "./sweep";
import { allMotors } from "../motors/db";
import { designMotorIdentity, swapOptions } from "../motors/swap";
import { primaryFinSpan, primaryFinRootChord, primaryFinTipChord, primaryFinThickness, primaryFinStation, primaryBodyTube, finStationBounds } from "../model/edit";
import { flattenRocket } from "../model/geometry";

async function load(name: string) {
  const buf = readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
  return importOrk(new Uint8Array(buf));
}

/** The fitting bundled motors for a design's mount diameter — the same list the swap picker builds. */
function fittingMotors(diameterM: number): SweepMotor[] {
  const diaMm = Math.round(diameterM * 1000);
  return allMotors()
    .filter((m) => Math.round(m.curve.diameterMm) === diaMm)
    .map((m) => ({
      designation: m.curve.designation,
      manufacturer: m.curve.manufacturer,
      diameter: m.curve.diameterMm / 1000,
      motorClass: m.curve.motorClass,
    }));
}

describe("motorSweep", () => {
  it("flies every fitting motor and returns rows sorted by apogee (highest first)", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const dia = doc.rocket.configurations.find((c) => c.id === sim.conditions.configId)?.instances[0]?.motor
      .diameter;
    expect(dia).toBeGreaterThan(0);
    const motors = fittingMotors(dia!);
    expect(motors.length).toBeGreaterThan(1);

    const rows = motorSweep(doc.rocket, motors, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
      designMotor: doc.rocket.configurations[0].instances[0].motor.designation,
    });

    // Every returned row is a real flight with finite, positive metrics.
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) {
      expect(r.apogee).toBeGreaterThan(0);
      expect(Number.isFinite(r.maxVelocity)).toBe(true);
      expect(Number.isFinite(r.railExitVelocity)).toBe(true);
      expect(Number.isFinite(r.thrustToWeight)).toBe(true);
      expect(Number.isFinite(r.staticMarginCal)).toBe(true);
      expect(Number.isFinite(r.flutterMargin)).toBe(true); // the design has fins
    }
    // A faster motor pushes the fins closer to flutter — the highest-speed row has a thinner margin
    // than the lowest-speed row.
    const bySpeed = [...rows].sort((a, b) => a.maxVelocity - b.maxVelocity);
    expect(bySpeed[bySpeed.length - 1].flutterMargin).toBeLessThan(bySpeed[0].flutterMargin);
    // Sorted by apogee, descending.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].apogee).toBeGreaterThanOrEqual(rows[i].apogee);
    }
    // A bigger motor (class) reaches higher: the top row out-flies the bottom row.
    expect(rows[0].apogee).toBeGreaterThan(rows[rows.length - 1].apogee);
  });

  it("reports each motor's optimum apogee-deployment delay, matching a direct flight", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const dia = doc.rocket.configurations.find((c) => c.id === sim.conditions.configId)?.instances[0]?.motor
      .diameter;
    const motors = fittingMotors(dia!);
    const rows = motorSweep(doc.rocket, motors, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
      designMotor: doc.rocket.configurations[0].instances[0].motor.designation,
    });
    // Every flying motor gets a finite, positive apogee-deployment delay, and they aren't all the
    // same — each motor coasts to apogee on its own schedule, so the delay to buy differs by motor.
    for (const r of rows) expect(r.optimumDelay).toBeGreaterThan(0);
    const delays = rows.map((r) => r.optimumDelay);
    expect(Math.max(...delays) - Math.min(...delays)).toBeGreaterThan(0.5);
    // The design motor's row is just the solver run on that motor, so its delay matches a direct
    // ballistic flight of the design.
    const design = rows.find((r) => r.isDesign)!;
    const direct = runFlight(doc.rocket, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
      ballistic: true,
    }).result.summary.optimumDelay;
    expect(Math.abs(design.optimumDelay - direct)).toBeLessThan(0.2);
  });

  it("marks the design's own motor and no other", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const dia = doc.rocket.configurations[0].instances[0].motor.diameter!;
    const designMotor = doc.rocket.configurations[0].instances[0].motor.designation;
    const motors = fittingMotors(dia);

    const rows = motorSweep(doc.rocket, motors, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
      designMotor,
    });
    const marked = rows.filter((r) => r.isDesign);
    expect(marked).toHaveLength(1);
    expect(marked[0].designation).toBe(designMotor);
  });

  it("applies nose ballast to every motor — a ballasted sweep flies heavier and lower", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const dia = doc.rocket.configurations[0].instances[0].motor.diameter!;
    const motors = fittingMotors(dia);
    const base = { configId: sim.conditions.configId, overrides: overridesFromStored(sim) };

    const plain = motorSweep(doc.rocket, motors, base);
    const ballasted = motorSweep(doc.rocket, motors, { ...base, ballastKg: 0.25 });

    // Same motors fly, but each ballasted flight is heavier — lower apogee and a more forward CG
    // (higher static margin) for the same motor.
    const byMotor = (rows: typeof plain, des: string) => rows.find((r) => r.designation === des)!;
    for (const p of plain) {
      const b = byMotor(ballasted, p.designation);
      expect(b.apogee).toBeLessThan(p.apogee);
      expect(b.staticMarginCal).toBeGreaterThan(p.staticMarginCal);
    }
  });

  it("omits motors that can't be flown rather than throwing", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const good = fittingMotors(doc.rocket.configurations[0].instances[0].motor.diameter!);
    // A bogus motor the database can't resolve: it produces no thrust, so the sweep leaves it out.
    const withBogus: SweepMotor[] = [
      ...good,
      { designation: "ZZ9999XX", manufacturer: "NoSuchMaker", diameter: good[0].diameter, motorClass: "Z" },
    ];
    const rows = motorSweep(doc.rocket, withBogus, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(rows.some((r) => r.designation === "ZZ9999XX")).toBe(false);
    expect(rows.length).toBe(good.length);
  });

  it("marks one row as the design's own motor, not every maker's motor of that name", async () => {
    // A designation does not identify a motor. The bundled 18 mm set holds an Estes C6 and a Quest
    // C6, and they do not fly the same, so badging both as "the design's own" makes the table
    // disagree with itself about which flight the design actually gets.
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const options = swapOptions(18);
    const c6s = options.filter((o) => o.designation === "C6");
    expect(c6s.length, "the 18 mm set no longer carries two C6s — this test needs them").toBe(2);

    const identity = designMotorIdentity({ designation: "C6", manufacturer: "Estes" });
    const marked = motorSweep(doc.rocket, options, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
      designMotor: "C6",
      designManufacturer: identity.manufacturer,
    }).filter((r) => r.isDesign);
    expect(marked.length).toBe(1);
    // Pin which one, not just that there is one: asserting against `identity.manufacturer` alone
    // would pass with the two makers swapped.
    expect(marked[0].manufacturer).toBe("Estes Industries");
    expect(identity.manufacturer).toBe("Estes Industries");

    // Without the manufacturer there is nothing to tell them apart, and both get badged — which is
    // what this field exists to prevent, and what every RockSim/RASAero design used to get.
    const ambiguous = motorSweep(doc.rocket, options, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
      designMotor: "C6",
    }).filter((r) => r.isDesign);
    expect(ambiguous.length).toBe(2);
    expect(new Set(ambiguous.map((r) => r.manufacturer)).size).toBe(2);
  });
});

describe("linRange", () => {
  it("returns n evenly-spaced values, endpoints inclusive", () => {
    expect(linRange(0, 10, 5)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(linRange(2, 2, 1)).toEqual([2]);
    const r = linRange(1, 4, 4);
    expect(r[0]).toBe(1);
    expect(r[r.length - 1]).toBe(4);
    expect(r).toHaveLength(4);
  });
});

describe("parameterSweep", () => {
  it("sweeps fin span: bigger fins move the CP aft (more stable) and add drag (lower apogee)", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const span = primaryFinSpan(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finSpan", linRange(span * 0.5, span * 1.75, 15), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(15);
    // x ascends across the range, every flight finite and positive.
    for (let i = 0; i < pts.length; i++) {
      expect(pts[i].apogee).toBeGreaterThan(0);
      expect(Number.isFinite(pts[i].staticMarginCal)).toBe(true);
      if (i > 0) expect(pts[i].x).toBeGreaterThan(pts[i - 1].x);
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    // Bigger fins: CP aft ⇒ higher static margin; more fin drag + mass ⇒ lower apogee.
    expect(last.staticMarginCal).toBeGreaterThan(first.staticMarginCal);
    expect(last.apogee).toBeLessThan(first.apogee);
  });

  it("withholds the margin PER POINT where a swept curve loses its centre of pressure", async () => {
    // **A curve can cross the boundary partway along, which is why the withholding is per point and
    // not per sweep.** `demo-boattail.ork` swept from 5% of its fin span upward: with the fins tiny
    // the boattail's negative CNa dominates, the resultant becomes a near-couple, and Barrowman's
    // quotient runs away — measured, the two smallest spans published **-21.277 cal** and
    // **-14.129 cal** on a curve whose next point is -7.797. The first of those has a CP at
    // -165.4 mm, ahead of a nose tip at 130.5 mm; the second at 111.6 mm, still 19 mm ahead of it.
    // Neither is a margin, and both were plotted, exported to CSV, and given an axis to scale to.
    //
    // The point where the curve RESUMES is the control that keeps this from being a blanket refusal:
    // -7.797 cal is a genuine reading of a genuinely unstable rocket and it is still published.
    const doc = await load("demo-boattail.ork");
    const sim = doc.simulations[0];
    const span = primaryFinSpan(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finSpan", linRange(span * 0.05, span, 12), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(12);

    const withheld = pts.filter((p) => !Number.isFinite(p.staticMarginCal));
    expect(withheld, "the sweep no longer crosses the boundary — this case proves nothing").toHaveLength(2);
    // The withheld ones are the SMALLEST spans, and they are a prefix: a curve that went in and out
    // of definition would mean the rule is reading noise rather than a physical boundary.
    expect(pts.slice(0, 2).every((p) => !Number.isFinite(p.staticMarginCal))).toBe(true);
    expect(pts.slice(2).every((p) => Number.isFinite(p.staticMarginCal))).toBe(true);

    // The rest of the row is untouched — withheld as NaN rather than by dropping the point, so the
    // apogee and velocity curves keep their full length. Dropping them would silently shorten three
    // other curves to fix one.
    for (const p of pts) {
      expect(p.apogee).toBeGreaterThan(0);
      expect(Number.isFinite(p.maxVelocity)).toBe(true);
    }

    // And the first published point is the runaway's neighbour, not a sanitised value.
    expect(pts[2].staticMarginCal).toBeLessThan(-5);
    expect(pts[2].staticMarginCal).toBeGreaterThan(-10);
  });

  it("sweeps fin position: sliding the fins aft raises the static margin at ~unchanged apogee", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const s0 = primaryFinStation(doc.rocket)!;
    // **The range deliberately runs 200 mm past the tail, and the sweep is expected to DROP those
    // candidates rather than fly them.** This case used to assert all 13 points, which is how the
    // library came to publish a stability curve for a rocket that cannot be built: `demo-single-deploy`
    // carries its fins at 830 mm with a 120 mm root on a 950 mm airframe, so anything past 830 hangs
    // the set off the tail. Four of the thirteen put the fin's LEADING edge behind the airframe.
    const bound = finStationBounds(doc.rocket)!;
    // Reaching 300 mm forward rather than 100, so the buildable half is most of the range rather
    // than 5 points of 13: the bound cuts everything aft of `s0` on this design, and a monotone
    // assertion over five points is a weaker instrument than one over nine. The range still runs
    // 200 mm PAST the bound, which is what the drop is being tested on.
    const asked = linRange(s0 - 0.3, s0 + 0.2, 13);
    const buildable = asked.filter((v) => v <= bound.hi + 1e-9);
    expect(buildable.length, "the range must reach past the bound, or this case proves nothing").toBeLessThan(13);
    const pts = parameterSweep(doc.rocket, "finStation", asked, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(buildable.length);
    // **Dropped, not clamped-and-relabelled.** Every published x is a station the model actually
    // flew: a clamped point would carry the station the flyer asked for on the x-axis and the
    // margin of a different rocket on the y-axis, which is a worse lie than the one this replaced
    // because the two agree with each other.
    for (const p of pts) expect(p.x).toBeLessThanOrEqual(bound.hi + 1e-9);
    // The static margin climbs monotonically as the fins move aft; x ascends across the range.
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x).toBeGreaterThan(pts[i - 1].x);
      expect(pts[i].staticMarginCal).toBeGreaterThan(pts[i - 1].staticMarginCal);
    }
    // Moving the fins is a placement change: it barely touches drag or mass, so apogee holds across
    // the whole sweep — the point of the lever, and what sets it apart from a fin-size sweep.
    const apogees = pts.map((p) => p.apogee);
    const spread = (Math.max(...apogees) - Math.min(...apogees)) / apogees[0];
    expect(spread).toBeLessThan(0.02);
  });

  it("sweeps fin thickness: the flutter margin climbs steeply while drag rises (apogee falls)", async () => {
    const doc = await load("demo-dual-deploy.ork"); // a fast flight where flutter is a real concern
    const sim = doc.simulations[0];
    const t0 = primaryFinThickness(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finThickness", linRange(t0 * 0.5, t0 * 1.75, 14), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(14);
    // Every point has a finite flutter margin (the design has fins).
    for (const p of pts) expect(Number.isFinite(p.flutterMargin)).toBe(true);
    const first = pts[0];
    const last = pts[pts.length - 1];
    // Thicker fins are much stiffer (flutter speed ∝ (t/c)^1.5) — the margin rises sharply — but
    // present more drag, so the apogee falls across the range.
    expect(last.flutterMargin).toBeGreaterThan(first.flutterMargin);
    expect(last.flutterMargin).toBeGreaterThan(first.flutterMargin * 2); // the (t/c)³ steepness
    expect(last.apogee).toBeLessThan(first.apogee);
  });

  it("sweeps fin root chord: more planform drags harder (lower apogee) and shifts CG aft (lower margin)", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const root = primaryFinRootChord(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finRootChord", linRange(root * 0.5, root * 1.75, 12), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(12);
    for (let i = 0; i < pts.length; i++) {
      expect(pts[i].apogee).toBeGreaterThan(0);
      expect(Number.isFinite(pts[i].staticMarginCal)).toBe(true);
      if (i > 0) expect(pts[i].x).toBeGreaterThan(pts[i - 1].x);
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    // A longer root chord adds planform and drag, so the apogee falls. The added chord extends aft
    // along the body (its root TE already sits at this design's tail), so the extra fin mass lands
    // well aft and pulls the CG toward the CP faster than the low-arm area moves the CP — so the
    // static margin eases down too, monotonically across the range.
    expect(last.apogee).toBeLessThan(first.apogee);
    expect(last.staticMarginCal).toBeLessThan(first.staticMarginCal);
  });

  it("sweeps fin tip chord: growing the tip adds planform — lower apogee, and the aft mass eases margin", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const tip = primaryFinTipChord(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finTipChord", linRange(tip * 0.5, tip * 1.75, 12), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(12);
    for (let i = 1; i < pts.length; i++) expect(pts[i].x).toBeGreaterThan(pts[i - 1].x);
    const first = pts[0];
    const last = pts[pts.length - 1];
    // More tip chord is more planform (more drag → lower apogee); the added area sits at the swept-back
    // tip, so its mass lands aft and the static margin eases down across the range.
    expect(last.apogee).toBeLessThan(first.apogee);
    expect(last.staticMarginCal).toBeLessThan(first.staticMarginCal);
  });

  it("reports a flutter margin on a fin-span sweep (bigger fins → thinner flutter margin)", async () => {
    const doc = await load("demo-dual-deploy.ork");
    const sim = doc.simulations[0];
    const span = primaryFinSpan(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finSpan", linRange(span * 0.6, span * 1.6, 10), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    // A larger span raises the aspect ratio, which lowers the flutter speed: the margin shrinks.
    expect(pts[pts.length - 1].flutterMargin).toBeLessThan(pts[0].flutterMargin);
    expect(pts.every((p) => Number.isFinite(p.flutterMargin))).toBe(true);
  });

  it("sweeps body length: a longer airframe flies heavier (lower apogee) and more stable", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const body = primaryBodyTube(doc.rocket)!.length;
    const pts = parameterSweep(doc.rocket, "bodyLength", linRange(body * 0.6, body * 1.6, 12), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[pts.length - 1].apogee).toBeLessThan(pts[0].apogee);
    expect(pts[pts.length - 1].staticMarginCal).toBeGreaterThan(pts[0].staticMarginCal);
  });

  it("sweeps body diameter: a wider airframe drags more (lower apogee) and is less stable in calibers", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const d0 = 0.038; // the demo's 38 mm airframe
    const pts = parameterSweep(doc.rocket, "bodyDiameter", linRange(d0 * 0.6, d0 * 1.6, 12), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts.length).toBeGreaterThan(2);
    // Wider ⇒ more reference area and mass (lower apogee) and proportionally smaller fins (less
    // stable in calibers).
    expect(pts[pts.length - 1].apogee).toBeLessThan(pts[0].apogee);
    expect(pts[pts.length - 1].staticMarginCal).toBeLessThan(pts[0].staticMarginCal);
  });

  it("holds other what-ifs fixed while sweeping — active nose ballast still applies at every point", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const span = primaryFinSpan(doc.rocket)!;
    const base = {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    };
    const values = linRange(span * 0.5, span * 1.5, 8);
    const plain = parameterSweep(doc.rocket, "finSpan", values, base);
    // Nose ballast is held fixed across the span sweep; it moves the CG forward and adds mass, so
    // every point is more stable and flies lower than the un-ballasted sweep — proving the other
    // what-if carries through untouched while only fin span varies.
    const ballasted = parameterSweep(doc.rocket, "finSpan", values, { ...base, ballastKg: 0.2 });
    expect(ballasted).toHaveLength(plain.length);
    for (let i = 0; i < plain.length; i++) {
      expect(ballasted[i].staticMarginCal).toBeGreaterThan(plain[i].staticMarginCal);
      expect(ballasted[i].apogee).toBeLessThan(plain[i].apogee);
    }
  });

  it("sweeps nose ballast: more weight raises the margin and lowers apogee, from a zero-ballast start", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    // 0 → 200 g of nose weight.
    const pts = parameterSweep(doc.rocket, "ballastKg", linRange(0, 0.2, 11), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(11);
    // Ballast starts at zero (no added weight) and increases.
    expect(pts[0].x).toBe(0);
    expect(pts[pts.length - 1].x).toBeCloseTo(0.2, 9);
    // Nose weight moves the CG forward (margin up monotonically) and flies heavier (apogee down).
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].staticMarginCal).toBeGreaterThan(pts[i - 1].staticMarginCal);
      expect(pts[i].apogee).toBeLessThan(pts[i - 1].apogee);
    }
    // The zero-ballast point is the plain design.
    const plain = runFlight(doc.rocket, { configId: sim.conditions.configId, overrides: overridesFromStored(sim), ballistic: true });
    expect(pts[0].apogee).toBeCloseTo(plain.result.summary.apogee, 5);
    expect(pts[0].staticMarginCal).toBeCloseTo(plain.result.staticMarginCal, 5);
  });

  it("skips non-positive values rather than flying a degenerate rocket", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const span = primaryFinSpan(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finSpan", [0, -span, span], {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(span, 9);
  });

  it("withholds the static margin when a motor is missing, and keeps the flight it can still fly", async () => {
    // **The Sev-1 this exists for, reproduced 2026-08-08 before it was fixed.** `hasPropulsion` is
    // `some(match)` — a configuration with two mounts and one designation Loft has no curve for
    // still flies, and its reduced apogee is treated as a meaningful answer on purpose. The static
    // margin is not: it is measured from the LOADED CG, which is short one motor's mass. The summary
    // strip has withheld it under `!motorsComplete` since the day that was measured (4.065 → 5.921
    // cal, +46%, more stable than the truth); this module published it regardless, so a flyer read
    // "Static margin —, a motor in this configuration could not be matched" with a whole curve of it
    // plotted and CSV-exported directly below. Measured on this construction before the fix:
    // 1.098 / 1.290 / 1.487 cal, straddling the 1-caliber line fins are sized against.
    const doc = await load("demo-single-deploy.ork");
    const two = structuredClone(doc.rocket);
    const flat = flattenRocket(two);
    const mount = flat.find((p) => (p.component as unknown as Record<string, unknown>).motorMount)!.component;
    const host = flat.find((p) => p.component.children.includes(mount))!.component;
    // A SECOND mount, wide enough that the bore veto does not fire — that veto withholds the whole
    // flight and would hide the state this is about — carrying a designation nothing can resolve.
    const roomy = structuredClone(mount) as typeof mount & { innerRadius: number; outerRadius: number };
    roomy.id = `${mount.id}-roomy`;
    roomy.name = "roomy mount";
    roomy.innerRadius = 0.05;
    roomy.outerRadius = 0.052;
    host.children = [...host.children, roomy];
    const cfg = two.configurations[0];
    two.configurations = [
      {
        ...cfg,
        instances: [
          ...cfg.instances,
          { ...cfg.instances[0], mountId: roomy.id, motor: { ...cfg.instances[0].motor, designation: "ZZ999", manufacturer: "Nobody" } },
        ],
      },
    ];

    const run = runFlight(two, { configId: two.configurations[0].id });
    // The control: this construction really does reach the partial state, and not the empty one.
    expect(run.hasPropulsion, "the construction no longer flies at all — it is testing the wrong state").toBe(true);
    expect(run.motorsComplete, "the construction resolved every motor — it is testing the wrong state").toBe(false);

    const len = primaryBodyTube(two)!.length;
    const pts = parameterSweep(two, "bodyLength", linRange(len * 0.9, len * 1.1, 3), {
      configId: two.configurations[0].id,
    });
    // The flight that is still meaningful survives...
    expect(pts.length, "the withholding must not silently shorten the apogee curve").toBe(3);
    for (const p of pts) expect(p.apogee).toBeGreaterThan(0);
    // ...and the one that is not is withheld rather than published.
    for (const p of pts) {
      expect(
        Number.isFinite(p.staticMarginCal),
        `a static margin (${p.staticMarginCal}) was published for a configuration whose CG is missing a motor`,
      ).toBe(false);
    }

    // And the motor sweep on the SAME design is safe for a reason rather than by luck: every row is
    // flown with a `motorSwap`, and a swap replaces every instance, so the set is complete again.
    const swapped = runFlight(two, { configId: two.configurations[0].id, motorSwap: { designation: "H128W" } });
    expect(swapped.motorsComplete, "a motor swap no longer completes the configuration — motorSweep's margin needs re-checking").toBe(true);
  }, 60_000);
});


describe("ballisticGap — the DESIGN row against the flight one tab away", () => {
  it("says nothing when the design's row IS the flight the flyer read", () => {
    // Every row is ballistic, so the design's own row differs a little on any design that carries
    // recovery mass. That is the method, not a discrepancy, and naming it every time would make the
    // notice boilerplate — which is how a real signal gets ignored.
    expect(ballisticGap(1000, 1000)).toBeNull();
    expect(ballisticGap(1020, 1000)).toBeNull();
    expect(ballisticGap(960, 1000)).toBeNull();
    // Exactly on the threshold is still silence; past it is not.
    expect(ballisticGap(1050, 1000)).toBeNull();
    expect(ballisticGap(1051, 1000)).not.toBeNull();
  });

  it("names both numbers when the design deploys before apogee and the two are different flights", () => {
    // The measured case: the bundled USLI airframe's row reads 1,888 m against a flight of 342 m.
    expect(ballisticGap(1888, 342)).toEqual({ sweep: 1888, flown: 342 });
    // Symmetric — a design flying HIGHER than its row is just as much a disagreement on screen.
    expect(ballisticGap(500, 1000)).toEqual({ sweep: 500, flown: 1000 });
  });

  it("says nothing rather than dividing by a number it does not have", () => {
    expect(ballisticGap(undefined, 342)).toBeNull();
    expect(ballisticGap(1888, undefined)).toBeNull();
    expect(ballisticGap(1888, 0)).toBeNull();
    expect(ballisticGap(Number.NaN, 342)).toBeNull();
    expect(ballisticGap(1888, Number.NaN)).toBeNull();
  });
});
