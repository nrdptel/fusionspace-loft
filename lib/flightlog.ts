/** Parse an uploaded flight log — a rocket altimeter's CSV export — into time/altitude points, so a
 *  flyer can overlay their real flight on Loft's predicted altitude curve. That closes the loop the
 *  whole tool is built around: predict, fly, then compare the estimate against what actually happened,
 *  entirely in the browser (the file never leaves the device).
 *
 *  Altimeter exports vary (Eggtimer, Featherweight, PerfectFlite, Jolly Logic, …), but the common
 *  shape is a header row naming the columns followed by numeric data rows — sometimes after a few
 *  metadata lines. This reads that common case: find a time column and an altitude column by name,
 *  then take the finite numeric rows. It is deliberately unit-agnostic — it returns the raw altitude
 *  numbers plus any unit the header names, and lets the caller decide metres vs feet — and it reports
 *  what it could not read rather than guessing a wrong curve onto the plot. */

export type LogUnit = "m" | "ft";
/** The speed units altimeters export. Detected from the header when named; the caller can override. */
export type LogSpeedUnit = "m/s" | "ft/s" | "mph" | "km/h";

export interface FlightLogPoint {
  /** Seconds, as recorded (not re-zeroed). */
  t: number;
  /** Altitude in the log's own unit (see `unitHint`); the caller converts. */
  altitude: number;
}

export interface FlightLogSpeedPoint {
  t: number;
  /** Speed in the log's own unit (see `speedUnitHint`); the caller converts. */
  v: number;
}

export interface FlightLog {
  points: FlightLogPoint[];
  /** Unit named in the altitude column header ("ft"/"m"), or null when the file doesn't say. */
  unitHint: LogUnit | null;
  /** The velocity/speed column when the log carries one — many accel-based altimeters do — else null.
   *  Optional: a bare-altitude baro log parses exactly as before, with this absent. */
  speed: { points: FlightLogSpeedPoint[]; unitHint: LogSpeedUnit | null } | null;
}

/** A header cell that names the elapsed-time column. Matches "Time", "Flight Time", "Time (s)",
 *  "Seconds", "Elapsed", and a bare "T" — but not an arbitrary word that merely starts with t. */
function isTimeHeader(cell: string): boolean {
  const c = cell.trim().toLowerCase();
  return /time|elapsed|second/.test(c) || c === "t" || /^t\s*[([]/.test(c);
}

/** A header cell that names the altitude column: "Altitude", "Alt (ft)", "Height", "AGL". */
function isAltitudeHeader(cell: string): boolean {
  const c = cell.trim().toLowerCase();
  return /alt|height|\bagl\b/.test(c);
}

/** A header cell that names a velocity/speed column: "Velocity", "Speed", "Vel (ft/s)". */
function isSpeedHeader(cell: string): boolean {
  const c = cell.trim().toLowerCase();
  return /veloc|speed|\bvel\b/.test(c);
}

/** The unit named in an altitude header cell, if any. Feet win over metres when both somehow appear,
 *  since "ft"/"feet" is unambiguous while a stray "m" is easy to hit. */
function unitOf(cell: string): LogUnit | null {
  const c = cell.toLowerCase();
  if (/\bft\b|feet|\(ft\)/.test(c)) return "ft";
  if (/\bm\b|meter|metre|\(m\)/.test(c)) return "m";
  return null;
}

/** The speed unit named in a velocity header cell, if any. The compound units (ft/s, m/s, km/h) are
 *  tested before the bare-length fallbacks so "ft/s" isn't mistaken for plain feet. */
function speedUnitOf(cell: string): LogSpeedUnit | null {
  const c = cell.toLowerCase();
  if (/ft\/?s|fps|feet\s*\/\s*s/.test(c)) return "ft/s";
  if (/m\/?s|meters?\s*\/\s*s|metres?\s*\/\s*s|mps/.test(c)) return "m/s";
  if (/mph|mi\/?h/.test(c)) return "mph";
  if (/km\/?h|kph|kmh/.test(c)) return "km/h";
  return null;
}

/** Split one CSV line on commas or tabs (whichever the header used), trimming surrounding quotes and
 *  whitespace. Altimeter exports are plain delimited text — no embedded-comma quoting to speak of. */
function splitRow(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((s) => s.trim().replace(/^"|"$/g, ""));
}

/** Parse an altimeter CSV. Throws with a plain-language reason when it can't find a time and an
 *  altitude column, or when no numeric rows follow them — so the UI can tell the flyer what's needed
 *  instead of drawing a wrong or empty curve. */
export function parseFlightLog(text: string): FlightLog {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("The file has no data rows.");

  // Find the header row (and its delimiter): the first line whose cells name both a time and an
  // altitude column. Scanning past any metadata preamble the altimeter wrote above the table.
  let headerIdx = -1;
  let delimiter = ",";
  let timeIdx = -1;
  let altIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    for (const d of [",", "\t"]) {
      const cells = splitRow(lines[i], d);
      if (cells.length < 2) continue;
      const t = cells.findIndex(isTimeHeader);
      const a = cells.findIndex(isAltitudeHeader);
      if (t >= 0 && a >= 0 && t !== a) {
        headerIdx = i;
        delimiter = d;
        timeIdx = t;
        altIdx = a;
        break;
      }
    }
    if (headerIdx >= 0) break;
  }
  if (headerIdx < 0) {
    throw new Error(
      "Couldn't find a time and an altitude column. Export a CSV whose header names them " +
        "(e.g. “Time (s), Altitude (ft)”).",
    );
  }

  const headerCells = splitRow(lines[headerIdx], delimiter);
  const unitHint = unitOf(headerCells[altIdx]);
  // An optional velocity column, if the header names one that isn't the altitude column.
  const speedIdx = headerCells.findIndex((c, i) => i !== timeIdx && i !== altIdx && isSpeedHeader(c));
  const speedUnitHint = speedIdx >= 0 ? speedUnitOf(headerCells[speedIdx]) : null;

  const points: FlightLogPoint[] = [];
  const speedPoints: FlightLogSpeedPoint[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i], delimiter);
    // An empty cell is `Number("") === 0`, not NaN, so guard it explicitly — otherwise a blank line
    // (a trailing separator, a gap between passes) would inject a spurious (0, 0) point.
    const tRaw = cells[timeIdx];
    const aRaw = cells[altIdx];
    if (!tRaw || !aRaw) continue;
    const t = Number(tRaw);
    const altitude = Number(aRaw);
    if (!Number.isFinite(t) || !Number.isFinite(altitude)) continue;
    points.push({ t, altitude });
    if (speedIdx >= 0) {
      const vRaw = cells[speedIdx];
      const v = vRaw ? Number(vRaw) : NaN;
      if (Number.isFinite(v)) speedPoints.push({ t, v });
    }
  }
  if (points.length < 2) throw new Error("Found the columns, but no numeric time/altitude rows under them.");

  const speed = speedPoints.length > 1 ? { points: speedPoints, unitHint: speedUnitHint } : null;
  return { points, unitHint, speed };
}
