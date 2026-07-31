import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  toBase64,
  fromBase64,
  loadSession,
  saveSession,
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
