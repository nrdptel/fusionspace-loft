import { describe, it, expect, beforeEach, vi } from "vitest";
import { toBase64, fromBase64, loadSession, saveSession, clearSession } from "./session";

/** A minimal localStorage stand-in — the tests run in Node, and the point is the module's own
 *  guards (bad JSON, an older schema, an oversized design, storage that throws outright). */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get size() {
      return map.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
});

const session = (over: Partial<Parameters<typeof saveSession>[0]> = {}) => ({
  v: 1 as const,
  design: "AAEC",
  name: "rocket.ork",
  opensOn: "flight" as const,
  units: "imperial" as const,
  simIndex: 2,
  edits: { finSpan: 0.06 },
  ...over,
});

describe("session base64", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array(1000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) % 256;
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("handles a payload past the argument-spread limit", () => {
    // String.fromCharCode(...bytes) throws somewhere around 100 kB; a real .ork is bigger than
    // that often enough that chunking is the whole reason this helper exists.
    const bytes = new Uint8Array(300_000).fill(7);
    const round = fromBase64(toBase64(bytes));
    expect(round.length).toBe(bytes.length);
    expect(round[299_999]).toBe(7);
  });
});

describe("session storage", () => {
  it("saves and restores a session", () => {
    saveSession(session());
    const back = loadSession();
    expect(back?.name).toBe("rocket.ork");
    expect(back?.units).toBe("imperial");
    expect(back?.simIndex).toBe(2);
    expect(back?.edits).toEqual({ finSpan: 0.06 });
  });

  it("returns null when nothing is stored", () => {
    expect(loadSession()).toBeNull();
  });

  it("discards an older schema rather than half-reading it", () => {
    localStorage.setItem("loft.session", JSON.stringify({ ...session(), v: 0 }));
    expect(loadSession()).toBeNull();
  });

  it("discards unreadable JSON", () => {
    localStorage.setItem("loft.session", "{not json");
    expect(loadSession()).toBeNull();
  });

  it("falls back to sane values for a corrupt field", () => {
    localStorage.setItem(
      "loft.session",
      JSON.stringify({ v: 1, design: "AAEC", name: 42, opensOn: "nowhere", units: "furlongs", simIndex: "x", edits: 7 }),
    );
    const back = loadSession()!;
    expect(back.name).toBe("Saved design");
    expect(back.opensOn).toBe("flight");
    expect(back.units).toBe("metric");
    expect(back.simIndex).toBe(0);
    expect(back.edits).toEqual({});
  });

  it("does not store a design past the size cap", () => {
    saveSession(session({ design: "A".repeat(2_000_000) }));
    expect(loadSession()).toBeNull();
  });

  it("survives storage that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => saveSession(session())).not.toThrow();
    expect(() => clearSession()).not.toThrow();
    expect(loadSession()).toBeNull();
  });

  it("clears", () => {
    saveSession(session());
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
