import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { runFromDocument, runFlight, configChoices, overridesFromStored } from "./run";
import { allMotors } from "../motors/db";
import { flattenRocket } from "../model/geometry";
import { primaryFinSpan, primaryFinCount, primaryFinRootChord, primaryFinTipChord, primaryFinSweep, primaryFinThickness, primaryNose, primaryNoseShape, primaryBodyTube, primaryBodyDiameter, moveTarget, applyGeometryEdits } from "../model/edit";
import type { OrkDocument } from "../ork/adapt";

/** End-to-end: import each committed fixture, fly it, and check the results are physically
 *  plausible and stable. The exact numbers are Loft's own engine output (a regression guard),
 *  NOT an accuracy claim against OpenRocket — the fixtures' stored figures are independent
 *  author estimates (see fixtures/README.md). Bands are wide on purpose. */

async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name)));
  return importOrk(bytes);
}

describe("a mount too small for the motor inside it", () => {
  it("refuses the flight instead of reporting a confident, flattering apogee", async () => {
    // **The Sev-1 this exists for.** `vetoedForFit` above compares the file's STATED casing against
    // the bundled curve and never looks at the mount, so any route that shrinks the mount's geometry
    // flew a motor through an airframe narrower than itself. Measured 2026-08-05 on the corpus's
    // `Dual parachute deployment.ork`: typing the body diameter down took apogee
    // 579.0 -> 695.4 -> 768.0 -> 912.5 -> 975.7 -> 978.5 m at 20, 10, 5, 1 and 0.1 mm, every one
    // reported as a flight, and the WARNING LIST GOT SHORTER on the way — a 38 mm motor inside a
    // 0.1 mm airframe, at +69% and with fewer cautions than the real design.
    //
    // It reads HIGH, which is the part that makes it a safety problem rather than a curiosity: a
    // thinner airframe is a smaller reference area and therefore less drag, so the number a flyer
    // would act on is wrong in the flattering direction.
    const doc = await load("demo-single-deploy.ork");
    const asDesigned = runFromDocument(doc);
    expect(asDesigned.hasPropulsion, "the fixture's own design must still fly").toBe(true);
    expect(asDesigned.resolutions[0].vetoedBore, "nothing was vetoed on an untouched design").toBeUndefined();

    const motorMm = Math.round(asDesigned.resolutions[0].match!.entry.curve.diameterMm);
    // Every diameter from "snug" to "absurd". The important property is that NONE of them flies —
    // an assertion on 0.1 mm alone would pass on a guard that only caught the degenerate case.
    for (const mm of [motorMm - 4, motorMm / 2, 5, 1, 0.1]) {
      const run = runFromDocument(doc, { geometry: { bodyDiameter: mm / 1000 } });
      expect(run.hasPropulsion, `a ${motorMm} mm motor flew inside a ${mm} mm airframe`).toBe(false);
      const veto = run.resolutions[0].vetoedBore;
      expect(veto, `no bore refusal at ${mm} mm`).toBeDefined();
      expect(veto!.motorMm).toBe(motorMm);
      expect(veto!.boreMm).toBeLessThan(motorMm);
      // The refusal has to name the motor it turned down, not just complain: the panel's sentence is
      // built from these three fields and a blank one reads as a bug rather than as a refusal.
      expect(veto!.designation.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it("refuses no real design, and prints how close the tightest one is", async () => {
    // **The check that would have caught the tolerance being wrong before a gate did.** A guard like
    // this one has two failure modes and only the loud one is obvious: it can miss the impossible
    // design, and it can refuse the honest ones. The second is the more damaging — a corpus of real
    // files turning into withheld flights — and it is invisible to every other case here, which all
    // construct their own inputs.
    //
    // Measured 2026-08-05 across 132 motor instances in the 6 fixtures and the 35-design corpus: the
    // tightest honest file states a bore 1.60 mm NARROWER than the motor it holds
    // (`demo-dual-deploy.ork`, a K550W), then five at 1.00 mm, then 0.40 mm and better. A real `.ork`
    // states a nominal mount rather than a machined one. The tolerance is 3 mm, so this asserts the
    // margin and PRINTS it — a fixture added tomorrow at 2.8 mm should be visible as "nearly", not
    // discovered when somebody tightens the constant.
    const worst: { name: string; headroomMm: number }[] = [];
    for (const name of [
      "demo-single-deploy.ork",
      "demo-dual-deploy.ork",
      "demo-boattail.ork",
      "demo-multi-config.ork",
      "demo-payload-separation.ork",
      "demo-quirks.ork",
    ]) {
      const doc = await load(name);
      for (const cfg of doc.rocket.configurations) {
        const run = runFlight(doc.rocket, { configId: cfg.id });
        expect(
          run.resolutions.filter((r) => r.vetoedBore),
          `${name} (${cfg.id}) has a motor this veto refuses`,
        ).toEqual([]);
      }
      const byId = new Map(flattenRocket(doc.rocket).map((p) => [p.component.id, p.component]));
      for (const cfg of doc.rocket.configurations) {
        for (const inst of cfg.instances) {
          const run = runFlight(doc.rocket, { configId: cfg.id });
          const res = run.resolutions.find((r) => r.mountId === inst.mountId);
          const c = byId.get(inst.mountId);
          if (!res?.match || !c) continue;
          const bore =
            c.kind === "innertube"
              ? c.innerRadius
              : c.kind === "bodytube"
                ? (c.thickness ?? 0) > 0
                  ? c.outerRadius - (c.thickness as number)
                  : c.outerRadius
                : undefined;
          if (bore === undefined || bore <= 0) continue;
          worst.push({ name, headroomMm: bore * 2000 - res.match.entry.curve.diameterMm });
        }
      }
    }
    worst.sort((a, b) => a.headroomMm - b.headroomMm);
    expect(worst.length, "no mount bores were measured — the loop found nothing").toBeGreaterThan(5);
    console.log(
      `tightest stated mount bores (mm of diameter, negative = motor wider than the stated bore):\n` +
        worst.slice(0, 4).map((w) => `  ${w.headroomMm.toFixed(2)}  ${w.name}`).join("\n"),
    );
    // Slack is 3 mm; assert real files stay clear of it with room, so tightening the constant to the
    // measurement is a deliberate act rather than something a new fixture does by accident.
    expect(worst[0].headroomMm, "a fixture now sits within a millimetre of the refusal threshold").toBeGreaterThan(-2);
  }, 120_000);

  it("withholds the WHOLE flight, not just the motor it refused", async () => {
    // **The Sev-1 at partial scale, and a pre-push review is what found it.** The veto is per
    // instance and `hasPropulsion` was `some(match)`, so a design with two mounts of different
    // headroom could refuse one and keep flying on the other — publishing a confident apogee for a
    // vehicle that cannot be built, which is the exact defect the veto exists to stop.
    //
    // A missing thrust curve and an impossible mount are deliberately treated differently: the first
    // is a hole in Loft and the reduced flight is still a meaningful answer, the second says the
    // ROCKET cannot exist. Asserted here on a two-mount design, because a one-mount design cannot
    // tell the two rules apart.
    const doc = await load("demo-single-deploy.ork");
    const two = structuredClone(doc.rocket);
    const flat = flattenRocket(two);
    const mount = flat.find((p) => "motorMount" in p.component && p.component.motorMount)!.component;
    const host = flat.find((p) => p.component.children.includes(mount))!.component;
    // A second mount with room to spare — wide enough that it survives a narrowing the first does not.
    const roomy = structuredClone(mount) as typeof mount & { innerRadius: number; outerRadius: number };
    roomy.id = `${mount.id}-roomy`;
    roomy.name = "roomy mount";
    roomy.innerRadius = 0.05;
    roomy.outerRadius = 0.052;
    host.children = [...host.children, roomy];
    const cfg = two.configurations[0];
    two.configurations = [
      { ...cfg, instances: [...cfg.instances, { ...cfg.instances[0], mountId: roomy.id }] },
    ];

    const both = runFlight(two, { configId: two.configurations[0].id });
    expect(both.hasPropulsion, "the two-mount control must fly before it is narrowed").toBe(true);

    // Narrow just enough that the tight mount is refused and the roomy one is not.
    const narrowed = runFlight(two, {
      configId: two.configurations[0].id,
      geometry: { bodyDiameter: primaryBodyDiameter(two)! * 0.9 },
    });
    const refused = narrowed.resolutions.filter((r) => r.vetoedBore);
    const kept = narrowed.resolutions.filter((r) => r.match);
    expect(refused.length, "the control does not exercise a PARTIAL refusal").toBeGreaterThan(0);
    expect(kept.length, "the control does not exercise a partial refusal — every mount was refused").toBeGreaterThan(0);
    // And the flight is withheld anyway.
    expect(narrowed.hasPropulsion, "a flight was published for a vehicle that cannot be built").toBe(false);
  }, 120_000);

  it("fires ONLY on a mount that is genuinely too small, not on any edit to the airframe", async () => {
    // The control this guard needs, and the first draft of it was wrong in a way worth recording:
    // it set the body diameter to the motor's own and expected a flight. A body's stated diameter is
    // its OUTER one, so a 29 mm airframe holding a 29 mm motor is exactly the impossible build this
    // refuses — the test was asserting the defect. Corrected to the property that actually matters.
    const doc = await load("demo-single-deploy.ork");
    const motorMm = Math.round(runFromDocument(doc).resolutions[0].match!.entry.curve.diameterMm);

    // Widening the airframe never refuses: the guard must not fire on "an edit happened". Scaled
    // from the DESIGN's own diameter, not from the motor's — `applyGeometryEdits` scales the inner
    // tubes with their host, so "1.2x the motor" is still a large shrink on a design whose airframe
    // is comfortably wider than its mount, and the first draft of this loop failed for that reason
    // rather than because the guard was wrong.
    const designMm = primaryBodyDiameter(doc.rocket)! * 1000;
    for (const scale of [1, 1.2, 2, 4]) {
      const wide = runFromDocument(doc, { geometry: { bodyDiameter: (designMm * scale) / 1000 } });
      expect(wide.hasPropulsion, `a ${(designMm * scale).toFixed(1)} mm airframe refused a ${motorMm} mm motor`).toBe(true);
      expect(wide.resolutions[0].vetoedBore).toBeUndefined();
    }

    // And there is exactly ONE crossing, at a diameter no larger than the motor plus its own wall —
    // a guard that started refusing well above that would be turning honest builds into withheld
    // flights, which is the failure mode that matters more than the Sev-1 it prevents. Real snug
    // builds are covered far more broadly by the corpus sweep, which flies all 35 designs.
    let lastFlown = Infinity;
    let firstRefused = 0;
    for (let mm = Math.ceil(designMm); mm >= 1; mm -= 1) {
      const run = runFromDocument(doc, { geometry: { bodyDiameter: mm / 1000 } });
      if (run.hasPropulsion) lastFlown = mm;
      else if (!firstRefused) firstRefused = mm;
    }
    expect(firstRefused, "nothing was ever refused on the way down").toBeGreaterThan(0);
    expect(lastFlown, "the smallest flying airframe is narrower than its own motor").toBeGreaterThanOrEqual(motorMm);
    expect(firstRefused, "the guard refuses airframes that comfortably hold their motor").toBeLessThan(designMm);
    expect(lastFlown - firstRefused, "the refusal is not a single clean crossing").toBe(1);
  }, 120_000);
});

describe("a motor that does not fit the mount", () => {
  it("is refused, and the panel is told WHY rather than told it was not found", async () => {
    // The Sev-1 a cold walk found: `H999ZZ` on a 29 mm casing matched `H999N` — a 38 mm motor — on a
    // substring, and Loft reported a complete flight off it. This drives the whole path a flyer
    // takes: the design, the refusal, and the sentence the panel gets to explain it.
    const doc = await load("demo-single-deploy.ork");
    const good = runFromDocument(doc);
    expect(good.resolutions[0].match?.quality, "the fixture's own motor must still fly").toBe("exact");
    expect(good.resolutions[0].vetoedFit, "nothing was vetoed on an untouched design").toBeUndefined();
    expect(good.result.summary.apogee).toBeGreaterThan(300);

    // Same design, same 29 mm casing, a designation that only NEARLY names a bundled motor.
    const near: OrkDocument = {
      ...doc,
      rocket: {
        ...doc.rocket,
        configurations: doc.rocket.configurations.map((c) => ({
          ...c,
          instances: c.instances.map((i) => ({ ...i, motor: { ...i.motor, designation: "H999ZZ" } })),
        })),
      },
    };
    const run = runFromDocument(near);
    const res = run.resolutions[0];
    expect(res.match, "a 38 mm motor was placed in a 29 mm mount").toBeNull();
    expect(run.hasPropulsion, "the flight must be withheld, not flown on a substitute").toBe(false);

    // **And the reason has to be the true one.** "not found" is what the panel said before, about a
    // motor it had found and turned down — the wrong explanation beside the right refusal, on the
    // one surface whose whole job is explaining why there is no flight.
    expect(res.vetoedFit).toBeDefined();
    expect(res.vetoedFit!.statedMm).toBe(29);
    expect(res.vetoedFit!.matchedMm).toBe(38);
    expect(res.vetoedFit!.designation).toBe("H999N");
  });

  it("says nothing about fit when the designation reaches nothing at all", async () => {
    // The negative control the sentence needs: a name with no bundled neighbour is a plain
    // not-found, and must NOT be dressed up with a casing comparison there is nothing to compare.
    const doc = await load("demo-single-deploy.ork");
    const nonsense: OrkDocument = {
      ...doc,
      rocket: {
        ...doc.rocket,
        configurations: doc.rocket.configurations.map((c) => ({
          ...c,
          instances: c.instances.map((i) => ({ ...i, motor: { ...i.motor, designation: "MYMOTOR" } })),
        })),
      },
    };
    const res = runFromDocument(nonsense).resolutions[0];
    expect(res.match).toBeNull();
    expect(res.vetoedFit).toBeUndefined();
  });
});

describe("single-deploy fixture flight", () => {
  it("flies plausibly and resolves the motor exactly", async () => {
    const doc = await load("demo-single-deploy.ork");
    const run = runFromDocument(doc);

    expect(run.resolutions[0].match?.quality).toBe("exact");
    const s = run.result.summary;

    // Plausibility (H128W, ~0.9 kg): subsonic, sub-2 km, a few hundred m/s.
    expect(s.apogee).toBeGreaterThan(300);
    expect(s.apogee).toBeLessThan(2000);
    expect(s.maxVelocity).toBeGreaterThan(80);
    expect(s.maxVelocity).toBeLessThan(300);
    expect(s.maxMach).toBeLessThan(0.8); // stays in the validated subsonic envelope
    expect(s.railExitVelocity).toBeGreaterThan(10);
    // Recovery: single chute, a walking-pace-ish descent, lands.
    expect(s.descentRate).toBeGreaterThan(3);
    expect(s.descentRate).toBeLessThan(20);
    expect(s.groundHitVelocity).toBeLessThan(20);
    // Landing energy is ½·m·v² from the descent (burnout) mass and the ground-hit speed — a real
    // positive figure that matches its definition (the recovery-adequacy number fields cite).
    expect(s.landingEnergy).toBeGreaterThan(0);
    expect(s.landingEnergy).toBeCloseTo(0.5 * run.result.burnoutMass * s.groundHitVelocity ** 2, 6);

    // Stability sane and positive.
    expect(run.result.staticMarginCal).toBeGreaterThan(1);
    expect(run.result.stability.cp).toBeGreaterThan(run.result.cgLoaded);

    // A shipped sample states no flight results, so there is nothing to compare against — the
    // panel stays away rather than reporting a difference from numbers nobody computed.
    expect(run.validation).toBeUndefined();
    // The harness itself is covered on a fixture that does carry stored results.
    const withStored = runFromDocument(await load("demo-boattail.ork"));
    expect(withStored.validation).toBeDefined();
    expect(Number.isFinite(withStored.validation!.mape)).toBe(true);
    expect(withStored.validation!.count).toBeGreaterThanOrEqual(3);

    // Regression: the per-sample acceleration must not be dead-zero (it powers the plot).
    const peakSampleAccel = Math.max(...run.result.trajectory.map((s) => Math.abs(s.acceleration)));
    expect(peakSampleAccel).toBeGreaterThan(20); // boost accel is tens of m/s²
  });

  it("the hot-loop scalar mass agrees with the full mass model and tracks propellant burn", async () => {
    // The integrator uses a scalar total-mass path (structure sum + motor mass at t) instead of the
    // full CG/inertia combine, for speed. This pins it to the authoritative model: the heaviest
    // trajectory sample (at liftoff, tanks full) must equal the loaded mass combine() reports, and
    // the mass must fall as propellant burns.
    const doc = await load("demo-single-deploy.ork");
    const run = runFromDocument(doc);
    const masses = run.result.trajectory.map((s) => s.mass);
    const maxMass = Math.max(...masses);
    const minMass = Math.min(...masses);
    expect(maxMass).toBeCloseTo(run.result.liftoffMass, 3); // scalar path == full combine at liftoff
    expect(minMass).toBeLessThan(run.result.liftoffMass); // propellant burns off over the flight
    expect(minMass).toBeGreaterThan(0);
  });
});

describe("rail-exit velocity is resolved at the exact rod-length crossing", () => {
  it("is step-size independent — interpolated, not the overshooting step-end speed", async () => {
    // The off-the-rail velocity is a safety number (fin authority against weathercocking), so an
    // optimistic reading is the wrong error. The crossing is interpolated to the exact rod length,
    // so a coarse fixed step no longer overshoots it: coarse and fine steps now agree (they differed
    // by several percent when the step-end speed was taken raw), and both sit below that raw value.
    const doc = await load("demo-single-deploy.ork");
    const choice = configChoices(doc).find((c) => c.motors.some((m) => m.includes("H128W")))!;
    const cfg = doc.simulations[choice.simIndex].conditions.configId;
    const ov = overridesFromStored(doc.simulations[choice.simIndex]);
    const at = (dt: number) =>
      runFlight(doc.rocket, { configId: cfg, overrides: ov, ballistic: true, timeStep: dt }).result
        .summary.railExitVelocity;
    const coarse = at(0.01); // the production step
    const fine = at(0.001);
    expect(fine).toBeGreaterThan(10);
    expect(Math.abs(coarse - fine) / fine).toBeLessThan(0.01); // within 1% (was ~6% uninterpolated)
  });
});

describe("nose ballast (what-if trim)", () => {
  it("adds nose weight: heavier by the ballast, CG forward, more stable, lower apogee", async () => {
    const doc = await load("demo-single-deploy.ork");
    const choice = configChoices(doc).find((c) => c.motors.some((m) => m.includes("H128W")))!;
    const cfg = doc.simulations[choice.simIndex].conditions.configId;
    const ov = overridesFromStored(doc.simulations[choice.simIndex]);
    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const ballasted = runFlight(doc.rocket, { configId: cfg, overrides: ov, ballastKg: 0.1 }); // +100 g

    // Heavier by exactly the added ballast.
    expect(ballasted.result.liftoffMass - base.result.liftoffMass).toBeCloseTo(0.1, 6);
    // CG moves forward (a smaller station is nearer the nose tip).
    expect(ballasted.result.cgDry).toBeLessThan(base.result.cgDry);
    // Nose weight is stabilising, and the heavier rocket doesn't fly as high.
    expect(ballasted.result.staticMarginCal).toBeGreaterThan(base.result.staticMarginCal);
    expect(ballasted.result.summary.apogee).toBeLessThan(base.result.summary.apogee);
    // Zero ballast changes nothing.
    const zero = runFlight(doc.rocket, { configId: cfg, overrides: ov, ballastKg: 0 });
    expect(zero.result.liftoffMass).toBeCloseTo(base.result.liftoffMass, 9);
  });
});

describe("motor swap (what-if)", () => {
  it("flies the design on a different bundled motor and resolves it", async () => {
    const doc = await load("demo-single-deploy.ork");
    const choice = configChoices(doc).find((c) => c.motors.some((m) => m.includes("H128W")))!;
    const cfg = doc.simulations[choice.simIndex].conditions.configId;
    const ov = overridesFromStored(doc.simulations[choice.simIndex]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const baseDesig = base.resolutions[0].match!.entry.curve.designation;
    const baseDiaMm = base.resolutions[0].match!.entry.curve.diameterMm;

    // Pick a bundled motor of the same casing diameter (so it fits the mount) but a different one.
    const alt = allMotors().find(
      (m) => Math.round(m.curve.diameterMm) === Math.round(baseDiaMm) && m.curve.designation !== baseDesig,
    );
    expect(alt, "a second bundled motor of the same diameter exists").toBeDefined();

    const swapped = runFlight(doc.rocket, {
      configId: cfg,
      overrides: ov,
      motorSwap: {
        manufacturer: alt!.curve.manufacturer,
        designation: alt!.curve.designation,
        diameter: alt!.curve.diameterMm / 1000,
      },
    });
    // It flew the chosen motor and produced a different (still finite, positive) apogee.
    expect(swapped.resolutions[0].match!.entry.curve.designation).toBe(alt!.curve.designation);
    expect(swapped.result.summary.apogee).toBeGreaterThan(0);
    expect(Math.abs(swapped.result.summary.apogee - base.result.summary.apogee)).toBeGreaterThan(1);

    // No swap flies the design's own motor.
    const unchanged = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    expect(unchanged.resolutions[0].match!.entry.curve.designation).toBe(baseDesig);
  });
});

describe("geometry edits (builder)", () => {
  it("bigger fins move the CP aft and raise the static margin", async () => {
    const doc = await load("demo-single-deploy.ork");
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const baseSpan = primaryFinSpan(doc.rocket)!;
    expect(baseSpan).toBeGreaterThan(0);

    const bigger = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finSpan: baseSpan * 1.5 } });
    // Larger fins → centre of pressure moves aft → the static margin grows (more stable).
    expect(bigger.result.stability.cp).toBeGreaterThan(base.result.stability.cp);
    expect(bigger.result.staticMarginCal).toBeGreaterThan(base.result.staticMarginCal);
    // Still a finite, sane flight.
    expect(Number.isFinite(bigger.result.summary.apogee)).toBe(true);
    expect(bigger.result.summary.apogee).toBeGreaterThan(0);

    // No/empty geometry edit changes nothing.
    const same = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finSpan: 0 } });
    expect(same.result.staticMarginCal).toBeCloseTo(base.result.staticMarginCal, 9);
  });

  it("a stiffer fin material raises the flutter margin (and a denser one adds mass)", async () => {
    const doc = await load("demo-single-deploy.ork");
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);
    const fly = (finMaterial: string) => runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finMaterial } }).result;
    const balsa = fly("balsa");
    const g10 = fly("g10");
    // Shear modulus climbs balsa → G10, so the flutter margin does too (the actionable flutter fix).
    expect(g10.flutter!.worst.margin).toBeGreaterThan(balsa.flutter!.worst.margin);
    // The flutter estimate resolves each stock by name, not the default.
    expect(g10.flutter!.worst.material).toMatch(/G10/i);
    // Denser G10 fins mass more than balsa, so the loaded mass rises.
    expect(g10.liftoffMass).toBeGreaterThan(balsa.liftoffMass);
  });

  it("cleaner fin edges cut drag, so airfoil flies higher than rounded than square", async () => {
    const doc = await load("demo-single-deploy.ork");
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);
    const apogee = (finCrossSection: "square" | "rounded" | "airfoil") =>
      runFlight(doc.rocket, { configId: cfg, overrides: ov, ballistic: true, geometry: { finCrossSection } }).result.summary.apogee;
    const square = apogee("square");
    const rounded = apogee("rounded");
    const airfoil = apogee("airfoil");
    // Square edges stagnate the flow (most fin pressure drag); an airfoil is streamlined (least).
    expect(rounded).toBeGreaterThan(square);
    expect(airfoil).toBeGreaterThan(rounded);
    // The edit only touches the fin drag, not the stability geometry.
    const sq = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finCrossSection: "square" } });
    const af = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finCrossSection: "airfoil" } });
    expect(af.result.staticMarginCal).toBeCloseTo(sq.result.staticMarginCal, 9);
  });

  it("more fins raise CNα, move the CP aft, and raise the static margin", async () => {
    const doc = await load("demo-single-deploy.ork");
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const n = primaryFinCount(doc.rocket)!;
    expect(n).toBeGreaterThanOrEqual(3);

    // Adding fins adds normal-force-generating surface aft of the CG, so the fin set's CNα rises,
    // the whole-rocket CP moves aft, and the static margin grows (more stable).
    const more = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finCount: n + 2 } });
    expect(more.result.stability.cnAlpha).toBeGreaterThan(base.result.stability.cnAlpha);
    expect(more.result.stability.cp).toBeGreaterThan(base.result.stability.cp);
    expect(more.result.staticMarginCal).toBeGreaterThan(base.result.staticMarginCal);
    // Still a finite, sane flight.
    expect(more.result.summary.apogee).toBeGreaterThan(0);

    // Fewer fins do the opposite — the CP moves forward and the margin shrinks.
    const fewer = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finCount: n - 1 } });
    expect(fewer.result.stability.cp).toBeLessThan(base.result.stability.cp);
    expect(fewer.result.staticMarginCal).toBeLessThan(base.result.staticMarginCal);
  });

  it("wider fin chords add planform area and drag, lowering apogee and shifting stability", async () => {
    const doc = await load("demo-single-deploy.ork");
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const root = primaryFinRootChord(doc.rocket)!;
    const tip = primaryFinTipChord(doc.rocket)!;
    expect(root).toBeGreaterThan(0);

    // A bigger root chord is more fin planform — more drag, so a lower apogee — and it measurably
    // moves the centre of pressure (the reshape takes effect through the aero, not just the mass).
    const biggerRoot = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finRootChord: root * 1.6 } });
    expect(biggerRoot.result.summary.apogee).toBeLessThan(base.result.summary.apogee);
    expect(biggerRoot.result.summary.apogee).toBeGreaterThan(0);
    expect(Math.abs(biggerRoot.result.stability.cp - base.result.stability.cp)).toBeGreaterThan(0.005);

    // A bigger tip chord likewise adds area and drag → lower apogee, still a finite, sane flight.
    const biggerTip = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finTipChord: tip * 2 } });
    expect(biggerTip.result.summary.apogee).toBeLessThan(base.result.summary.apogee);
    expect(Number.isFinite(biggerTip.result.staticMarginCal)).toBe(true);

    // A chord edit on an elliptical-fin design (no trapezoid) is a no-op — same flight.
    const ell = await load("demo-boattail.ork");
    const ecfg = ell.simulations[0].conditions.configId;
    const eov = overridesFromStored(ell.simulations[0]);
    const ellBase = runFlight(ell.rocket, { configId: ecfg, overrides: eov });
    const ellEdited = runFlight(ell.rocket, { configId: ecfg, overrides: eov, geometry: { finRootChord: 0.2 } });
    expect(ellEdited.result.summary.apogee).toBeCloseTo(ellBase.result.summary.apogee, 6);
  });

  it("sweeping the fins back moves the CP aft and raises the static margin", async () => {
    const doc = await load("demo-single-deploy.ork");
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const sweep0 = primaryFinSweep(doc.rocket)!;
    expect(sweep0).toBeGreaterThanOrEqual(0);

    // Sweeping the fin's leading edge aft carries the fin's own centre of pressure aft (the mean
    // aerodynamic chord's quarter-chord point moves back), so the whole-rocket CP moves aft and the
    // static margin grows — without adding any planform area.
    const swept = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finSweepLength: sweep0 + 0.05 } });
    expect(swept.result.stability.cp).toBeGreaterThan(base.result.stability.cp);
    expect(swept.result.staticMarginCal).toBeGreaterThan(base.result.staticMarginCal);
    expect(swept.result.summary.apogee).toBeGreaterThan(0);

    // Squaring the leading edge (zero sweep) does the opposite — CP forward, margin shrinks.
    const unswept = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finSweepLength: 0 } });
    expect(unswept.result.stability.cp).toBeLessThan(base.result.stability.cp);
    expect(unswept.result.staticMarginCal).toBeLessThan(base.result.staticMarginCal);

    // A sweep edit on an elliptical-fin design (no trapezoid) is a no-op — same flight.
    const ell = await load("demo-boattail.ork");
    const ecfg = ell.simulations[0].conditions.configId;
    const eov = overridesFromStored(ell.simulations[0]);
    const ellBase = runFlight(ell.rocket, { configId: ecfg, overrides: eov });
    const ellEdited = runFlight(ell.rocket, { configId: ecfg, overrides: eov, geometry: { finSweepLength: 0.05 } });
    expect(ellEdited.result.summary.apogee).toBeCloseTo(ellBase.result.summary.apogee, 6);
  });

  it("thicker fins raise the flutter margin but drag more and fly lower", async () => {
    const doc = await load("demo-dual-deploy.ork"); // a fast, transonic flight — flutter matters
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const t0 = primaryFinThickness(doc.rocket)!;
    expect(t0).toBeGreaterThan(0);
    expect(base.result.flutter).toBeDefined();

    // Thicker fins are stiffer (flutter speed ∝ (t/c)^1.5, so the margin climbs) but present more
    // frontal area and a bigger form factor — more drag, so a lower apogee.
    const thick = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finThickness: t0 * 2 } });
    expect(thick.result.flutter!.worst.margin).toBeGreaterThan(base.result.flutter!.worst.margin);
    expect(thick.result.summary.apogee).toBeLessThan(base.result.summary.apogee);

    // Thinner fins do the opposite — the flutter margin drops (and here crosses into a warning).
    const thin = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finThickness: t0 * 0.5 } });
    expect(thin.result.flutter!.worst.margin).toBeLessThan(base.result.flutter!.worst.margin);
    expect(thin.result.summary.apogee).toBeGreaterThan(base.result.summary.apogee);

    // A zero/empty thickness edit changes nothing.
    const same = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finThickness: 0 } });
    expect(same.result.summary.apogee).toBeCloseTo(base.result.summary.apogee, 6);
  });

  it("fin thickness applies to an elliptical-fin design too (drag changes, flight stays sane)", async () => {
    const doc = await load("demo-boattail.ork"); // elliptical fins
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const t0 = primaryFinThickness(doc.rocket)!;
    expect(t0).toBeGreaterThan(0);

    // Unlike a chord edit (a no-op on an elliptical set), a thickness edit takes effect: thicker
    // fins drag more and fly lower, and the flutter margin rises.
    const thick = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finThickness: t0 * 2 } });
    expect(thick.result.summary.apogee).toBeLessThan(base.result.summary.apogee);
    expect(thick.result.flutter!.worst.margin).toBeGreaterThan(base.result.flutter!.worst.margin);
    expect(Number.isFinite(thick.result.summary.apogee)).toBe(true);
  });

  it("a rougher surface finish drags more and flies lower; a smoother one flies higher", async () => {
    const doc = await load("demo-single-deploy.ork");
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const rough = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finish: "rough" } });
    const polished = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { finish: "polished" } });

    // Skin friction dominates subsonic drag: a rough skin lowers apogee, a polished one raises it,
    // and the effect is monotonic through the design's own finish in between.
    expect(rough.result.summary.apogee).toBeLessThan(base.result.summary.apogee);
    expect(polished.result.summary.apogee).toBeGreaterThan(base.result.summary.apogee);
    expect(polished.result.summary.apogee).toBeGreaterThan(rough.result.summary.apogee);
    // Stability is unchanged by finish (drag only, no geometry shift).
    expect(rough.result.staticMarginCal).toBeCloseTo(base.result.staticMarginCal, 6);
  });

  it("a longer body tube stretches the airframe and adds mass", async () => {
    const doc = await load("demo-single-deploy.ork");
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const bodyLen = primaryBodyTube(doc.rocket)!.length;
    expect(bodyLen).toBeGreaterThan(0);

    const stretched = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { bodyLength: bodyLen * 1.4 } });
    // A longer main tube is heavier (more material) and a finite, sane flight.
    expect(stretched.result.liftoffMass).toBeGreaterThan(base.result.liftoffMass);
    expect(stretched.result.summary.apogee).toBeGreaterThan(0);
    expect(Number.isFinite(stretched.result.staticMarginCal)).toBe(true);
  });

  it("a wider airframe drags and weighs more (lower apogee) and is less stable in calibers", async () => {
    const doc = await load("demo-single-deploy.ork");
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const d0 = primaryBodyDiameter(doc.rocket)!;
    expect(d0).toBeGreaterThan(0);

    // Same design in a wider tube: the reference diameter follows the target exactly (the internal
    // rings scale too, so nothing internal is left as the widest part), the bigger frontal area
    // drags more and the extra tube material weighs more — so it flies lower — and the fixed fins
    // are proportionally smaller, so the static margin (in calibers) drops.
    const wider = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { bodyDiameter: d0 * 1.4 } });
    expect(wider.result.stability.refRadius * 2).toBeCloseTo(d0 * 1.4, 6);
    expect(wider.result.summary.apogee).toBeLessThan(base.result.summary.apogee);
    expect(wider.result.liftoffMass).toBeGreaterThan(base.result.liftoffMass);
    expect(wider.result.staticMarginCal).toBeLessThan(base.result.staticMarginCal);

    // A narrower tube does the opposite — higher, lighter, more stable in calibers. **Asserted on a
    // different fixture, and the reason is a measurement rather than convenience.** This one used
    // `demo-single-deploy` at 0.75x, and that design cannot be narrowed AT ALL: its mount bore is
    // 28.0 mm around a 29 mm H128W, so the file already sits inside the millimetre of slack the
    // mount-bore veto allows, and shrinking the airframe takes the mount with it. Five of the six
    // committed fixtures are that shape — a motor mount sized to its motor is what a real design IS
    // — so the physics claim has to be made where there is headroom to make it.
    // `demo-quirks.ork` has 10%: a 66 mm airframe on a motor small enough to leave room.
    const roomy = await load("demo-quirks.ork");
    const roomyCfg = roomy.simulations[0].conditions.configId;
    const roomyOv = overridesFromStored(roomy.simulations[0]);
    const roomyBase = runFlight(roomy.rocket, { configId: roomyCfg, overrides: roomyOv });
    const rd0 = primaryBodyDiameter(roomy.rocket)!;
    const narrower = runFlight(roomy.rocket, { configId: roomyCfg, overrides: roomyOv, geometry: { bodyDiameter: rd0 * 0.9 } });
    expect(narrower.resolutions.every((r) => r.match), "the narrowed design must still hold its motor").toBe(true);
    expect(narrower.result.stability.refRadius * 2).toBeCloseTo(rd0 * 0.9, 6);
    expect(narrower.result.summary.apogee).toBeGreaterThan(roomyBase.result.summary.apogee);
    expect(narrower.result.staticMarginCal).toBeGreaterThan(roomyBase.result.staticMarginCal);

    // And the half that used to live here is now a REFUSAL rather than a flight, which is the point
    // of the veto: narrowing this design's airframe below its own motor is not a what-if with a
    // smaller answer, it is a rocket that cannot be built.
    const tooTight = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { bodyDiameter: d0 * 0.75 } });
    expect(tooTight.hasPropulsion).toBe(false);
    expect(tooTight.resolutions[0].vetoedBore?.motorMm).toBe(29);

    // A zero/empty diameter edit changes nothing.
    const same = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { bodyDiameter: 0 } });
    expect(same.result.summary.apogee).toBeCloseTo(base.result.summary.apogee, 6);
  });

  it("a longer nose cone adds nose material and re-flies sanely", async () => {
    const doc = await load("demo-single-deploy.ork");
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const noseLen = primaryNose(doc.rocket)!.length;
    expect(noseLen).toBeGreaterThan(0);

    // A longer nose cone has more surface (more material), so it's heavier; the flight stays finite
    // and sane, and the edit measurably changes the trajectory.
    const pointier = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { noseLength: noseLen * 2 } });
    expect(pointier.result.liftoffMass).toBeGreaterThan(base.result.liftoffMass);
    expect(pointier.result.summary.apogee).toBeGreaterThan(0);
    expect(Math.abs(pointier.result.summary.apogee - base.result.summary.apogee)).toBeGreaterThan(0.5);
    expect(Number.isFinite(pointier.result.staticMarginCal)).toBe(true);
  });

  it("the nose contour changes the drag: a blunt nose flies lower than a fine one", async () => {
    const doc = await load("demo-single-deploy.ork"); // subsonic — skin friction and nose pressure
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);
    expect(primaryNoseShape(doc.rocket)).toBeTruthy();

    const conical = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { noseShape: "conical" } });
    const ellipsoid = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { noseShape: "ellipsoid" } });
    // Subsonic, a fine conical nose has less wetted area (less skin friction) than a blunt
    // ellipsoid, so it flies higher; both are finite, sane flights.
    expect(conical.result.summary.apogee).toBeGreaterThan(ellipsoid.result.summary.apogee);
    expect(ellipsoid.result.summary.apogee).toBeGreaterThan(0);

    // Re-selecting the design's own shape (an ogive here, which ignores the shape parameter) leaves
    // the flight unchanged — a no-op edit.
    const base = runFlight(doc.rocket, { configId: cfg, overrides: ov });
    const same = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { noseShape: primaryNoseShape(doc.rocket) } });
    expect(same.result.summary.apogee).toBeCloseTo(base.result.summary.apogee, 6);
  });

  it("a Von Kármán (Haack) nose cuts transonic wave drag below a conical one", async () => {
    const doc = await load("demo-dual-deploy.ork"); // transonic — wave drag separates the shapes
    const cfg = doc.simulations[0].conditions.configId;
    const ov = overridesFromStored(doc.simulations[0]);

    const haack = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { noseShape: "haack" } });
    const conical = runFlight(doc.rocket, { configId: cfg, overrides: ov, geometry: { noseShape: "conical" } });
    // Through the transonic peak, the minimum-wave-drag Von Kármán nose reaches higher than the
    // blunter-shouldered conical one.
    expect(haack.result.summary.maxMach).toBeGreaterThan(1);
    expect(haack.result.summary.apogee).toBeGreaterThan(conical.result.summary.apogee);
  });
});

