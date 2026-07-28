/** The main-thread half of the RocketPy second solver: one warm worker shared across runs, and what
 *  happens to it when a run is stopped.
 *
 *  The stop semantics are the reason this file exists. A stop that merely stopped LISTENING would
 *  look right and be wrong — the abandoned flight would keep the worker's single run chain busy and
 *  the next run would sit at "Preparing…" until it finished, with nothing on screen to explain it.
 *  So the assertions below are about the worker being genuinely gone, and about the run after a stop
 *  starting from a fresh one. */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { RocketpySpec } from "./rocketpy-spec";

/** Stand-in for the module worker: records what it was posted, lets a test answer on its behalf, and
 *  — the point of these tests — records whether it was terminated. */
class FakeWorker {
  static built: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  readonly posted: { id: number }[] = [];

  constructor(readonly url: string | URL) {
    FakeWorker.built.push(this);
  }
  postMessage(m: { id: number }): void {
    this.posted.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Reply as the worker would, echoing a run's id. */
  reply(id: number, msg: Record<string, unknown>): void {
    this.onmessage?.({ data: { id, ...msg } } as MessageEvent);
  }
  crash(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

/** The engine keeps module-level state (the shared worker), so each test gets its own copy. */
async function freshEngine() {
  FakeWorker.built = [];
  vi.resetModules();
  (globalThis as { Worker?: unknown }).Worker = FakeWorker;
  return import("./rocketpy-engine");
}

const only = () => {
  expect(FakeWorker.built).toHaveLength(1);
  return FakeWorker.built[0];
};

/** The engine never inspects the spec — it forwards it — so an empty one is enough. */
const SPEC = {} as RocketpySpec;
const RESULT = {
  apogee: 994,
  maxVelocity: 180,
  maxMach: 0.53,
  timeToApogee: 13.7,
  railExitVelocity: 22,
  staticMarginLiftoff: 2.1,
};

/** Let the microtask queue drain, so a postMessage's listener registration has happened. */
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  delete (globalThis as { Worker?: unknown }).Worker;
});

describe("runRocketpy", () => {
  it("flies a spec and resolves with the worker's result, reporting each stage on the way", async () => {
    const { runRocketpy } = await freshEngine();
    const stages: string[] = [];
    const p = runRocketpy(SPEC, { onProgress: (s) => stages.push(s) });
    await settle();
    const w = only();
    const { id } = w.posted[0];
    w.reply(id, { type: "progress", stage: "Loading the Python runtime…" });
    w.reply(id, { type: "progress", stage: "Flying in RocketPy…" });
    w.reply(id, { type: "result", result: RESULT });
    await expect(p).resolves.toEqual(RESULT);
    expect(stages).toEqual(["Loading the Python runtime…", "Flying in RocketPy…"]);
  });

  it("keeps ONE worker warm across runs, so only the first pays the boot", async () => {
    const { runRocketpy } = await freshEngine();
    const first = runRocketpy(SPEC);
    await settle();
    const w = only();
    w.reply(w.posted[0].id, { type: "result", result: RESULT });
    await first;

    const second = runRocketpy(SPEC);
    await settle();
    expect(FakeWorker.built, "a second run must not build a second worker").toHaveLength(1);
    expect(w.posted).toHaveLength(2);
    expect(w.posted[1].id, "each run carries its own id so replies can be matched").not.toBe(w.posted[0].id);
    w.reply(w.posted[1].id, { type: "result", result: RESULT });
    await expect(second).resolves.toEqual(RESULT);
  });

  it("surfaces a run's own failure without taking the warm worker down with it", async () => {
    const { runRocketpy } = await freshEngine();
    const p = runRocketpy(SPEC);
    await settle();
    const w = only();
    w.reply(w.posted[0].id, { type: "error", message: "ZeroDivisionError: division by zero" });
    await expect(p).rejects.toThrow("ZeroDivisionError");
    // A flight that RocketPy refused is local to that flight; the runtime is still good.
    expect(w.terminated, "a flight failure must not cost the boot").toBe(false);
  });

  describe("stopping a run", () => {
    it("ends the runtime rather than just the wait", async () => {
      const { runRocketpy } = await freshEngine();
      const ctl = new AbortController();
      const p = runRocketpy(SPEC, { signal: ctl.signal });
      await settle();
      const w = only();

      ctl.abort();
      await expect(p).rejects.toMatchObject({ name: "AbortError" });
      // The assertion this whole file is for: Pyodide cannot be interrupted mid-run, so the only
      // honest stop is the worker going away.
      expect(w.terminated, "a stop that leaves the worker running is not a stop").toBe(true);
    });

    it("gives the next run a fresh runtime instead of queueing it behind the abandoned flight", async () => {
      const { runRocketpy } = await freshEngine();
      const ctl = new AbortController();
      const stopped = runRocketpy(SPEC, { signal: ctl.signal });
      await settle();
      ctl.abort();
      await expect(stopped).rejects.toMatchObject({ name: "AbortError" });

      const next = runRocketpy(SPEC);
      await settle();
      expect(FakeWorker.built, "the run after a stop must build a new worker").toHaveLength(2);
      const w2 = FakeWorker.built[1];
      expect(w2.terminated).toBe(false);
      expect(w2.posted, "the new run reaches the new worker, not the dead one").toHaveLength(1);
      w2.reply(w2.posted[0].id, { type: "result", result: RESULT });
      await expect(next).resolves.toEqual(RESULT);
    });

    it("tells a run that was queued behind the stopped one, rather than leaving it hanging", async () => {
      const { runRocketpy } = await freshEngine();
      const ctl = new AbortController();
      const stopped = runRocketpy(SPEC, { signal: ctl.signal });
      const queued = runRocketpy(SPEC);
      await settle();

      ctl.abort();
      await expect(stopped).rejects.toMatchObject({ name: "AbortError" });
      // It cannot be delivered — the runtime that would have flown it is gone — so it is rejected
      // with the reason, not with a bare abort it never asked for.
      await expect(queued).rejects.toThrow(/runtime was stopped/);
    });

    it("never starts a worker for a signal that was already aborted", async () => {
      const { runRocketpy } = await freshEngine();
      await expect(runRocketpy(SPEC, { signal: AbortSignal.abort() })).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(FakeWorker.built, "no boot for a run that was over before it began").toHaveLength(0);
    });

    it("ignores an abort that arrives after the result has landed", async () => {
      const { runRocketpy } = await freshEngine();
      const ctl = new AbortController();
      const p = runRocketpy(SPEC, { signal: ctl.signal });
      await settle();
      const w = only();
      w.reply(w.posted[0].id, { type: "result", result: RESULT });
      await expect(p).resolves.toEqual(RESULT);

      ctl.abort();
      expect(w.terminated, "a late abort must not cost the next run its warm runtime").toBe(false);
    });
  });

  it("fails every run in flight when the worker crashes, and rebuilds on the next call", async () => {
    const { runRocketpy } = await freshEngine();
    const a = runRocketpy(SPEC);
    const b = runRocketpy(SPEC);
    await settle();
    const w = only();

    w.crash("out of memory");
    await expect(a).rejects.toThrow("out of memory");
    await expect(b).rejects.toThrow("out of memory");
    expect(w.terminated).toBe(true);

    const c = runRocketpy(SPEC);
    await settle();
    expect(FakeWorker.built).toHaveLength(2);
    const w2 = FakeWorker.built[1];
    w2.reply(w2.posted[0].id, { type: "result", result: RESULT });
    await expect(c).resolves.toEqual(RESULT);
  });
});
