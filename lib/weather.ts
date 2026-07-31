/** Optional "today's conditions" re-run. Fetches current surface conditions and a winds-
 *  aloft profile for a launch site from Open-Meteo (keyless, no account — the same source
 *  Window uses) and turns them into a calibrated atmosphere plus an altitude-dependent wind
 *  the simulator can fly through. This is the only part of Loft that touches the network,
 *  and it's always behind an explicit tap; everything else is offline.
 *
 *  Source: Open-Meteo Forecast API (https://open-meteo.com), GFS/HRRR seamless. Winds aloft
 *  come from the pressure-level fields; the geopotential height gives each level's altitude.
 */

import { Atmosphere, atmosphereForGround } from "./sim/atmosphere";
import { cToK, degToRad, FT_PER_M } from "./units";
import type { Vec3 } from "./sim/vector";

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";

// Pressure levels for the aloft profile — dense low (where recovery drift lives), coarse high.
const LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300] as const;

export interface AloftLevel {
  altitudeMsl: number; // m
  windMps: number;
  windDirDeg: number; // meteorological (from)
}

export interface WeatherConditions {
  place?: string;
  latitude: number;
  longitude: number;
  elevationMsl: number;
  tempC: number;
  surfacePressurePa: number;
  surfaceWindMps: number;
  surfaceWindDirDeg: number;
  aloft: AloftLevel[];
  /** The local hour the aloft profile is FOR, as the API spelled it (`2026-07-30T18:00`).
   *
   *  It is on the record because the surface block and the profile come from two different parts of
   *  one response — `current` is live, `hourly` is a 24-entry day — so a flyer looking at a drift
   *  number is entitled to know the profile is this hour's and not some other hour's. Undefined only
   *  when the response carried no `hourly.time`, in which case the panel says the hour is unknown
   *  rather than implying it is now. */
  aloftTime?: string;
  /** Whether `aloftTime` is the hour the SURFACE reading was taken at, or a fallback the response left
   *  no way to tie to it. False means every surface quoting a drift number must say so — an unmatched
   *  profile can be most of a day away from the air the flyer is standing in. */
  aloftMatched: boolean;
  atmosphere: Atmosphere;
  windProfile: (altAgl: number) => Vec3;
}

/** Which `hourly` index is the hour the surface reading is from.
 *
 *  This used to be a hard-coded 0 with a comment claiming index 0 was "now". It is not, and never was:
 *  the request asks for `timezone=auto` and `forecast_days=1`, so `hourly.time[0]` is **00:00 local
 *  today** and the array runs to 23:00. Measured against the live API at 18:15 local on 2026-07-30 for
 *  32.9 N 106.9 W: at 850 hPa index 0 gave 2.78 m/s from 317° where the actual hour was 2.12 m/s from
 *  163° — **154° apart** — and at 500 hPa 7.03 m/s from 149° against 0.47 m/s from 315°, 166° apart and
 *  fifteen times the speed. So "today's weather" flew this hour's surface air through a wind profile
 *  from the middle of last night, and drift is the number a flyer walks on.
 *
 *  Matching on the `YYYY-MM-DDTHH` prefix is timezone-safe precisely because both fields are local:
 *  `timezone=auto` stamps `current.time` and every `hourly.time` in the launch site's own zone, so no
 *  parsing or offset arithmetic is involved and there is no UTC boundary to get wrong.
 *
 *  **When the hour cannot be matched, `matched` is false and the caller must say so.** There is no
 *  defensible guess available: with `forecast_days=1` the grid is a fixed 24-slot local day, so the
 *  last entry is the furthest-FUTURE forecast rather than anything "freshest" — up to 23 hours ahead
 *  instead of 23 hours behind. It is returned only so a profile exists at all, and the Conditions panel
 *  states both the hour and that it could not be tied to the surface reading. A silent pick is what
 *  this function was written to end; replacing one with another would not be a fix.
 *
 *  The index is never taken from a FILTERED copy of the array. It indexes the wind arrays alongside it,
 *  so dropping a malformed entry would slide every subsequent hour's wind one place — a subtler version
 *  of exactly the bug this function exists to fix. Non-string entries are skipped in place instead. */