describe("payload-separation fixture flight", () => {
  it("separates at the booster's ejection charge and recovers the payload on that separation", async () => {
    const doc = await load("demo-payload-separation.ork");
    expect(doc.rocket.stages[1].separationEvent).toBe("ejection");
    const run = runFromDocument(doc);

    const events = run.result.events;
    const burnout = events.find((e) => e.type === "burnout")!;
    const apogee = events.find((e) => e.type === "apogee")!;
    const separation = events.find((e) => e.type === "separation")!;
    const deploy = events.find((e) => e.type === "deploy")!;
    expect(separation).toBeDefined();
    expect(deploy).toBeDefined();

    // The booster hangs on well past burnout — until its ejection charge (an 8 s delay), which
    // falls just after apogee — rather than dropping at burnout.
    expect(separation.time).toBeGreaterThan(burnout.time + 4);
    expect(separation.time).toBeGreaterThan(apogee.time);
    // The payload's parachute opens on that lower-stage separation — detected at the first descent
    // step past the separation instant, so within one such step (≤ the descent-step ceiling).
    expect(Math.abs(deploy.time - separation.time)).toBeLessThanOrEqual(0.12);
    // …so it comes in under canopy, NOT ballistic (the bug this whole path guards against).
    expect(run.result.summary.descentRate).toBeLessThan(10);
    expect(run.result.warnings.some((w) => w.code === "ballistic-descent")).toBe(false);

    // A complete, un-reduced flight, so its stored-figure comparison is shown and lands close.
    expect(doc.flownAsReduced).toBe(false);
    expect(run.validation!.mape).toBeLessThan(15);
  });
});

