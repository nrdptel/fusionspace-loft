import { describe, it, expect } from "vitest";
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
