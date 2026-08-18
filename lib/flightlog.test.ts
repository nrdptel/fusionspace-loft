import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFlightLog } from "./flightlog";

describe("parseFlightLog", () => {
  it("reads a Featherweight-style header with feet, naming the unit", () => {
    const csv = ["Time (s),Altitude (ft),Velocity (ft/s)", "0.0,0,0", "1.0,250,300", "2.0,600,250", "10.0,1800,-40"].join(
      "\n",
    );
    const log = parseFlightLog(csv);
    expect(log.unitHint).toBe("ft");
    expect(log.points).toHaveLength(4);
    expect(log.points[0]).toEqual({ t: 0, altitude: 0 });
    expect(log.points[2]).toEqual({ t: 2, altitude: 600 });
    // The velocity column comes through too, with its own unit.
    expect(log.speed?.unitHint).toBe("ft/s");
    expect(log.speed?.points).toHaveLength(4);
    expect(log.speed?.points[1]).toEqual({ t: 1, v: 300 });
  });

  it("reads a velocity column in mph and leaves speed null when there is none", () => {
    const withSpeed = parseFlightLog(["Time,Altitude (m),Speed (mph)", "0,0,0", "1,120,140", "2,300,120"].join("\n"));
    expect(withSpeed.speed?.unitHint).toBe("mph");
    expect(withSpeed.speed?.points[2]).toEqual({ t: 2, v: 120 });

    const baroOnly = parseFlightLog(["Time (s),Altitude (m)", "0,0", "1,120", "2,300"].join("\n"));
    expect(baroOnly.speed).toBeNull();
  });

  it("reads metres and matches the column by name in any order", () => {
    const csv = ["Height (m),Flight Time", "0,0.0", "120,2.5", "300,6.0"].join("\r\n");
    const log = parseFlightLog(csv);
    expect(log.unitHint).toBe("m");
    expect(log.points).toHaveLength(3);
    expect(log.points[1]).toEqual({ t: 2.5, altitude: 120 });
  });

  it("skips a metadata preamble above the header row", () => {
    const csv = ["Eggtimer Quantum flight log", "Serial 12345, 2026-07-24", "", "Time,Altitude", "0,0", "0.5,40", "1.0,110"].join(
      "\n",
    );
    const log = parseFlightLog(csv);
    expect(log.unitHint).toBeNull(); // no unit named
    expect(log.points).toHaveLength(3);
    expect(log.points[2]).toEqual({ t: 1, altitude: 110 });
  });

  it("handles a tab-delimited export and AGL naming", () => {
    const csv = ["T\tAGL", "0\t0", "1\t90", "2\t210"].join("\n");
    const log = parseFlightLog(csv);
    expect(log.points).toHaveLength(3);
    expect(log.points[2]).toEqual({ t: 2, altitude: 210 });
  });

  it("drops non-numeric rows but keeps the numeric flight", () => {
    const csv = ["Time (s),Altitude (ft)", "0,0", "note,note", "1,120", ",", "2,300"].join("\n");
    const log = parseFlightLog(csv);
    expect(log.points).toEqual([
      { t: 0, altitude: 0 },
      { t: 1, altitude: 120 },
      { t: 2, altitude: 300 },
    ]);
  });

  it("throws a helpful error when no altitude column is present", () => {
    const csv = ["Time (s),Velocity (m/s)", "0,0", "1,300"].join("\n");
    expect(() => parseFlightLog(csv)).toThrow(/altitude column/i);
  });

  it("throws when the columns are found but no numeric rows follow", () => {
    const csv = ["Time,Altitude", "n/a,n/a"].join("\n");
    expect(() => parseFlightLog(csv)).toThrow(/numeric/i);
  });
});

describe("the picker offers what the parser can read", () => {
  /** **A file-picker `accept` list narrower than the parser is a refusal the OS dialog makes on the
   *  parser's behalf, and a wrong one.** `parseFlightLog` tries a comma AND a tab, so a
   *  tab-separated altimeter export reads perfectly well — and `components/ResultsView.tsx` offered
   *  `.csv,.txt,text/csv,text/plain` until 2026-08-18, which hides it before the app ever sees it.
   *
   *  Asserted from the source text because the two live in different files with nothing else holding
   *  them together: the parser's delimiter list is the contract and the `accept` list is the promise
   *  about it. Read as a pair, so widening one and forgetting the other fails here rather than in a
   *  bug report from someone whose altimeter writes tabs. */
  const src = readFileSync(resolve(process.cwd(), "components", "ResultsView.tsx"), "utf8");
  const accept = src.match(/accept="([^"]+)"/)?.[1] ?? "";

  it("offers every delimiter the parser tries", () => {
    expect(accept, "no accept list found in ResultsView.tsx").not.toBe("");
    // The parser reads a tab-separated file...
    const tsv = ["Time (s)\tAltitude (ft)", "0\t0", "1\t120"].join("\n");
    expect(parseFlightLog(tsv).points).toHaveLength(2);
    // ...so the picker has to offer one.
    expect(accept, `the parser reads tab-separated files and the picker offers: ${accept}`).toContain(".tsv");
    // ...and the comma case, which is the one that was never in doubt.
    const csv = ["Time (s),Altitude (ft)", "0,0", "1,120"].join("\n");
    expect(parseFlightLog(csv).points).toHaveLength(2);
    expect(accept).toContain(".csv");
  });

  it("names the file kind rather than one of its formats, where a screen reader hears it", () => {
    // "Flight log CSV" was the accessible name while `accept` took a `.tsv` too — the same defect the
    // widening fixed, one layer up, and the only place a screen-reader user hears what the control
    // takes.
    expect(src).toContain('aria-label="Flight log file"');
    expect(src).not.toContain('aria-label="Flight log CSV"');
  });
});