describe("recovery-size what-if", () => {
  it("a bigger canopy descends slower and lands softer; a smaller one the reverse; ascent unchanged", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const fly = (recoveryCdScale?: number) =>
      runFlight(doc.rocket, {
        configId: sim.conditions.configId,
        overrides: { ...overridesFromStored(sim), windSpeed: 5 },
        recoveryCdScale,
      }).result.summary;
    const base = fly();
    const big = fly(2); // double the deployed drag area
    const small = fly(0.5);

    // Descent rate and ground-hit speed fall under a bigger canopy, rise under a smaller one.
    expect(big.descentRate).toBeLessThan(base.descentRate);
    expect(small.descentRate).toBeGreaterThan(base.descentRate);
    expect(big.groundHitVelocity).toBeLessThan(base.groundHitVelocity);
    // A slower descent rides the wind longer, so it drifts farther from the pad.
    expect(big.driftDistance).toBeGreaterThan(base.driftDistance);
    // The recovery size touches only the descent — the ascent (apogee) is unchanged.
    expect(big.apogee).toBeCloseTo(base.apogee, 3);
  }, 20000);
});

describe("unresolvable motor", () => {
  it("reports no propulsion and withholds the validation comparison", async () => {
    const doc = await load("demo-single-deploy.ork");
    // Point every motor instance at a designation the bundled database can't match, so the
    // resolver returns null and the flight has no thrust — the case a real file hits when its
    // motor isn't in the curated subset.
    for (const cfg of doc.rocket.configurations) {
      for (const inst of cfg.instances) {
        inst.motor.manufacturer = "NoSuchMaker";
        inst.motor.designation = "ZZ9999XX";
      }
    }
    const run = runFromDocument(doc);

    // The resolution is honestly reported as a miss, and the run flags itself as unflyable.
    expect(run.resolutions.length).toBeGreaterThan(0);
    expect(run.resolutions.every((r) => r.match === null)).toBe(true);
    expect(run.hasPropulsion).toBe(false);
    expect(run.result.warnings.some((w) => w.code === "no-motor")).toBe(true);

    // No bogus −100% comparison is produced even though the file carries stored results.
    expect(run.validation).toBeUndefined();

    // The degenerate "flight" never leaves the pad — which is exactly why its numbers are hidden.
    expect(run.result.summary.apogee).toBeLessThan(1);
  });
});

