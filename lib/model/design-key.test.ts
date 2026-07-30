import { describe, it, expect } from "vitest";
import { designKey } from "./design-key";
import { AIM_SLOTS } from "./edit";

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

  it("ignores a bare body-tube selection but not one that aims an active body edit", () => {
    const base = { loadId: 1, simIndex: 0 };
    expect(designKey({ ...base, geometry: { bodyTubeId: "a" } })).toBe(
      designKey({ ...base, geometry: { bodyTubeId: "b" } }),
    );
    expect(designKey({ ...base, geometry: { bodyTubeId: "a" } })).toBe(designKey({ ...base, geometry: {} }));
    // A length edit lands on the tube the selection names, so the same length on a different tube is
    // a different rocket.
    expect(designKey({ ...base, geometry: { bodyTubeId: "a", bodyLength: 0.5 } })).not.toBe(
      designKey({ ...base, geometry: { bodyTubeId: "b", bodyLength: 0.5 } }),
    );
    // ...and so does the caliber, which reads the picked tube even though it scales the airframe.
    expect(designKey({ ...base, geometry: { bodyTubeId: "a", bodyDiameter: 0.06 } })).not.toBe(
      designKey({ ...base, geometry: { bodyTubeId: "b", bodyDiameter: 0.06 } }),
    );
  });

  it("ignores a bare aim but not one that aims an active edit — for every slot in the registry", () => {
    // Registry-driven so a role added to the edit model cannot quietly skip this check. Miss a slot
    // here and the failure is invisible: a panel keeps one part's numbers after the flyer has aimed
    // the edit at another.
    const base = { loadId: 1, simIndex: 0 };
    for (const [slot, def] of Object.entries(AIM_SLOTS)) {
      expect(designKey({ ...base, geometry: { [slot]: "a" } }), `bare ${slot} must not change the key`).toBe(
        designKey({ ...base, geometry: {} }),
      );
      for (const field of def.targets) {
        expect(
          designKey({ ...base, geometry: { [slot]: "a", [field]: 0.05 } }),
          `${slot} must matter once ${field} is set`,
        ).not.toBe(designKey({ ...base, geometry: { [slot]: "b", [field]: 0.05 } }));
      }
    }
  });

  it("keeps the aims independent, so one role's edit does not make another's pick matter", () => {
    // Pooled, this cost minutes of work for a click that changed nothing: with a body-length edit
    // active, picking a fin set would have reset every heavy panel, and with a fin-span edit active,
    // picking a body tube would have done the same.
    const base = { loadId: 1, simIndex: 0 };
    expect(designKey({ ...base, geometry: { bodyLength: 0.5, finSetId: "a" } })).toBe(
      designKey({ ...base, geometry: { bodyLength: 0.5, finSetId: "b" } }),
    );
    expect(designKey({ ...base, geometry: { finSpan: 0.05, bodyTubeId: "a" } })).toBe(
      designKey({ ...base, geometry: { finSpan: 0.05, bodyTubeId: "b" } }),
    );
  });
});