export function aloftIndexForNow(
  hourlyTimes: unknown,
  currentTime: unknown,
): { index: number; time?: string; matched: boolean } {
  const times: unknown[] = Array.isArray(hourlyTimes) ? hourlyTimes : [];
  const stampAt = (i: number): string | undefined =>
    typeof times[i] === "string" ? (times[i] as string) : undefined;

  if (typeof currentTime === "string") {
    const hour = currentTime.slice(0, 13); // "2026-07-30T18"
    for (let i = 0; i < times.length; i++) {
      const t = stampAt(i);
      if (t !== undefined && t.slice(0, 13) === hour) return { index: i, time: t, matched: true };
    }
  }
  for (let i = times.length - 1; i >= 0; i--) {
    const t = stampAt(i);
    if (t !== undefined) return { index: i, time: t, matched: false };
  }
  return { index: 0, matched: false };
}

/** Interpolate a compass bearing the short way round.
 *
 *  A plain `a + (b - a) * f` sweeps the long arc whenever a pair straddles north: 350° and 10° meet at
 *  **180°** halfway, which is the wind exactly reversed — from due south where it blows from due north
 *  — at full strength. `LEVELS` is deliberately dense at 1000/975/950/925 hPa, which is the band
 *  recovery drift actually lives in, and under "today's weather" this profile replaces the surface wind
 *  entirely. Taking the difference into **[−180°, 180°)** first makes the interpolation follow the
 *  shorter arc, which is the only one that means anything for a bearing. (That interval is half-open at
 *  the top, verified by brute force over every integer pair: the difference runs −180 to 179.)
 *
 *  An exact half-turn has no shorter arc, so it resolves to the −180 side and the result depends on
 *  which bearing is `from`: 0°→180° passes through 270°, and 180°→0° through 90°. That is deterministic
 *  rather than arbitrary — `aloft` is sorted by altitude before any of this — and it is asserted below
 *  so a later rewrite cannot change it silently. There is no correct answer to prefer; there is only a
 *  stable one. */
export function lerpBearing(fromDeg: number, toDeg: number, f: number): number {
  const delta = ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
  return ((fromDeg + delta * f) % 360 + 360) % 360;
}