describe("partial motor cluster", () => {
  it("flies on the resolved motor but flags the under-counted thrust", async () => {
    const doc = await load("demo-single-deploy.ork");
    // Turn the single-motor design into a two-motor cluster where the second motor can't be
    // resolved: the flight still has thrust (so it flies), but on less than the design calls
    // for — the case that otherwise reads as an ordinary, complete flight.
    for (const cfg of doc.rocket.configurations) {
      if (cfg.instances.length === 0) continue;
      const base = cfg.instances[0];
      cfg.instances.push({
        ...base,
        motor: { ...base.motor, manufacturer: "NoSuchMaker", designation: "ZZ9999XX" },
      });
    }
    const run = runFromDocument(doc);

    // One resolved, one missing — a genuine partial cluster.
    expect(run.resolutions.some((r) => r.match !== null)).toBe(true);
    expect(run.resolutions.some((r) => r.match === null)).toBe(true);
    expect(run.hasPropulsion).toBe(true);

    // Flagged as a partial cluster, not as "no motor", and the flight still ran.
    expect(run.result.warnings.some((w) => w.code === "partial-cluster")).toBe(true);
    expect(run.result.warnings.some((w) => w.code === "no-motor")).toBe(false);
    expect(run.result.summary.apogee).toBeGreaterThan(0);
  });
});

