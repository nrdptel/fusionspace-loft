import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isUuidShaped, uuidFrom, uniqueUuidFrom } from "./id";
import { newDesign } from "./starter";
import { exportOrk } from "../ork/export";
import { importOrk } from "../ork/import";
import { flattenRocket } from "./geometry";
import { primaryBodyTube, primaryParachute, aimEditsAt, applyGeometryEdits } from "./edit";

describe("component ids survive an export → import round trip", () => {
  const ids = (r: Parameters<typeof flattenRocket>[0]) => flattenRocket(r).map((p) => p.component.id);

  it("the starter's own ids come back unchanged", async () => {
    // This is the defect the whole change exists for. A design built here is persisted as its OWN
    // exported bytes (the "Start fresh" path stores `exportOrk(document)`), so a reload re-imports it.
    // The exporter used to mint `10f70000-…-000000000002` upward instead of writing each component's id,
    // and the starter's ids were the words `nose`, `body`, `av`, `chute`, `mount`, `fins` — which are not
    // valid `<id>` values, which is why it minted. So every reload of a built design came back as
    // different parts, and a saved selection resolved to nothing and silently re-aimed at the primary one.
    const doc = newDesign();
    const before = ids(doc.rocket);
    expect(before.length).toBeGreaterThan(4);
    for (const id of before) expect(isUuidShaped(id), `${id} must be writable into <id>`).toBe(true);

    const back = (await importOrk(exportOrk(doc))).rocket;
    expect(ids(back)).toEqual(before);
  });

  it("a stored aim still resolves after the round trip", async () => {
    // The user-visible consequence, asserted through the edit model rather than by eye.
    const doc = newDesign();
    const tube = primaryBodyTube(doc.rocket)!;
    const chute = primaryParachute(doc.rocket)!;
    const aim = { ...aimEditsAt(doc.rocket, tube.id), parachuteId: chute.id };
    expect(aim.bodyTubeId).toBe(tube.id);

    const back = (await importOrk(exportOrk(doc))).rocket;
    expect(primaryBodyTube(back, aim.bodyTubeId)?.id).toBe(tube.id);
    expect(primaryParachute(back, aim.parachuteId)?.id).toBe(chute.id);
    // And an edit aimed through the restored id lands on the same part.
    const edited = applyGeometryEdits(back, { bodyTubeId: aim.bodyTubeId, bodyLength: 0.8 });
    expect(primaryBodyTube(edited, aim.bodyTubeId)!.length).toBeCloseTo(0.8, 9);
  });

  it("two exports of one design are byte-identical, and so are their ids", async () => {
    // Stability across repeated exports was already true (the counter resets per export) and has to stay
    // true: the session is rewritten on every edit, so an id that drifted between two writes of the same
    // design would break the aim just as surely as the mint did.
    const doc = newDesign();
    const a = exportOrk(doc);
    const b = exportOrk(doc);
    expect(new TextDecoder().decode(a)).toBe(new TextDecoder().decode(b));
    expect(ids((await importOrk(a)).rocket)).toEqual(ids((await importOrk(b)).rocket));
  });

  it("carries a structural add's derived id through as a stable UUID", async () => {
    // `applyGeometryEdits` mints ids like `<tube>-boattail` for the parts it adds. Those are not UUIDs,
    // so they are derived — but derived deterministically, or a built-then-exported design would lose the
    // boattail's identity on every save.
    const doc = newDesign();
    const edited = applyGeometryEdits(doc.rocket, { boattailLength: 0.04, boattailAftDiameter: 0.03 });
    const added = flattenRocket(edited).find((p) => p.component.id.endsWith("-boattail"))!;
    expect(added).toBeTruthy();

    const back1 = (await importOrk(exportOrk({ ...doc, rocket: edited }))).rocket;
    const back2 = (await importOrk(exportOrk({ ...doc, rocket: edited }))).rocket;
    const boat1 = flattenRocket(back1).find((p) => p.component.name === "Boattail")!;
    const boat2 = flattenRocket(back2).find((p) => p.component.name === "Boattail")!;
    expect(isUuidShaped(boat1.component.id)).toBe(true);
    expect(boat1.component.id).toBe(boat2.component.id);
    // The parts that already had UUIDs kept theirs, so deriving one id did not disturb the others.
    expect(primaryBodyTube(back1)!.id).toBe(primaryBodyTube(doc.rocket)!.id);
  });
});