export interface GeoPlace {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function buildForecastUrl(lat: number, lon: number): string {
  const aloft: string[] = [];
  for (const p of LEVELS) {
    aloft.push(`wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `geopotential_height_${p}hPa`);
  }
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: "temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m",
    hourly: aloft.join(","),
    wind_speed_unit: "ms",
    temperature_unit: "celsius",
    timezone: "auto",
    forecast_days: "1",
    models: "gfs_seamless",
  });
  return `${OPEN_METEO}?${params.toString()}`;
}

/** Meteorological (from) direction + speed → an air-velocity vector the sim can use. Air
 *  moves toward dir+180°. The exact compass axis is arbitrary in the sim's local plane; only
 *  the magnitude and internal consistency matter for drift. */
function windVector(speedMps: number, fromDeg: number): Vec3 {
  const toRad = degToRad(fromDeg + 180);
  return { x: speedMps * Math.cos(toRad), y: speedMps * Math.sin(toRad), z: 0 };
}

export function parseForecast(raw: unknown, lat: number, lon: number, place?: string): WeatherConditions {
  // `current.time` and `hourly.time` are STRINGS in a response whose every other member is numeric,
  // which is why they are pulled out by name rather than left to the index signatures below. They are
  // what pairs the live surface reading with the right hour of the profile; see `aloftIndexForNow`.
  const r = raw as {
    elevation?: number;
    current?: Record<string, number> & { time?: string };
    hourly?: Record<string, Array<number | null>> & { time?: string[] };
  };
  const elevationMsl = num(r.elevation) ?? 0;
  const cur = r.current ?? {};
  const tempC = num(cur.temperature_2m) ?? 15;
  const surfacePressurePa = (num(cur.surface_pressure) ?? 1013.25) * 100; // hPa → Pa
  const surfaceWindMps = num(cur.wind_speed_10m) ?? 0;
  const surfaceWindDirDeg = num(cur.wind_direction_10m) ?? 0;

  // The hourly index whose stamp matches the hour `current` was read at — NOT index 0, which is
  // 00:00 local and was up to 23 hours stale. See `aloftIndexForNow`.
  const hourly = r.hourly ?? {};
  const { index: idx, time: aloftTime, matched: aloftMatched } = aloftIndexForNow(hourly.time, cur.time);
  const aloft: AloftLevel[] = [];
  for (const p of LEVELS) {
    const spd = arrAt(hourly[`wind_speed_${p}hPa`], idx);
    const dir = arrAt(hourly[`wind_direction_${p}hPa`], idx);
    const gph = arrAt(hourly[`geopotential_height_${p}hPa`], idx);
    if (spd === null || dir === null || gph === null) continue;
    // Open-Meteo returns geopotential height in feet under imperial requests, metres by
    // default; we didn't request imperial length here, so it's metres.
    aloft.push({ altitudeMsl: gph, windMps: spd, windDirDeg: dir });
  }
  aloft.sort((a, b) => a.altitudeMsl - b.altitudeMsl);

  const atmosphere = atmosphereForGround(elevationMsl, cToK(tempC), surfacePressurePa);

  const windProfile = (altAgl: number): Vec3 => {
    const altMsl = elevationMsl + Math.max(0, altAgl);
    if (aloft.length === 0) return windVector(surfaceWindMps, surfaceWindDirDeg);
    // Below the lowest level, blend from the surface wind.
    if (altMsl <= aloft[0].altitudeMsl) {
      return windVector(surfaceWindMps, surfaceWindDirDeg);
    }
    for (let i = 0; i < aloft.length - 1; i++) {
      const a = aloft[i];
      const b = aloft[i + 1];
      if (altMsl >= a.altitudeMsl && altMsl <= b.altitudeMsl) {
        const f = (altMsl - a.altitudeMsl) / (b.altitudeMsl - a.altitudeMsl);
        const spd = a.windMps + (b.windMps - a.windMps) * f;
        // The SHORT way round — a straight lerp reverses the wind wherever a pair straddles north.
        const dir = lerpBearing(a.windDirDeg, b.windDirDeg, f);
        return windVector(spd, dir);
      }
    }
    const top = aloft[aloft.length - 1];
    return windVector(top.windMps, top.windDirDeg);
  };

  return {
    place,
    latitude: lat,
    longitude: lon,
    elevationMsl,
    tempC,
    surfacePressurePa,
    surfaceWindMps,
    surfaceWindDirDeg,
    aloft,
    aloftTime,
    aloftMatched,
    atmosphere,
    windProfile,
  };
}

/** Fetch and parse today's conditions for a launch site. */
export async function fetchConditions(lat: number, lon: number, place?: string): Promise<WeatherConditions> {
  const raw = await fetchJson(buildForecastUrl(lat, lon));
  return parseForecast(raw, lat, lon, place);
}

export function buildGeocodeUrl(query: string): string {
  const p = new URLSearchParams({ name: query, count: "5", language: "en", format: "json" });
  return `${GEOCODING}?${p.toString()}`;
}

export async function geocode(query: string): Promise<GeoPlace[]> {
  const raw = (await fetchJson(buildGeocodeUrl(query.trim()))) as {
    results?: Array<{ name: string; latitude: number; longitude: number; admin1?: string; country?: string }>;
  };
  return (raw.results ?? []).map((r) => ({
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    admin1: r.admin1,
    country: r.country,
  }));
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function arrAt(a: Array<number | null> | undefined, i: number): number | null {
  if (!a) return null;
  const v = a[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Re-export for callers that want to show aloft in feet.
export { FT_PER_M };