describe("recovery deploy delay", () => {
  const setDelay = (doc: OrkDocument, delay: number) => {
    for (const p of flattenRocket(doc.rocket)) {
      if (p.component.kind === "parachute" || p.component.kind === "streamer") {
        p.component.deployDelay = delay;
      }
    }
  };

  it("free-falls on body drag until the canopy opens, then reports the higher deploy speed", async () => {
    const immediate = await load("demo-single-deploy.ork");
    setDelay(immediate, 0);
    const runNow = runFromDocument(immediate);

    const delayed = await load("demo-single-deploy.ork");
    setDelay(delayed, 6);
    const runDelayed = runFromDocument(delayed);

    // Same vehicle, same ascent, same apogee — only the recovery delay differs.
    expect(runDelayed.result.summary.apogee).toBeCloseTo(runNow.result.summary.apogee, 0);

    // With a 6 s delay the vehicle free-falls before the canopy opens, so the deployment
    // velocity is far higher than an immediate deploy near apogee. Before the fix the delay
    // was ignored (the canopy dragged from the charge instant) and these were equal.
    expect(runDelayed.result.summary.deploymentVelocity).toBeGreaterThan(
      runNow.result.summary.deploymentVelocity + 20,
    );

    // The deploy marker lands ~6 s after apogee (within a couple of integration steps).
    const apo = runDelayed.result.events.find((e) => e.type === "apogee")!;
    const dep = runDelayed.result.events.find((e) => e.type === "deploy")!;
    expect(dep.time - apo.time).toBeGreaterThan(5.5);
    expect(dep.time - apo.time).toBeLessThan(6.5);
  });
});

