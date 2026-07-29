import { describe, it, expect } from "vitest";
import { designKey } from "./design-key";

const key = (over: Partial<Parameters<typeof designKey>[0]> = {}) =>
  designKey({ loadId: 1, simIndex: 0, configId: "c", ...over });

describe("designKey", () => {
  it("is stable for an unchanged design", () => {
    expect(key()).toBe(key());
  });

  it("identifies the design by the load, not by its editable name", () => {
    // Renaming touches neither the airframe nor the flight, so a Monte-Carlo already flown still
    // describes the design on screen. Keying on the name re-flew all four heavy panels on every
    // keystroke in the rename field — 4.3 s per character on the bundled dual-deploy sample.
    // There is no `name` field to pass any more; the guard is that loading is what moves the key.
    expect(key({ loadId: 2 })).not.toBe(key({ loadId: 1 }));
    expect(key({ loadId: "abc" })).not.toBe(key({ loadId: "def" }));
  });

  it("changes when any what-if the flight is flown with changes", () => {
    const base = key();
    expect(key({ loadId: 2 })).not.toBe(base);
    expect(key({ ballastKg: 0.1 })).not.toBe(base);
    expect(key({ recoveryCdScale: 2 })).not.toBe(base);
    expect(key({ motorSwap: { designation: "J350" } })).not.toBe(base);
    expect(key({ simIndex: 1 })).not.toBe(base);
    expect(key({ configId: "other" })).not.toBe(base);
  });

  it("tells two motors of the same designation apart", () => {
    // The swap picker offers an Estes C6 and a Quest C6 in the same 18 mm list, and they fly
    // measurably differently. On the designation alone, swapping between them left the dispersion
    // and both sweeps showing the previous motor's flight as the current one.
    expect(key({ motorSwap: { manufacturer: "Estes", designation: "C6" } })).not.toBe(
      key({ motorSwap: { manufacturer: "Quest", designation: "C6" } }),
    );
    // A swap with no manufacturer recorded is still a swap, and still not the unswapped design.
    expect(key({ motorSwap: { designation: "C6" } })).not.toBe(key());
    expect(key({ motorSwap: { designation: "C6" } })).not.toBe(
      key({ motorSwap: { manufacturer: "Estes", designation: "C6" } }),
    );
  });

  it("covers a geometry edit by walking the object, not by listing fields", () => {
    // The point of the shared key: a field added to the editor is covered without being named here,
    // which is exactly what the four hand-written copies got wrong.
    const base = key();
    for (const field of ["finSpan", "noseLength", "bodyDiameter", "payloadMassKg", "aFieldAddedLater"]) {
      expect(key({ geometry: { [field]: 0.5 } as never })).not.toBe(base);
    }
  });

  it("doesn't depend on the order the edits were set in", () => {
    expect(key({ geometry: { finSpan: 0.1, noseLength: 0.2 } as never })).toBe(
      key({ geometry: { noseLength: 0.2, finSpan: 0.1 } as never }),
    );
  });

  it("tells a set field from a cleared one, so clearing an edit resets the panels too", () => {
    expect(key({ geometry: { finSpan: 0.1 } as never })).not.toBe(key({ geometry: { finSpan: undefined } as never }));
  });

  it("ignores a bare fin selection but not one that aims an active fin edit", () => {
    const base = { loadId: 1, simIndex: 0 };
    // No fin value set: picking a set changed nothing that flew, so a Monte-Carlo already run still
    // describes the design on screen and must not be thrown away.
    expect(designKey({ ...base, geometry: { finSetId: "a" } })).toBe(
      designKey({ ...base, geometry: { finSetId: "b" } }),
    );
    expect(designKey({ ...base, geometry: { finSetId: "a" } })).toBe(designKey({ ...base, geometry: {} }));
    // With a span edit active, the selection decides which fin gets it — the same number on a
    // different set is a different rocket, and a stale panel would present its numbers as current.
    expect(designKey({ ...base, geometry: { finSetId: "a", finSpan: 0.05 } })).not.toBe(
      designKey({ ...base, geometry: { finSetId: "b", finSpan: 0.05 } }),
    );
  });
});
