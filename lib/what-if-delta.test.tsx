import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { WhatIfDelta } from "@/components/ResultsView";
import { importOrk } from "./ork/import";
import { runFlight } from "./sim/run";
import { flattenRocket } from "./model/geometry";
import type { Rocket } from "./model/types";

/** The what-if comparison card, rendered — because the surface census one file over cannot see this.
 *
 *  `lib/margin-surfaces.test.ts` asserts that every file publishing a static margin has been looked
 *  at. It cannot assert that each PLACE inside such a file is gated, and a negative control proved
 *  the gap is real: deleting this card's gate leaves that census green, because the summary strip
 *  elsewhere in `ResultsView.tsx` still mentions `motorsComplete`.
 *
 *  What this card publishes is worse than a single figure — the design's margin, the what-if's, and
 *  the signed change between them — and it has TWO ways to be wrong, which is why both are asserted
 *  separately below. The second is the one a check on the current flight alone would have missed.
 */

/** The Stability row's own rendered TEXT, bounded at the next row's label.
 *
 *  Bounded that way and not by a character count: a fixed slice ran into the flutter-margin row below
 *  and failed on "5.8", a real number correctly rendered somewhere else. And tags are stripped,
 *  because an earlier draft matched `mt-0.5` inside a class attribute. Two drafts of one assertion,
 *  wrong in two different ways, both of them the check mis-reading its own input — left on the page
 *  because it is the same trap `DESIGN.md` §9 records about its own greps. */
function stabilityCell(html: string): string {
  const from = html.indexOf("Stability");
  const next = html.indexOf("<dt", from + 1);
  return html.slice(from, next === -1 ? html.length : next).replace(/<[^>]*>/g, " ");
}

async function load(name: string) {
  return importOrk(new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name))));
}

/** The bundled sample, given a second motor mount whose designation nothing can resolve.
 *
 *  The mount is deliberately ROOMY: an impossible bore withholds the whole flight (`hasPropulsion`
 *  false), which is a different state and would hide the one this is about. A missing thrust curve is
 *  the case where Loft flies on and the margin still cannot be trusted. */
function withUnresolvableSecondMotor(rocket: Rocket): Rocket {
  const two = structuredClone(rocket);
  const flat = flattenRocket(two);
  const mount = flat.find((p) => (p.component as unknown as Record<string, unknown>).motorMount)!.component;
  const host = flat.find((p) => p.component.children.includes(mount))!.component;
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
  return two;
}

describe("the what-if comparison card", () => {
  it("prints the stability row when both flights resolved every motor", async () => {
    // The control. Without it, a card that printed "—" unconditionally would pass every assertion
    // below and the check would be measuring nothing.
    const doc = await load("demo-single-deploy.ork");
    const cfgId = doc.rocket.configurations[0].id;
    const baseline = runFlight(doc.rocket, { configId: cfgId });
    const run = runFlight(doc.rocket, { configId: cfgId, ballastKg: 0.05 });
    expect(baseline.motorsComplete && run.motorsComplete, "the control design no longer resolves its motor").toBe(true);

    const html = renderToStaticMarkup(<WhatIfDelta run={run} baseline={baseline} units="metric" />);
    expect(html).toContain("Stability");
    expect(html, "the control must actually print a margin, or the withheld case proves nothing").toMatch(/\d\.\d+/);
    expect(html).not.toContain("Stability is withheld");
  }, 60_000);

  it("withholds the stability row when the CURRENT flight is missing a motor, and says why", async () => {
    const doc = await load("demo-single-deploy.ork");
    const two = withUnresolvableSecondMotor(doc.rocket);
    const cfgId = two.configurations[0].id;
    const run = runFlight(two, { configId: cfgId });
    const baseline = runFlight(two, { configId: cfgId });
    expect(run.hasPropulsion, "the construction no longer flies — it is testing the wrong state").toBe(true);
    expect(run.motorsComplete, "the construction resolved every motor — it is testing the wrong state").toBe(false);

    const html = renderToStaticMarkup(<WhatIfDelta run={run} baseline={baseline} units="metric" />);
    // The row is still there — an absent row beside three printed ones is a blank cell, which
    // `DESIGN.md` §6 calls a bug — and it says why and what brings it back.
    expect(html, "the row must be withheld, not dropped").toContain("Stability");
    expect(html).toContain("Stability is withheld");
    expect(html, "and it must name what would restore it").toContain("Resolve the motor under Design");
    // And the figure itself is nowhere: the margin for this construction is ~1.29 cal.
    expect(stabilityCell(html), "a static margin leaked into the withheld row").not.toMatch(/\d\.\d+/);
  }, 60_000);

  it("withholds it when only the BASELINE is missing a motor — the half a check on one flight misses", async () => {
    // **This is the case the fix was extended for, and it is not hypothetical.** The baseline is the
    // design as its own file describes it; the current flight is the what-if. A motor swap onto a
    // bundled motor therefore resolves everything in `run` while leaving `baseline` short — and the
    // card's third column is a CHANGE between the two, so it would report a stability move the flyer
    // never made, computed against a CG that is missing a motor's mass.
    const doc = await load("demo-single-deploy.ork");
    const two = withUnresolvableSecondMotor(doc.rocket);
    const cfgId = two.configurations[0].id;
    const baseline = runFlight(two, { configId: cfgId });
    const run = runFlight(two, { configId: cfgId, motorSwap: { designation: "H128W" } });
    expect(run.motorsComplete, "the swap no longer completes the configuration — this case needs it to").toBe(true);
    expect(baseline.motorsComplete, "the baseline resolved every motor — it is testing the wrong state").toBe(false);

    const html = renderToStaticMarkup(<WhatIfDelta run={run} baseline={baseline} units="metric" />);
    expect(html).toContain("Stability is withheld");
    expect(html, "the reason must name the DESIGN's flight, not the what-if's").toContain("the design&#x27;s own flight is missing a motor");
    // **And the ROW itself, which is the assertion this test shipped without and a negative control
    // caught.** The sentence below the grid and the row above it are two separate conditions in the
    // component; asserting only the sentence let a variant that gated the row on `run.motorsComplete`
    // alone — printing 1.29 → 1.29 cal against an incomplete baseline — pass all three cases here.
    expect(stabilityCell(html), "a static margin leaked into the row while the sentence said it was withheld")
      .not.toMatch(/\d\.\d+/);
  }, 60_000);
});