describe("dual-deploy reports the worst-case (main) deployment velocity", () => {
  it("takes the faster main deploy, not the near-zero drogue at apogee", async () => {
    const doc = await load("demo-dual-deploy.ork");
    const run = runFromDocument(doc);
    // The fixture is a true dual-deploy: a drogue at apogee (near-stationary) and a main at a set
    // altitude on the way down (faster, under drogue). There should be two deploy events.
    const deploys = run.result.events.filter((e) => e.type === "deploy");
    expect(deploys.length).toBe(2);
    const [drogue, main] = deploys;
    // Drogue opens at (or just past) apogee, almost stationary; the main opens later and faster.
    expect(main.velocity).toBeGreaterThan(drogue.velocity + 5);
    // The reported deployment velocity is the worst-case opening speed — the MAIN's, not the
    // drogue's near-zero. Before the fix this reported the first (drogue) deploy and so read ~0,
    // which also meant the fast-deployment warning could never fire on a hard main deployment.
    expect(run.result.summary.deploymentVelocity).toBeCloseTo(main.velocity, 5);
    expect(run.result.summary.deploymentVelocity).toBeGreaterThan(drogue.velocity);
  });

  it("reports the under-drogue descent rate as a distinct, faster phase than the main", async () => {
    const doc = await load("demo-dual-deploy.ork");
    const s = runFromDocument(doc).result.summary;
    // The fast phase under the drogue is reported separately and is genuinely faster than the final
    // (main) descent — it's what sets the drift before main deployment and the main's opening shock.
    expect(s.drogueDescentRate).toBeDefined();
    expect(s.drogueDescentRate!).toBeGreaterThan(s.descentRate * 1.3);
  });

  it("reports no under-drogue rate for a single-deploy flight", async () => {
    const doc = await load("demo-single-deploy.ork");
    const s = runFromDocument(doc).result.summary;
    // One canopy at apogee: there's a single descent rate, so no distinct fast phase to report.
    expect(s.drogueDescentRate).toBeUndefined();
  });
});

describe("multi-configuration selection", () => {
  it("offers each stored simulation as a labelled configuration choice", async () => {
    const doc = await load("demo-multi-config.ork");
    const choices = configChoices(doc);
    expect(choices).toHaveLength(2);
    expect(choices[0].motors).toEqual(["H128W"]);
    expect(choices[1].motors).toEqual(["G40W"]);
    // A shipped sample states no results, so a choice carries none to label itself with — the
    // picker falls back to the motor, which is what it shows for any design without stored numbers.
    expect(choices[0].storedApogeeM).toBeUndefined();
    expect(choices[1].storedApogeeM).toBeUndefined();
  });

  it("flies the chosen configuration's motor and compares to its own stored results", async () => {
    const doc = await load("demo-multi-config.ork");
    const forSim = (i: number) =>
      runFromDocument(doc, {
        configId: doc.simulations[i].conditions.configId,
        validateAgainst: doc.simulations[i],
      });
    const h = forSim(0);
    const g = forSim(1);
    expect(h.resolutions[0].match?.entry.curve.designation).toBe("H128W");
    expect(g.resolutions[0].match?.entry.curve.designation).toBe("G40W");
    // The larger motor flies higher, and each is compared against its own stored numbers.
    expect(h.result.summary.apogee).toBeGreaterThan(g.result.summary.apogee);
    expect(doc.flownAsReduced).toBe(false);
  });
});

