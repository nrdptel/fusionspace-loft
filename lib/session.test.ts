import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolveWorkspace, WORKSPACES } from "./workspaces";
import { deriveConditions, plainConditions, rehydrateConditions } from "./weather";
import {
  toBase64,
  fromBase64,
  loadSession,
  saveSession,
  storableHistory,
  clearSession,
  loadRecents,
  rememberRecent,
  replaceRecent,
  forgetRecent,
  restoreRecent,
  saveDiscardedSession,
  loadDiscardedSession,
  clearDiscardedSession,
  countWhatIfs,
  clearRecents,
  MAX_RECENTS,
  designFingerprint,
  loadDispersion,
  saveDispersion,
  clearDispersion,
} from "./session";

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

  it("carries an undo stack whose conditions still fly after the round trip", () => {
    // **The failure a previous attempt shipped past its own green gate.** A step's state holds the
    // live `WeatherConditions`, which is eleven fields of data plus an `Atmosphere` class instance
    // and a `windProfile` closure. `JSON.stringify` drops both, the record still looks right, and
    // the throw lands inside the solver on replay — where `undoStep` does not consume a step whose
    // apply failed, so the control stays lit over a stack nothing can walk.
    //
    // Asserted on BEHAVIOUR rather than on the keys being present: the dead round-tripped object
    // still has an `atmosphere` property of type object, which is exactly what made this easy to miss.
    const conditions = deriveConditions({
      place: "Somewhere",
      latitude: 32.9,
      longitude: -106.9,
      elevationMsl: 1400,
      tempC: 21,
      surfacePressurePa: 86_000,
      surfaceWindMps: 4,
      surfaceWindDirDeg: 270,
      aloft: [{ altitudeMsl: 1600, windMps: 6, windDirDeg: 280 }],
      aloftTime: "2026-08-14T12",
      aloftMatched: true,
    });
    const step = {
      state: { edits: { finSpan: 0.06 }, weather: conditions, scenario: "today", simIndex: 0 },
      label: "fin span",
      key: "finSpan",
      at: 1,
    };
    // Stamped, because a stack whose steps carry a forecast is only as restorable as the forecast:
    // an unstamped one has no age to check and is treated as expired.
    saveSession({ ...session(), history: { past: [step], future: [] }, weatherAt: Date.now() });

    const back = loadSession();
    expect(back?.history?.past).toHaveLength(1);
    const w = (back!.history!.past[0] as { state: { weather: typeof conditions } }).state.weather;
    expect(w.atmosphere.sample(2000).density).toBeCloseTo(conditions.atmosphere.sample(2000).density, 12);
    for (const k of ["x", "y", "z"] as const) {
      expect(w.windProfile(1200)[k]).toBeCloseTo(conditions.windProfile(1200)[k], 12);
    }
  });

  it("refuses a stack that is not one, and keeps the rest of the session", () => {
    const ok = { state: { edits: {}, weather: null, scenario: "design", simIndex: 0 }, label: "x", key: "x", at: 1 };
    saveSession({ ...session(), history: { past: [ok], future: [] } });
    expect(loadSession()?.history?.past).toHaveLength(1);

    // All or nothing: dropping only the bad steps would silently change what "undo three times"
    // means. A bad stack is not a bad session, so everything else must still come back.
    for (const bad of [
      { past: [1, 2, 3], future: [] },
      { past: [{ label: "x", key: "x", at: 1 }], future: [] },
      { past: [{ ...ok, at: "soon" }], future: [] },
      { past: [ok], future: [null] },
      { past: [ok] },
      // A step whose conditions cannot be rebuilt — the case the whole rehydration exists for.
      { past: [{ ...ok, state: { ...ok.state, weather: { tempC: 21 } } }], future: [] },
    ]) {
      localStorage.setItem("loft.session", JSON.stringify({ ...session(), history: bad }));
      expect(loadSession()?.history, `accepted ${JSON.stringify(bad).slice(0, 44)}`).toBeUndefined();
      expect(loadSession()?.name).toBe("rocket.ork");
    }
  });

  it("stores conditions as data, not as a dead class instance", () => {
    // `Atmosphere`'s own fields are enumerable, so storing the LIVE object faithfully writes its
    // layer table into the record — bytes that cannot be called, that the reader ignores, and that
    // are written once per step where an undo stack shares one fetch across many. The plain half is
    // what goes in.
    const conditions = deriveConditions({
      place: "Somewhere",
      latitude: 32.9,
      longitude: -106.9,
      elevationMsl: 1400,
      tempC: 21,
      surfacePressurePa: 86_000,
      surfaceWindMps: 4,
      surfaceWindDirDeg: 270,
      aloft: [{ altitudeMsl: 1600, windMps: 6, windDirDeg: 280 }],
      aloftMatched: true,
    });
    const plain = plainConditions(conditions);
    expect(Object.keys(plain), "the two derived members must not be stored").not.toContain("atmosphere");
    expect(Object.keys(plain)).not.toContain("windProfile");
    // Everything else survives, so nothing is lost by storing the plain half.
    expect(plain.tempC).toBe(21);
    expect(plain.aloft).toHaveLength(1);
    // And it is smaller than writing the live one, which is the whole point.
    expect(JSON.stringify(plain).length).toBeLessThan(JSON.stringify(conditions).length);
    // Round-trips back to something that flies.
    const back = rehydrateConditions(JSON.parse(JSON.stringify(plain)));
    expect(back!.atmosphere.sample(2000).density).toBeCloseTo(conditions.atmosphere.sample(2000).density, 12);
  });

  it("carries the present conditions beside the stack", () => {
    // Without these the present and the stack disagree about what air is flown: a resume that kept
    // the stack but dropped the forecast lets one undo jump into weather the flyer cannot otherwise
    // get back, and one redo lose it again.
    const conditions = deriveConditions({
      place: "Somewhere",
      latitude: 32.9,
      longitude: -106.9,
      elevationMsl: 1400,
      tempC: 21,
      surfacePressurePa: 86_000,
      surfaceWindMps: 4,
      surfaceWindDirDeg: 270,
      aloft: [],
      aloftMatched: false,
    });
    saveSession({ ...session(), weather: plainConditions(conditions), scenario: "today", weatherAt: Date.now() });
    const back = loadSession();
    expect(back?.scenario).toBe("today");
    const w = back?.weather as typeof conditions;
    expect(w.atmosphere.sample(1500).density).toBeCloseTo(conditions.atmosphere.sample(1500).density, 12);

    // A record whose conditions will not rebuild must not leave the flyer on "today" with no air
    // behind it — the conditions are dropped rather than half-read.
    localStorage.setItem(
      "loft.session",
      JSON.stringify({ ...session(), weather: { tempC: 21 }, scenario: "today", weatherAt: Date.now() }),
    );
    expect(loadSession()?.weather).toBeUndefined();
    expect(loadSession()?.name).toBe("rocket.ork");
  });

  it("lets stored conditions expire, and takes what depends on them", () => {
    // A forecast is for an HOUR, and the Conditions panel prints `aloftTime` as the hour alone with
    // no date — so a profile restored from a previous day reads exactly like this evening's. The
    // file's own measurement puts an unmatched profile up to 154 degrees off the actual hour, and
    // drift is the number a flyer walks on.
    const conditions = deriveConditions({
      place: "Somewhere",
      latitude: 32.9,
      longitude: -106.9,
      elevationMsl: 1400,
      tempC: 21,
      surfacePressurePa: 86_000,
      surfaceWindMps: 4,
      surfaceWindDirDeg: 270,
      aloft: [],
      aloftMatched: true,
    });
    const withWeather = { state: { edits: {}, weather: plainConditions(conditions), scenario: "today", simIndex: 0 }, label: "x", key: "x", at: 1 };
    const stale = Date.now() - 3 * 60 * 60 * 1000;

    // Stale present conditions go, and so does a stack whose steps were taken under them.
    localStorage.setItem(
      "loft.session",
      JSON.stringify({ ...session(), weather: plainConditions(conditions), scenario: "today", weatherAt: stale, history: { past: [withWeather], future: [] } }),
    );
    expect(loadSession()?.weather, "stale conditions must not be restored").toBeUndefined();
    expect(loadSession()?.scenario, "and not the scenario that depends on them").toBeUndefined();
    expect(loadSession()?.history, "nor a stack whose steps fly them").toBeUndefined();
    // The design still comes back — expiring the air is not losing the rocket.
    expect(loadSession()?.name).toBe("rocket.ork");

    // A stack that never touched the weather is unaffected, which is the ordinary session.
    const plainStep = { state: { edits: {}, weather: null, scenario: "design", simIndex: 0 }, label: "x", key: "x", at: 1 };
    localStorage.setItem(
      "loft.session",
      JSON.stringify({ ...session(), weatherAt: stale, history: { past: [plainStep], future: [] } }),
    );
    expect(loadSession()?.history?.past, "a weather-free stack must survive").toHaveLength(1);

    // No stamp at all is treated as stale, because an unstamped forecast has no age to check.
    localStorage.setItem(
      "loft.session",
      JSON.stringify({ ...session(), weather: plainConditions(conditions), scenario: "today" }),
    );
    expect(loadSession()?.weather).toBeUndefined();
  });

  it("strips the derived members from every step before writing", () => {
    // The read side rebuilds them, so writing the live form is not WRONG — it is dead weight, and
    // because one fetch is shared by reference across every step that followed it, the same dead
    // `Atmosphere` blob is written once per step. This is the write-side half of that contract, and
    // it sits beside the read-side half so the two cannot drift.
    const conditions = deriveConditions({
      place: "Somewhere",
      latitude: 32.9,
      longitude: -106.9,
      elevationMsl: 1400,
      tempC: 21,
      surfacePressurePa: 86_000,
      surfaceWindMps: 4,
      surfaceWindDirDeg: 270,
      aloft: [{ altitudeMsl: 1600, windMps: 6, windDirDeg: 280 }],
      aloftMatched: true,
    });
    const live = {
      past: [{ state: { edits: {}, weather: conditions, scenario: "today", simIndex: 0 }, label: "x", key: "x", at: 1 }],
      future: [],
    };
    const out = storableHistory(live);
    const w = (out.past[0] as { state: { weather: Record<string, unknown> } }).state.weather;
    expect(Object.keys(w), "the class instance must not be written").not.toContain("atmosphere");
    expect(Object.keys(w)).not.toContain("windProfile");
    expect(w.tempC, "and everything that is data survives").toBe(21);
    expect(JSON.stringify(out).length).toBeLessThan(JSON.stringify(live).length);

    // A step with no conditions comes through untouched, as null rather than absent.
    const bare = storableHistory({ past: [{ state: { edits: {}, weather: null, scenario: "design", simIndex: 0 }, label: "y", key: "y", at: 2 }], future: [] });
    expect((bare.past[0] as { state: { weather: unknown } }).state.weather).toBeNull();
  });

  it("expires on the fetch time it was given, not on the time it was written", () => {
    // The session is written on every edit and every resume, so a stamp taken at write time is
    // retaken continuously and the freshness rule measures nothing. This asserts the rule reads the
    // stamp it is HANDED — the app's side of that contract is a ref carried from the fetch.
    const stale = Date.now() - 90 * 60 * 1000;
    const conditions = deriveConditions({
      place: "P", latitude: 1, longitude: 2, elevationMsl: 100, tempC: 15,
      surfacePressurePa: 100_000, surfaceWindMps: 3, surfaceWindDirDeg: 90, aloft: [], aloftMatched: true,
    });
    // Written now, fetched 90 minutes ago: the write must not renew it.
    saveSession({ ...session(), weather: plainConditions(conditions), scenario: "today", weatherAt: stale });
    expect(loadSession()?.weather, "a write must not renew a stale fetch").toBeUndefined();

    // Same record, fetched 10 minutes ago: still this hour's.
    saveSession({ ...session(), weather: plainConditions(conditions), scenario: "today", weatherAt: Date.now() - 10 * 60 * 1000 });
    expect(loadSession()?.weather).toBeDefined();
    // And the stamp survives the read, so a resume can carry it rather than re-taking it.
    expect(loadSession()?.weatherAt).toBeGreaterThan(0);
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

describe("the discarded session", () => {
  const sess = (over: Partial<import("./session").SavedSession> = {}) => ({
    v: 1 as const,
    design: "AAEC",
    name: "a.ork",
    opensOn: "flight" as const,
    units: "metric" as const,
    simIndex: 0,
    edits: {},
    ...over,
  });

  it("holds the session that was thrown away, and hands it back intact", () => {
    // "Import another" is one click, from a text link 12 px from the design-name input, and it took
    // the design, every what-if on it and the session with no confirmation. On the 38 mm sample that
    // was a 75 mm fin span and 20 g of nose ballast — apogee 993 m -> 881 m — gone.
    const s = sess({ edits: { finSpan: 0.075, ballastKg: 0.02 }, simIndex: 2, units: "imperial", opensOn: "design" });
    saveDiscardedSession(s);
    expect(loadDiscardedSession()).toEqual(s);
  });

  it("is separate from the live session, so clearing one leaves the other", () => {
    // The whole point: reset() clears the live session and the discarded slot must survive it, or
    // there is nothing to pick back up.
    saveSession(sess({ name: "live.ork" }));
    saveDiscardedSession(sess({ name: "thrown-away.ork" }));
    clearSession();
    expect(loadSession()).toBeNull();
    expect(loadDiscardedSession()?.name).toBe("thrown-away.ork");
  });

  it("keeps exactly one level, replaced each time a design is left", () => {
    saveDiscardedSession(sess({ name: "first.ork" }));
    saveDiscardedSession(sess({ name: "second.ork" }));
    expect(loadDiscardedSession()?.name).toBe("second.ork");
    clearDiscardedSession();
    expect(loadDiscardedSession()).toBeNull();
  });

  it("reports whether it stored, so a way back is only offered when there is one", () => {
    // A design past the size cap is not kept — and the caller needs to know, because offering to
    // restore a session that was never written is a button that does nothing.
    expect(saveDiscardedSession(sess())).toBe(true);
    const huge = sess({ design: "A".repeat(1_500_001) });
    expect(saveDiscardedSession(huge)).toBe(false);
    // ...and the earlier slot is left alone rather than half-overwritten.
    expect(loadDiscardedSession()?.design).toBe("AAEC");
  });

  it("discards an unreadable or older-schema slot rather than half-reading it", () => {
    localStorage.setItem("loft.session.discarded", "{not json");
    expect(loadDiscardedSession()).toBeNull();
    localStorage.setItem("loft.session.discarded", JSON.stringify({ ...sess(), v: 0 }));
    expect(loadDiscardedSession()).toBeNull();
  });
});

describe("countWhatIfs", () => {
  const sess = (edits: Record<string, unknown>) => ({
    v: 1 as const,
    design: "AAEC",
    name: "a.ork",
    opensOn: "flight" as const,
    units: "metric" as const,
    simIndex: 0,
    edits,
  });

  it("counts the what-ifs a flyer actually set", () => {
    expect(countWhatIfs(sess({ finSpan: 0.075, ballastKg: 0.02 }))).toBe(2);
    expect(countWhatIfs(sess({}))).toBe(0);
  });

  it("does not count a field that was set and then cleared", () => {
    // The edit bag is a patch spread over the previous bag, so clearing a field leaves its key behind
    // holding undefined. Counting keys would tell a flyer an as-designed rocket carries changes.
    expect(countWhatIfs(sess({ finSpan: undefined, noseShape: "" }))).toBe(0);
    expect(countWhatIfs(sess({ finSpan: 0.075, ballastKg: undefined }))).toBe(1);
  });

  it("does not count a fin-set SELECTION as a change", () => {
    // finSetId says which fin set the fields are pointed at. The app's own hasActiveEdits excludes it
    // deliberately — counting it would badge a rocket that was only looked at.
    expect(countWhatIfs(sess({ finSetId: "10f70000-0000-0000-0000-000000000007" }))).toBe(0);
    expect(countWhatIfs(sess({ finSetId: "abc", finSpan: 0.075 }))).toBe(1);
  });
});

describe("the recent-designs shelf", () => {
  const put = (name: string, at: number, bytes = "AAEC") =>
    rememberRecent({ design: bytes, name, rocket: name.replace(/\..*$/, "") }, at);

  // A from-scratch build is serialised to bytes ONCE, before the first keystroke, and every edit after
  // that lives in the edit bag — so the row named the factory starter and reopening it lost the build
  // with no way back. Measured through the shipped UI: a starter edited to an 85 mm fin span flies
  // 930 m at 2.19 cal, and the shelf handed back 994 m at 1.53 cal, the untouched starter.
  it("brings a row up to date without leaving the stale one beside it", () => {
    const shelf = put("New design", 1000, "AAEC");
    const id = shelf[0].id;
    replaceRecent(id, { design: "AAECAwQF", name: "My build", rocket: "My build" }, 5000);
    const list = loadRecents();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("My build");
    expect(list[0].design).toBe("AAECAwQF");
  });

  // The id is `name:byteLength`, so an edited design mints a DIFFERENT id. A plain re-record would
  // therefore leave the original row standing — the same design on the shelf twice, at two different
  // moments in its life. This is the case that makes `replaceRecent` a function rather than a call to
  // `rememberRecent`.
  it("does not duplicate when the edit changes the design's byte length", () => {
    const shelf = put("New design", 1000, "AAEC");
    expect(shelf[0].id).toBe("New design:4");
    replaceRecent(shelf[0].id, { design: "AAECAwQFBgc", name: "New design", rocket: "New design" }, 5000);
    const list = loadRecents();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe("New design:11");
  });

  it("keeps the row where it was in time rather than jumping it to the front", () => {
    put("older.ork", 1000);
    const mine = put("mine.ork", 2000, "AAEC");
    put("newer.ork", 3000);
    expect(loadRecents().map((r) => r.name)).toEqual(["newer.ork", "mine.ork", "older.ork"]);
    // Refreshing what a row SAYS is not the flyer opening it again.
    replaceRecent(mine[0].id, { design: "AAECAwQF", name: "mine.ork", rocket: "mine" }, 9000);
    expect(loadRecents().map((r) => r.name)).toEqual(["newer.ork", "mine.ork", "older.ork"]);
  });

  it("leaves every other row alone", () => {
    put("a.ork", 1000);
    const b = put("b.ork", 2000, "AAEC");
    put("c.ork", 3000);
    replaceRecent(b[0].id, { design: "AAECAwQF", name: "b.ork", rocket: "b" }, 4000);
    const list = loadRecents();
    expect(list.map((r) => r.name)).toEqual(["c.ork", "b.ork", "a.ork"]);
    expect(list.find((r) => r.name === "a.ork")!.design).toBe("AAEC");
  });

  it("keeps designs newest-first and reopening one moves it back to the front", () => {
    put("a.ork", 1000);
    put("b.ork", 2000);
    expect(loadRecents().map((r) => r.name)).toEqual(["b.ork", "a.ork"]);
    put("a.ork", 3000);
    const list = loadRecents();
    expect(list.map((r) => r.name)).toEqual(["a.ork", "b.ork"]);
    expect(list.length).toBe(2); // reopened, not duplicated
  });

  it("holds a build's worth of designs and drops the least recently opened past that", () => {
    for (let i = 0; i < MAX_RECENTS + 3; i++) put(`d${i}.ork`, 1000 + i);
    const list = loadRecents();
    expect(list.length).toBe(MAX_RECENTS);
    expect(list[0].name).toBe(`d${MAX_RECENTS + 2}.ork`);
    expect(list.some((r) => r.name === "d0.ork")).toBe(false);
  });

  it("never lets history outgrow its storage budget", () => {
    const big = "A".repeat(1_000_000);
    for (let i = 0; i < 5; i++) put(`big${i}.ork`, 1000 + i, big);
    const list = loadRecents();
    expect(list.length).toBeGreaterThan(0);
    expect(list.reduce((n, r) => n + r.design.length, 0)).toBeLessThanOrEqual(2_500_000);
    expect(list[0].name).toBe("big4.ork"); // the newest is always kept
  });

  it("keeps a design too large for the shelf's whole budget rather than dropping everything", () => {
    put("huge.ork", 1000, "A".repeat(3_000_000));
    expect(loadRecents().map((r) => r.name)).toEqual(["huge.ork"]);
  });

  it("forgets one design without touching the rest, and can be cleared outright", () => {
    put("a.ork", 1000);
    put("b.ork", 2000);
    const id = loadRecents().find((r) => r.name === "a.ork")!.id;
    expect(forgetRecent(id).map((r) => r.name)).toEqual(["b.ork"]);
    clearRecents();
    expect(loadRecents()).toEqual([]);
  });

  it("puts a removed design back where it was, not at the front", () => {
    // The position matters: the shelf is a build's variants in the order they were last touched, and
    // an undo that returns a row to the front has rewritten the history it was meant to restore.
    put("a.ork", 1000);
    put("b.ork", 2000);
    put("c.ork", 3000);
    const b = loadRecents().find((r) => r.name === "b.ork")!;
    forgetRecent(b.id);
    expect(loadRecents().map((r) => r.name)).toEqual(["c.ork", "a.ork"]);
    expect(restoreRecent(b, 1)!.map((r) => r.name)).toEqual(["c.ork", "b.ork", "a.ork"]);
    // And it is the same design, byte for byte, not a re-derivation of it.
    expect(loadRecents().find((r) => r.name === "b.ork")).toEqual(b);
  });

  it("restores the LAST design, which is the case where the bytes are most likely the only copy", () => {
    put("only.ork", 1000);
    const only = loadRecents()[0];
    forgetRecent(only.id);
    expect(loadRecents()).toEqual([]);
    expect(restoreRecent(only, 0)).toEqual([only]);
  });

  it("takes back two removals in either order, and neither undoes the other", () => {
    // The natural sequence after a mis-tap. An earlier attempt at this undo held one pending removal,
    // so the second one silently destroyed the first design's only way back.
    put("a.ork", 1000);
    put("b.ork", 2000);
    put("c.ork", 3000);
    const a = loadRecents().find((r) => r.name === "a.ork")!;
    const c = loadRecents().find((r) => r.name === "c.ork")!;
    forgetRecent(a.id);
    forgetRecent(c.id);
    expect(loadRecents().map((r) => r.name)).toEqual(["b.ork"]);
    restoreRecent(c, 0);
    restoreRecent(a, 1);
    expect(loadRecents().map((r) => r.name)).toEqual(["c.ork", "b.ork", "a.ork"]);
  });

  it("refuses to put one back rather than evicting another design to make room", () => {
    // The rule the reverted attempt broke: it restored a middle row into a full shelf by replaying the
    // ADD path, which caps and evicts — so the undo for one deletion permanently performed another.
    for (let i = 0; i < MAX_RECENTS; i++) put(`d${i}.ork`, 1000 + i);
    const victim = loadRecents().find((r) => r.name === "d3.ork")!;
    forgetRecent(victim.id);
    // Another tab fills the space before the flyer presses "Put it back".
    put("interloper.ork", 9000);
    expect(loadRecents().length).toBe(MAX_RECENTS);
    expect(restoreRecent(victim, 4)).toBeNull();
    // Refused, and nothing moved: the shelf is exactly as it was.
    expect(loadRecents().length).toBe(MAX_RECENTS);
    expect(loadRecents().some((r) => r.name === "interloper.ork")).toBe(true);
    expect(loadRecents().some((r) => r.name === "d3.ork")).toBe(false);
  });

  it("refuses a restore that would push the shelf past its byte budget", () => {
    const big = "A".repeat(1_200_000);
    put("big0.ork", 1000, big);
    const b0 = loadRecents()[0];
    forgetRecent(b0.id);
    put("big1.ork", 2000, big);
    put("big2.ork", 3000, big);
    expect(restoreRecent(b0, 2)).toBeNull();
    expect(loadRecents().map((r) => r.name)).toEqual(["big2.ork", "big1.ork"]);
  });

  it("puts back a design larger than the whole shelf budget, which is the one it must never lose", () => {
    // The exemption `rememberRecent` already makes: a design too big for the shelf's byte budget is
    // KEPT when it is the only one. Without the same exemption on the way back, removing that design
    // was permanent — the one-way door this whole undo exists to close, rebuilt inside the fix.
    put("huge.ork", 1000, "A".repeat(3_000_000));
    const huge = loadRecents()[0];
    expect(loadRecents().map((r) => r.name)).toEqual(["huge.ork"]);
    forgetRecent(huge.id);
    expect(loadRecents()).toEqual([]);
    expect(restoreRecent(huge, 0)).toEqual([huge]);
  });

  it("puts a design back among rows opened in the same millisecond, not after them", () => {
    // A tie is ordinary on a fast or scripted sequence, and the shelf's sort is stable — so a restore
    // that appends lands after its tie-mates rather than back where it was.
    put("a.ork", 5000);
    put("b.ork", 5000);
    put("c.ork", 5000);
    const order = loadRecents().map((r) => r.name);
    const middle = loadRecents()[1];
    forgetRecent(middle.id);
    expect(restoreRecent(middle, 1)!.map((r) => r.name)).toEqual(order);
  });

  it("never replaces a design that is on the shelf with a stale copy of itself", () => {
    // `recentId` is name-plus-byte-length, so two different files can collide. A restore that
    // filtered the live row out and inserted the held one would be a deletion wearing an undo's
    // clothes — reachable from a second tab on the same origin.
    put("x.ork", 1000, "AAEC");
    const old = loadRecents()[0];
    forgetRecent(old.id);
    put("x.ork", 2000, "ZZZZ"); // same name, same length, different bytes
    const live = loadRecents()[0];
    expect(restoreRecent(old, 0)).toEqual([live]);
    expect(loadRecents()[0].design).toBe("ZZZZ");
    expect(loadRecents().length).toBe(1);
  });

  it("takes back two removals in the other order too", () => {
    put("a.ork", 1000);
    put("b.ork", 2000);
    put("c.ork", 3000);
    const a = loadRecents().find((r) => r.name === "a.ork")!;
    const c = loadRecents().find((r) => r.name === "c.ork")!;
    forgetRecent(a.id);
    forgetRecent(c.id);
    restoreRecent(a, 1); // oldest first this time
    restoreRecent(c, 0);
    expect(loadRecents().map((r) => r.name)).toEqual(["c.ork", "b.ork", "a.ork"]);
  });

  it("survives unreadable storage rather than throwing at the caller", () => {
    localStorage.setItem("loft.recents", "{not json");
    expect(loadRecents()).toEqual([]);
    localStorage.setItem("loft.recents", JSON.stringify([{ name: "x" }, null, 7]));
    expect(loadRecents()).toEqual([]);
  });
});

describe("an emptied removal list is not a what-if", () => {
  const sess = (edits: Record<string, unknown>): import("./session").SavedSession => ({
    v: 1,
    design: "AAEC",
    name: "a.ork",
    opensOn: "flight",
    units: "metric",
    simIndex: 0,
    edits,
  });

  it("counts a design restored to pristine as unedited", () => {
    // Undoing the last removal leaves `removedIds: []`, and a bare `v !== undefined && v !== ""` test says
    // an empty array is a value — so the design read as edited after being restored to pristine, which
    // withholds the stored-tool comparison and hides the button that brings it back. The model's own
    // `hasGeometryEdits` already required a non-empty list; the two answering differently is the drift a
    // single shared definition exists to prevent.
    expect(countWhatIfs(sess({ removedIds: [] }))).toBe(0);
    expect(countWhatIfs(sess({ removedIds: ["some-component"] }))).toBe(1);
  });
});

describe("a workspace that has been retired", () => {
  it("resumes a session on whichever workspace took the retired one's job", () => {
    // `analyze` was split into `sweep` and `validate` on 2026-08-02. Without this mapping a stored
    // session naming it falls through the unknown-name guard to `flight` — which does not fail
    // anything, and silently returns every returning flyer to a workspace they were not on.
    expect(resolveWorkspace("analyze")).toBe("sweep");
    localStorage.setItem(
      "loft.session",
      JSON.stringify({ v: 1, design: "AA==", name: "x", opensOn: "analyze", units: "metric", simIndex: 0, edits: {} }),
    );
    expect(loadSession()?.opensOn).toBe("sweep");
  });

  it("still refuses a name that means nothing, rather than inventing a route for it", () => {
    expect(resolveWorkspace("nonsense")).toBeNull();
    expect(resolveWorkspace("")).toBeNull();
    expect(resolveWorkspace(undefined)).toBeNull();
  });

  it("passes a live workspace through untouched", () => {
    for (const w of WORKSPACES) expect(resolveWorkspace(w)).toBe(w);
  });
});

describe("the finished dispersion slot", () => {
  beforeEach(() => {
    clearDispersion();
  });

  it("gives an entry back only under the key it was filed with", () => {
    expect(saveDispersion({ designId: "d1", runKey: "k1", result: { n: 3 }, at: 1 })).toBe(true);
    const got = loadDispersion();
    expect(got?.runKey).toBe("k1");
    expect(got?.designId).toBe("d1");
    // The caller compares; this module only ever hands back what it stored, verbatim.
    expect((got?.result as { n: number }).n).toBe(3);
  });

  it("refuses a record that is not one, rather than handing back half of it", () => {
    localStorage.setItem("loft.dispersion", "{not json");
    expect(loadDispersion()).toBeNull();
    localStorage.setItem("loft.dispersion", JSON.stringify({ v: 2, designId: "d", runKey: "k", result: {} }));
    expect(loadDispersion(), "a future schema is discarded, never half-read").toBeNull();
    localStorage.setItem("loft.dispersion", JSON.stringify({ v: 1, designId: "", runKey: "k", result: {} }));
    expect(loadDispersion(), "an entry with no design is not filed against anything").toBeNull();
    localStorage.setItem("loft.dispersion", JSON.stringify({ v: 1, designId: "d", runKey: "k", result: null }));
    expect(loadDispersion()).toBeNull();
  });

  it("is cleared by the destructive act, and by a write that could not fit", () => {
    saveDispersion({ designId: "d1", runKey: "k1", result: { n: 1 }, at: 1 });
    clearDispersion();
    expect(loadDispersion()).toBeNull();
  });
});

describe("designFingerprint", () => {
  it("is stable for the same design and different for a changed one", () => {
    const a = designFingerprint("rocket.ork", "AAAABBBB");
    expect(designFingerprint("rocket.ork", "AAAABBBB")).toBe(a);
    // A different name, a different length, and the same length with different CONTENT all differ —
    // the last is the one a name-and-size id could not tell apart, and it is the case that would
    // restore one design's dispersion onto another.
    expect(designFingerprint("other.ork", "AAAABBBB")).not.toBe(a);
    expect(designFingerprint("rocket.ork", "AAAABBBBC")).not.toBe(a);
    expect(designFingerprint("rocket.ork", "BBBBAAAA")).not.toBe(a);
  });

  it("does not collide across the whole real corpus of stored designs", () => {
    // Cheap sanity over many distinct byte strings of the same length — the collision that matters
    // is same-name-same-length, which is exactly what the hash is carried for.
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(designFingerprint("d.ork", `payload-${i}-pad`.padEnd(40, "x")));
    expect(seen.size).toBe(5000);
  });
});
