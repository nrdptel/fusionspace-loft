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
  atmosphere: Atmosphere;
  windProfile: (altAgl: number) => Vec3;
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
  const r = raw as {
    elevation?: number;
    current?: Record<string, number>;
    hourly?: Record<string, Array<number | null>>;
  };
  const elevationMsl = num(r.elevation) ?? 0;
  const cur = r.current ?? {};
  const tempC = num(cur.temperature_2m) ?? 15;
  const surfacePressurePa = (num(cur.surface_pressure) ?? 1013.25) * 100; // hPa → Pa
  const surfaceWindMps = num(cur.wind_speed_10m) ?? 0;
  const surfaceWindDirDeg = num(cur.wind_direction_10m) ?? 0;

  // Take the first hourly index as "now" (forecast_days=1, timezone=auto).
  const hourly = r.hourly ?? {};
  const idx = 0;
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
        const dir = a.windDirDeg + (b.windDirDeg - a.windDirDeg) * f;
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