describe("motor cluster simulation", () => {
  it("flies a cluster on more thrust and mass than a single motor", async () => {
    const single = await load("demo-single-deploy.ork");
    const singleRun = runFromDocument(single);

    const clustered = await load("demo-single-deploy.ork");
    for (const p of flattenRocket(clustered.rocket)) {
      const c = p.component;
      if ("motorMount" in c && c.motorMount) c.motorMount.clusterCount = 3;
    }
    const run = runFromDocument(clustered);

    // Three identical motors fire: the resolution records the count, and liftoff mass rises
    // (two extra loaded motors plus the tripled motor-tube mass).
    expect(run.resolutions[0].count).toBe(3);
    expect(run.result.liftoffMass).toBeGreaterThan(singleRun.result.liftoffMass);
    // 3× total impulse for only a little more mass ⇒ a higher, finite, plausible apogee.
    expect(run.result.summary.apogee).toBeGreaterThan(singleRun.result.summary.apogee);
    expect(Number.isFinite(run.result.summary.apogee)).toBe(true);
    // A cluster is simulated, not simplified, so the comparison isn't withheld.
    expect(clustered.flownAsReduced).toBe(false);
  });
});

describe("validation withheld for a simplified vehicle", () => {
  it("compares a complete design but withholds it when the flown vehicle is reduced", async () => {
    // demo-boattail is a test-only fixture that still carries stored results; the shipped samples
    // deliberately carry none, so they have nothing to compare in the first place.
    const doc = await load("demo-boattail.ork");
    // Complete single-stage design ⇒ flown whole ⇒ the stored-results comparison runs.
    expect(doc.flownAsReduced).toBe(false);
    expect(runFromDocument(doc).validation).toBeDefined();
    // A staged / pod / parallel / clustered design imports with this flag set; Loft then flew a
    // different vehicle than the stored results describe, so the comparison must be withheld.
    (doc as { flownAsReduced: boolean }).flownAsReduced = true;
    expect(runFromDocument(doc).validation).toBeUndefined();
  });
});

describe("ejection-charge deployment timing", () => {
  const setEjection = (doc: OrkDocument, motorDelay: number) => {
    for (const p of flattenRocket(doc.rocket)) {
      if (p.component.kind === "parachute") p.component.deployEvent = "ejection";
    }
    for (const cfg of doc.rocket.configurations) {
      for (const inst of cfg.instances) inst.motor.delay = motorDelay;
    }
  };

  it("fires at the motor's ejection charge — a too-short delay deploys before apogee", async () => {
    const doc = await load("demo-single-deploy.ork");
    setEjection(doc, 1); // 1 s after burnout — well before this rocket's natural apogee
    const run = runFromDocument(doc);
    const apogee = run.result.events.find((e) => e.type === "apogee")!;
    const deploy = run.result.events.find((e) => e.type === "deploy")!;
    expect(deploy.time).toBeLessThan(apogee.time); // opened while still ascending
    expect(run.result.warnings.some((w) => w.code === "early-deployment")).toBe(true);
  });

  it("deploys after apogee for a long delay — timing tracks the charge, not apogee", async () => {
    const short = await load("demo-single-deploy.ork");
    setEjection(short, 1);
    const shortDeploy = runFromDocument(short).result.events.find((e) => e.type === "deploy")!;

    const long = await load("demo-single-deploy.ork");
    setEjection(long, 20); // fires well after apogee
    const longRun = runFromDocument(long);
    const apogee = longRun.result.events.find((e) => e.type === "apogee")!;
    const deploy = longRun.result.events.find((e) => e.type === "deploy")!;
    expect(deploy.time).toBeGreaterThan(apogee.time); // opened while descending
    expect(longRun.result.warnings.some((w) => w.code === "early-deployment")).toBe(false);
    // Same rocket, different delay ⇒ different deploy time: timing is the charge, not apogee.
    expect(Math.abs(shortDeploy.time - deploy.time)).toBeGreaterThan(2);
    // Still recovers under canopy despite the free-fall before it opens.
    expect(longRun.result.summary.groundHitVelocity).toBeLessThan(15);
  });

  it("flags a ballistic descent when the charge would fire after the rocket is already down", async () => {
    const doc = await load("demo-single-deploy.ork");
    setEjection(doc, 60); // far longer than the whole flight
    const run = runFromDocument(doc);
    expect(run.result.events.some((e) => e.type === "deploy")).toBe(false);
    expect(run.result.warnings.some((w) => w.code === "ballistic-descent")).toBe(true);
    expect(run.result.summary.groundHitVelocity).toBeGreaterThan(50); // comes in ballistic
  });

  it("a plugged motor opens nothing — a charge-triggered canopy stays packed", async () => {
    // A plugged motor carries no ejection charge. A recovery device waiting on that charge has
    // nothing to open it, so the flight is ballistic — and saying so is the point. Falling back
    // to apogee (what an UNSTATED delay does) would invent a gentle descent the design can't fly.
    const doc = await load("demo-single-deploy.ork");
    setEjection(doc, NaN);
    for (const cfg of doc.rocket.configurations) {
      for (const inst of cfg.instances) {
        inst.motor.delay = undefined;
        inst.motor.plugged = true;
      }
    }
    const run = runFromDocument(doc);
    expect(run.result.events.some((e) => e.type === "deploy")).toBe(false);
    const ballistic = run.result.warnings.find((w) => w.code === "ballistic-descent");
    expect(ballistic?.message).toMatch(/plugged/);
    expect(run.result.summary.groundHitVelocity).toBeGreaterThan(50);
  });

  it("an unstated delay still falls back to apogee", async () => {
    // The generous read stays for a design that simply never pinned a delay: unlike "plugged",
    // that is silence, not a statement that nothing fires.
    const doc = await load("demo-single-deploy.ork");
    setEjection(doc, NaN);
    for (const cfg of doc.rocket.configurations) {
      for (const inst of cfg.instances) inst.motor.delay = undefined;
    }
    const run = runFromDocument(doc);
    const apogee = run.result.events.find((e) => e.type === "apogee")!;
    const deploy = run.result.events.find((e) => e.type === "deploy")!;
    expect(deploy.time).toBeCloseTo(apogee.time, 1);
    expect(run.result.warnings.some((w) => w.code === "ballistic-descent")).toBe(false);
  });

  it("reports a recovery-independent optimum delay even when the flown delay opens early", async () => {
    // The optimum ejection delay is the delay that deploys AT apogee — a property of the rocket,
    // motor, and conditions, not of the (possibly wrong) delay actually flown. A too-short delay
    // opens the canopy before apogee and truncates the coast; the recommended optimum must not be
    // dragged down with it (that would advise an even shorter delay, compounding the mistake).
    const early = await load("demo-single-deploy.ork");
    setEjection(early, 1); // too short — deploys while ascending
    const earlyRun = runFromDocument(early);
    expect(earlyRun.result.deployedBeforeApogee).toBe(true);

    const late = await load("demo-single-deploy.ork");
    setEjection(late, 20); // deploys after apogee — coast runs to the true top
    const lateRun = runFromDocument(late);
    expect(lateRun.result.deployedBeforeApogee).toBe(false);

    // Same airframe + motor ⇒ same optimum delay regardless of the delay flown (within a step).
    expect(earlyRun.result.summary.optimumDelay).toBeGreaterThan(0);
    expect(earlyRun.result.summary.optimumDelay).toBeCloseTo(lateRun.result.summary.optimumDelay, 1);
  });
});

describe("dual-deploy fixture flight", () => {
  it("deploys a drogue at apogee and a main at altitude", async () => {
    const doc = await load("demo-dual-deploy.ork");
    const run = runFromDocument(doc);

    expect(run.resolutions[0].match?.quality).toBe("exact");
    const deploys = run.result.events.filter((e) => e.type === "deploy");
    expect(deploys.length).toBe(2);

    const s = run.result.summary;
    expect(s.apogee).toBeGreaterThan(800);
    expect(s.maxVelocity).toBeGreaterThan(150);
    // Main brings it in slow.
    expect(s.descentRate).toBeGreaterThan(3);
    expect(s.descentRate).toBeLessThan(15);
    // Transonic flight is flagged as extrapolated.
    expect(run.result.warnings.some((w) => w.code === "transonic")).toBe(true);
  });

  it("says so when the airframe leads with a flat face instead of a nose cone", async () => {
    // Loft takes forebody pressure and wave drag from whichever component is a nose cone, wherever it
    // sits, and has no term at all for a blunt leading face. That was unreachable while the component
    // order came from a file — every one of the 35 corpus designs leads with its nose — and is one
    // gesture away now that the stack can be reordered. Measured on this fixture: nudging the nose one
    // place aft leaves apogee, max velocity and rail exit every digit unchanged.
    const doc = await load("demo-quirks.ork");
    const nose = doc.rocket.stages[0].components.find((c) => c.kind === "nosecone")!;
    expect(nose).toBeTruthy();

    const streamlined = runFromDocument(doc, {});
    expect(streamlined.result.warnings.some((w) => w.code === "blunt-nose")).toBe(false);

    const mv = moveTarget(doc.rocket, nose.id, 1)!;
    expect(mv).toBeTruthy();
    const blunt = runFromDocument({ ...doc, rocket: applyGeometryEdits(doc.rocket, { moved: [mv] }) }, {});
    const w = blunt.result.warnings.find((x) => x.code === "blunt-nose");
    expect(w, "a flat leading face must be reported").toBeTruthy();
    expect(w!.severity).toBe("warning");
    // The measurement that makes the warning necessary rather than decorative: the published numbers
    // did not move at all, so nothing else on the surface says the shape changed.
    expect(blunt.result.summary.apogee).toBe(streamlined.result.summary.apogee);
    expect(blunt.result.summary.maxVelocity).toBe(streamlined.result.summary.maxVelocity);
    // The face's own diameter is named, so the flyer can tell how big the missing term is.
    expect(w!.message).toMatch(/flat 66 mm face/);
  });
});

