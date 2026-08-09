import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { importDesign } from "./ork/import";
import { runFlight, configChoices, overridesFromStored } from "./sim/run";
import { flattenRocket } from "./model/geometry";

/** The bundled examples: every one the import screen offers is served, imports, and flies.
 *
 *  **This is P12's pin, and the milestone earned it by finding three counts already stale.** The
 *  samples are the first thing a flyer touches who has no design file of their own, and until now
 *  nothing tied the list the app OFFERS to the files the repo SHIPS: `components/ImportPanel.tsx`
 *  names paths under `/samples/`, `scripts/gen-fixtures.mjs` decides which sources get written there,
 *  and the two were maintained by hand. A name in one and not the other is a one-tap button that
 *  404s — the worst possible first minute — or a shipped file nobody can reach.
 *
 *  It asserts the two directions separately because they fail differently and a session needs to be
 *  told which: OFFERED-BUT-MISSING is a broken button, SHIPPED-BUT-UNOFFERED is dead weight in the
 *  deploy and a capability nobody can see.
 */

const root = process.cwd();
const panel = () => readFileSync(resolve(root, "components/ImportPanel.tsx"), "utf8");

/** The sample paths the import screen actually offers, read from its own list. */
function offered(): string[] {
  const block = panel().slice(panel().indexOf("const SAMPLES"), panel().indexOf("];", panel().indexOf("const SAMPLES")));
  return [...block.matchAll(/path:\s*"\/samples\/([^"]+)"/g)].map((m) => m[1]).sort();
}

/** The sample files the repo actually ships. */
function shipped(): string[] {
  return readdirSync(resolve(root, "public/samples"))
    .filter((f) => /\.(ork|rkt|cdx1)$/i.test(f))
    .sort();
}

describe("the bundled example designs", () => {
  it("offers exactly the files it ships, in both directions", () => {
    const off = offered();
    const ship = shipped();
    // A denominator. An empty list on either side would make both assertions below vacuous, and this
    // is exactly the "0 findings from a sweep that examined nothing" shape.
    expect(off.length, "the import panel's SAMPLES list could not be read").toBeGreaterThan(3);
    expect(ship.length, "public/samples is empty — the walk is reading the wrong directory").toBeGreaterThan(3);

    expect(
      off.filter((f) => !ship.includes(f)),
      "the import screen offers a sample the repo does not ship — these are one-tap buttons that 404",
    ).toEqual([]);
    expect(
      ship.filter((f) => !off.includes(f)),
      "the repo ships a sample the import screen never offers — a capability nobody can reach, and bytes in the deploy",
    ).toEqual([]);
  });

  it("ships a design that imports and flies for every one of them", async () => {
    for (const name of shipped()) {
      const path = resolve(root, "public/samples", name);
      expect(existsSync(path), `${name} is offered and not on disk`).toBe(true);
      const doc = await importDesign(new Uint8Array(readFileSync(path)));
      const parts = flattenRocket(doc.rocket);
      expect(parts.length, `${name} imported as an empty design`).toBeGreaterThan(2);
      // Flown the way the app flies it — the design's own stored setup where it has one, so this
      // exercises the same path a flyer's first tap takes rather than a bare default.
      const sim = doc.simulations[0];
      const run = runFlight(
        doc.rocket,
        sim ? { configId: sim.conditions.configId, overrides: overridesFromStored(sim) } : {},
      );
      expect(run.hasPropulsion, `${name} does not fly — its motor did not resolve`).toBe(true);
      expect(run.motorsComplete, `${name} is missing a motor, so its first tap withholds the stability`).toBe(true);
      expect(run.result.summary.apogee, `${name} reaches no apogee`).toBeGreaterThan(0);
      expect(configChoices(doc).length, `${name} offers no flight configuration`).toBeGreaterThan(0);
    }
  }, 120_000);

  it("covers the capabilities the set exists to demonstrate, and says which are still uncovered", async () => {
    // **The point of a sample is to show a capability a flyer would otherwise not know Loft has.**
    // Measured 2026-08-08 before this milestone: four files, three airframes, and between them not
    // one transition, boattail or non-trapezoidal fin — while two designs with exactly those were
    // sitting in `fixtures/` as test-only files, already generated from source and already loading.
    const kinds = new Set<string>();
    for (const name of shipped()) {
      const doc = await importDesign(new Uint8Array(readFileSync(resolve(root, "public/samples", name))));
      for (const p of flattenRocket(doc.rocket)) kinds.add(p.component.kind);
    }
    for (const want of ["nosecone", "bodytube", "trapezoidfinset", "parachute", "masscomponent", "transition", "ellipticalfinset"]) {
      expect(kinds.has(want), `no bundled sample carries a ${want} — a flyer cannot see Loft supports it`).toBe(true);
    }
    // And the ones still missing, asserted as an EXACT set rather than left implicit: a sample added
    // for one of these should shrink this list in the same commit, and a capability quietly dropping
    // out of the set should fail here rather than pass unnoticed.
    const stillMissing = ["freeformfinset", "tubefinset", "streamer", "tubecoupler", "bulkhead"].filter((k) => !kinds.has(k));
    expect(stillMissing, "the uncovered-capability list moved — update it in the commit that moved it").toEqual([
      "freeformfinset",
      "tubefinset",
      "streamer",
      "tubecoupler",
      "bulkhead",
    ]);
  }, 120_000);

  it("offers at least one design a stranger can fly without a caution", async () => {
    // **This assertion was written the other way up one increment ago, and flipping it IS the
    // increment.** `OVER_STABLE_CAL` is 3, and until `demo-stable.ork` existed the whole bundled set
    // measured 3.06 / 3.82 / 4.07 / 4.07 / 4.38 cal — so every one-tap example Loft offered a
    // stranger opened with an over-stable warning, and adding two designs had made that six of six
    // rather than four of four. The previous form of this test asserted the in-band count was ZERO,
    // precisely so the increment that fixed it could not land quietly.
    //
    // It asserts a band and not a number: pinning 2.07 would fail on any change to the drag or mass
    // model that moved it by a hundredth, which is a check about the solver wearing a sample's
    // clothes. What matters is that a stranger's design is clear of BOTH warnings — the 1-caliber
    // low-stability one below and the 3-caliber over-stable one above.
    const margins: string[] = [];
    for (const name of shipped()) {
      const doc = await importDesign(new Uint8Array(readFileSync(resolve(root, "public/samples", name))));
      const sim = doc.simulations[0];
      const run = runFlight(
        doc.rocket,
        sim ? { configId: sim.conditions.configId, overrides: overridesFromStored(sim) } : {},
      );
      margins.push(`${name} ${run.result.staticMarginCal.toFixed(2)}`);
    }
    const inBand = margins.filter((m) => {
      const cal = Number(m.split(" ").pop());
      return cal > 1 && cal <= 3;
    });
    expect(
      inBand.length,
      `no bundled sample is inside the stable band (1–3 cal), so a stranger's first flight opens with a caution:\n  ${margins.join("\n  ")}`,
    ).toBeGreaterThan(0);
  }, 120_000);
});