describe("uuidFrom / uniqueUuidFrom", () => {
  it("derives a well-formed UUID, deterministically", () => {
    expect(isUuidShaped(uuidFrom("c2"))).toBe(true);
    expect(uuidFrom("c2")).toBe(uuidFrom("c2"));
    expect(uuidFrom("c2")).not.toBe(uuidFrom("c3"));
    // Version 4 and the RFC-4122 variant bits, the two positions the format fixes.
    const u = uuidFrom("anything at all");
    expect(u[14]).toBe("4");
    expect(["8", "9", "a", "b"]).toContain(u[19]);
  });

  it("passes an existing UUID through untouched", () => {
    const u = "ef6182bf-cd8a-46f9-a5ee-0a30ac588f9c"; // a real value from a corpus design
    expect(uniqueUuidFrom(u, new Set())).toBe(u);
  });

  it("never hands out the same id twice", () => {
    // Two components sharing an id would make every id-addressed operation ambiguous, and R2's delete
    // resolves its target by id. Forced here by seeding the set with what the derivation would return.
    const taken = new Set<string>();
    const first = uniqueUuidFrom("c2", taken);
    const second = uniqueUuidFrom("c2", taken); // the same seed, already used
    expect(second).not.toBe(first);
    expect(isUuidShaped(second)).toBe(true);
    // Still deterministic: the same sequence of calls gives the same answers.
    const again = new Set<string>();
    expect(uniqueUuidFrom("c2", again)).toBe(first);
    expect(uniqueUuidFrom("c2", again)).toBe(second);
  });

  it("does not collide across a rocket's worth of ids", () => {
    const taken = new Set<string>();
    const seeds = ["nose", "body", "fins", "av", "chute", "mount", "c1", "c2", "c3", "r1", "a1"]
      .flatMap((s) => [s, `${s}-boattail`, `${s}-payload`, `${s}-drogue`]);
    for (const s of seeds) uniqueUuidFrom(s, taken);
    expect(taken.size).toBe(seeds.length);
  });
});

describe("nothing Loft writes into <id> can be malformed", () => {
  it("gives a design whose file carried NO ids a full set of valid ones", async () => {
    // `fixtures/demo-quirks.ork` is the committed fixture with zero `<id>` elements, so the importer
    // falls back to positional ids (`c1`, `c2`, …) — the case 6 of the 27 corpus designs are in, and every
    // `.rkt` and `.CDX1`. Downloading one would have put `<id>c1</id>` into the file: the only element in
    // the format that has never held a non-UUID in 423 real examples.
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", "demo-quirks.ork")));
    const doc = await importOrk(bytes);
    const modelIds = flattenRocket(doc.rocket).map((p) => p.component.id);
    expect(modelIds.length).toBeGreaterThan(4);
    expect(modelIds.filter(isUuidShaped).length, "the fixture's own ids are positional, not UUIDs").toBe(0);

    // Every id the exporter writes is UUID-shaped...
    const xml = new TextDecoder().decode(exportOrk(doc));
    const written = [...xml.matchAll(/<id>([^<]*)<\/id>/g)].map((m) => m[1]);
    expect(written.length).toBeGreaterThanOrEqual(modelIds.length);
    expect(written.filter((v) => !isUuidShaped(v))).toEqual([]);
    // ...and no two elements share one, which is the uniqueness the format needs within a file.
    expect(new Set(written).size).toBe(written.length);
  });

  it("derives the same ids on every export, so a positional-id design is still stable", async () => {
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", "demo-quirks.ork")));
    const doc = await importOrk(bytes);
    const idsOf = async (b: Uint8Array) =>
      flattenRocket((await importOrk(b)).rocket).map((p) => p.component.id);
    const a = await idsOf(exportOrk(doc));
    const b = await idsOf(exportOrk(doc));
    expect(a).toEqual(b);
    expect(a.every(isUuidShaped)).toBe(true);
    // A second round trip is then a fixed point: the derived ids are already UUIDs, so they pass through.
    const twice = await idsOf(exportOrk({ ...doc, rocket: (await importOrk(exportOrk(doc))).rocket }));
    expect(twice).toEqual(a);
  });
});