describe("hard-landing (undersized recovery) warning", () => {
  const chuteOf = (doc: OrkDocument) =>
    flattenRocket(doc.rocket).find((p) => p.component.kind === "parachute")?.component;

  it("does not warn when the canopy brings it in at a sane descent rate", async () => {
    // The bundled demos land at ~6–7 m/s — a normal descent, no caution.
    for (const f of ["demo-single-deploy.ork", "demo-dual-deploy.ork"]) {
      const run = runFromDocument(await load(f));
      expect(run.result.summary.groundHitVelocity).toBeLessThan(7.6);
      expect(run.result.warnings.some((w) => w.code === "hard-landing")).toBe(false);
    }
  });

  it("warns when a chute is far too small for the airframe", async () => {
    const doc = await load("demo-single-deploy.ork");
    const chute = chuteOf(doc);
    expect(chute?.kind).toBe("parachute");
    if (chute?.kind === "parachute") {
      chute.diameter = 0.15; // shrink the canopy drastically
      chute.area = undefined;
    }
    const run = runFromDocument(doc);
    const w = run.result.warnings.find((x) => x.code === "hard-landing");
    expect(run.result.summary.groundHitVelocity).toBeGreaterThan(10.7);
    expect(w).toBeDefined();
    expect(w!.severity).toBe("warning"); // very hard landing
    // A recovery device DID open, so this is the hard-landing case, not the ballistic one.
    expect(run.result.warnings.some((x) => x.code === "ballistic-descent")).toBe(false);
  });

  it("cautions (not warns) at a merely firm landing between the thresholds", async () => {
    const doc = await load("demo-single-deploy.ork");
    const chute = chuteOf(doc);
    if (chute?.kind === "parachute") {
      chute.diameter = 0.35; // firm but not catastrophic
      chute.area = undefined;
    }
    const run = runFromDocument(doc);
    const v = run.result.summary.groundHitVelocity;
    const w = run.result.warnings.find((x) => x.code === "hard-landing");
    if (v > 7.6 && v <= 10.7) {
      expect(w?.severity).toBe("caution");
    }
    expect(v).toBeGreaterThan(7.6);
  });
});

describe("runFromDocument forwards what it is given", () => {
  // It used to name three options and drop the other nine, with no error and no warning: a caller
  // asking for a different drag, a ballistic flight or a motor swap got a flight that had quietly
  // ignored it. Nothing user-facing depended on that — the app calls `runFlight` directly — but the
  // corpus suite drives THIS function, so no corpus-wide sensitivity to any of the nine could be
  // measured. Each assertion below pairs a changed option with the number it must move; a wrapper
  // that drops it again returns the two identical values these expect to differ.
  it("passes dragScale through, so the flight actually flies on it", async () => {
    const doc = await load("demo-single-deploy.ork");
    const low = runFromDocument(doc, { dragScale: 0.2 }).result.summary.apogee;
    const high = runFromDocument(doc, { dragScale: 3 }).result.summary.apogee;
    const plain = runFromDocument(doc).result.summary.apogee;
    expect(low).toBeGreaterThan(plain);
    expect(high).toBeLessThan(plain);
    // Not merely different — a tenfold drag range must move apogee by a lot, or something is
    // clamping it somewhere else and the assertion above would pass on a rounding difference.
    expect(low / high).toBeGreaterThan(1.5);
  });

  it("passes ballastKg, geometry, thrustScale and massScale through", async () => {
    const doc = await load("demo-single-deploy.ork");
    const plain = runFromDocument(doc).result.summary.apogee;
    expect(runFromDocument(doc, { ballastKg: 0.5 }).result.summary.apogee).toBeLessThan(plain);
    expect(runFromDocument(doc, { thrustScale: 1.3 }).result.summary.apogee).toBeGreaterThan(plain);
    expect(runFromDocument(doc, { massScale: 2 }).result.summary.apogee).toBeLessThan(plain);
    const finned = runFromDocument(doc, { geometry: { finSpan: 0.12 } }).result.summary.apogee;
    expect(finned).not.toBeCloseTo(plain, 3);
  });

  it("still derives configId, overrides and validateAgainst when the caller omits them", async () => {
    // The three the wrapper exists for. Spreading the caller's options must not stop it filling
    // these in from the document. `demo-boattail.ork` rather than the single-deploy sample because
    // the bundled samples carry `<simulation status="external">` with no flightdata at all, so
    // there is nothing to validate against and `validation` is correctly undefined for them — an
    // assertion on that fixture would have been testing the fixture, not the wrapper.
    const doc = await load("demo-boattail.ork");
    const run = runFromDocument(doc, { dragScale: 1 });
    expect(run.config.id).toBe(doc.simulations[0].conditions.configId);
    expect(run.validation).toBeDefined();
    // …and an explicit option still wins over the derived one.
    expect(runFromDocument(doc, { validateAgainst: undefined }).validation).toBeDefined();
  });
});

describe("a fin count Barrowman's method does not describe", () => {
  /** SEV-1. Every static margin Loft publishes comes from Barrowman's centre-of-pressure method,
   *  which assumes three or more fins in a symmetric ring. Below that the vehicle is not
   *  axisymmetric and the method has no term for what it becomes — so the figure is outside the
   *  assumptions that produce it, not merely uncertain.
   *
   *  What made it a Sev-1 rather than a nicety: the one-fin case was the ONLY configuration on this
   *  fixture that returned an empty warning list. Every other count, including the design's own,
   *  raises at least the over-stable caution — so the single design whose stability number was least
   *  trustworthy was the only one Loft reported perfectly clean. */
  it("warns on one and two fins, and stays quiet from three up", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const fly = (finCount: number) =>
      runFlight(doc.rocket, {
        configId: sim?.conditions.configId,
        overrides: sim ? overridesFromStored(sim) : undefined,
        geometry: { finCount },
      });

    for (const n of [1, 2]) {
      const run = fly(n);
      const codes = run.result.warnings.map((w) => w.code);
      expect(codes, `${n} fin(s) raised no caveat on a margin the method cannot produce`).toContain(
        "fin-count-assumption",
      );
      // It is a warning, not a caution: the figure it qualifies is the go/no-go readout.
      const w = run.result.warnings.find((x) => x.code === "fin-count-assumption")!;
      expect(w.severity).toBe("warning");
      // And it names the set, so a design with several is actionable.
      expect(w.message.length).toBeGreaterThan(40);
    }

    // The negative control, and the reason the case can discriminate at all: from three fins up the
    // method applies and the caveat must not fire, or it is noise a flyer learns to ignore.
    for (const n of [3, 4, 6]) {
      const codes = fly(n).result.warnings.map((w) => w.code);
      expect(codes, `${n} fins tripped a caveat meant for an asymmetric design`).not.toContain(
        "fin-count-assumption",
      );
    }

    // The original defect, stated as the thing that must never come back: the one-fin flight had an
    // EMPTY warning list while reporting a comfortable-looking 1.639 cal.
    expect(fly(1).result.warnings.length, "a one-finned rocket reported perfectly clean").toBeGreaterThan(0);
  });
});
