/** International Standard Atmosphere (ISA / U.S. Standard Atmosphere 1976), implemented
 *  clean-room from the published layer equations. Returns temperature, pressure, density,
 *  speed of sound, and dynamic viscosity as a function of geometric altitude.
 *
 *  Sources:
 *   - U.S. Standard Atmosphere, 1976 (NOAA/NASA/USAF), the base-layer / lapse-rate model.
 *   - Sutherland's law for the temperature dependence of dynamic viscosity of air.
 *
 *  Layers are modelled to 32 km, which comfortably covers any amateur/high-power flight.
 *  A non-standard ground state (a warm day, a mile-high field) is supported by shifting
 *  the sea-level temperature and pressure offsets — this is what lets the optional
 *  "today's conditions" re-run use a real observed surface temperature and pressure. */

import { GAMMA_AIR, R_AIR, G0 } from "../units";

interface Layer {
  /** Geopotential base altitude of the layer (m). */
  baseAlt: number;
  /** Base temperature (K). */
  baseTemp: number;
  /** Base pressure (Pa). */
  basePressure: number;
  /** Temperature lapse rate (K/m); negative means cooling with altitude. */
  lapse: number;
}

// Standard sea-level reference.
export const SEA_LEVEL_TEMP_K = 288.15;
export const SEA_LEVEL_PRESSURE_PA = 101325;

// Sutherland's law constants for air.
const SUTHERLAND_C = 120; // K
const SUTHERLAND_T0 = 291.15; // K
const SUTHERLAND_MU0 = 1.827e-5; // Pa·s at T0

// Layer lapse-rate breakpoints of the 1976 standard atmosphere (geopotential altitudes).
const STANDARD_BREAKS: { alt: number; lapse: number }[] = [
  { alt: 0, lapse: -0.0065 }, // troposphere
  { alt: 11000, lapse: 0.0 }, // tropopause
  { alt: 20000, lapse: 0.001 }, // stratosphere 1
  { alt: 32000, lapse: 0.0028 }, // stratosphere 2
];

export interface AtmosphereOptions {
  /** Sea-level temperature (K). Defaults to the ISA standard. */
  seaLevelTempK?: number;
  /** Sea-level pressure (Pa). Defaults to the ISA standard. */
  seaLevelPressurePa?: number;
}

export interface AtmosphereState {
  altitude: number;
  temperature: number; // K
  pressure: number; // Pa
  density: number; // kg/m³
  speedOfSound: number; // m/s
  dynamicViscosity: number; // Pa·s
}

/** A layered atmosphere. Build once per simulation (ground conditions are fixed for a
 *  flight) and sample by altitude — the layer integration is done up front. */
export class Atmosphere {
  private layers: Layer[] = [];

  constructor(opts: AtmosphereOptions = {}) {
    const t0 = opts.seaLevelTempK ?? SEA_LEVEL_TEMP_K;
    const p0 = opts.seaLevelPressurePa ?? SEA_LEVEL_PRESSURE_PA;

    // Build the layer table from the ground up, carrying temperature and pressure across
    // each break. The lapse structure is the standard atmosphere's; only the sea-level
    // anchors shift for a non-standard ground state, preserving the standard shape aloft.
    let temp = t0;
    let pressure = p0;
    for (let i = 0; i < STANDARD_BREAKS.length; i++) {
      const brk = STANDARD_BREAKS[i];
      const layer: Layer = {
        baseAlt: brk.alt,
        baseTemp: temp,
        basePressure: pressure,
        lapse: brk.lapse,
      };
      this.layers.push(layer);
      // Advance temp/pressure to the next break for the following layer's anchors.
      const next = STANDARD_BREAKS[i + 1];
      if (next) {
        const dz = next.alt - brk.alt;
        const topTemp = temp + brk.lapse * dz;
        pressure = pressureAtTop(pressure, temp, topTemp, brk.lapse, dz);
        temp = topTemp;
      }
    }
  }

  sample(altitude: number): AtmosphereState {
    // Find the layer containing this altitude (clamp below the ground layer and above the
    // top break so a sample never falls off the table).
    let layer = this.layers[0];
    for (const l of this.layers) {
      if (altitude >= l.baseAlt) layer = l;
      else break;
    }
    const dz = altitude - layer.baseAlt;
    const temperature = layer.baseTemp + layer.lapse * dz;
    const pressure = pressureAtTop(
      layer.basePressure,
      layer.baseTemp,
      temperature,
      layer.lapse,
      dz,
    );
    const density = pressure / (R_AIR * temperature);
    const speedOfSound = Math.sqrt(GAMMA_AIR * R_AIR * temperature);
    const dynamicViscosity =
      SUTHERLAND_MU0 *
      (SUTHERLAND_T0 + SUTHERLAND_C) *
      Math.pow(temperature / SUTHERLAND_T0, 1.5) *
      (1 / (temperature + SUTHERLAND_C));
    return { altitude, temperature, pressure, density, speedOfSound, dynamicViscosity };
  }
}

/** Barometric pressure at the top of a layer given its base state and lapse. Uses the
 *  isothermal exponential form when the lapse rate is ~0 and the power-law form otherwise
 *  (both are the closed-form integrals of the hydrostatic equation for an ideal gas). */
function pressureAtTop(
  basePressure: number,
  baseTemp: number,
  topTemp: number,
  lapse: number,
  dz: number,
): number {
  if (Math.abs(lapse) < 1e-9) {
    return basePressure * Math.exp((-G0 * dz) / (R_AIR * baseTemp));
  }
  return basePressure * Math.pow(topTemp / baseTemp, -G0 / (R_AIR * lapse));
}

/** Convenience: a standard atmosphere sample at one altitude. */
export function standardAtmosphere(altitude: number): AtmosphereState {
  return new Atmosphere().sample(altitude);
}

/** Build an atmosphere calibrated to observed conditions AT the launch field: the given
 *  temperature and pressure hold at `groundAltitudeMsl`, with the standard lapse structure
 *  above. This is what the optional "today's conditions" re-run uses so a warm, high, or
 *  low-pressure day shifts density the way it really would. */
export function atmosphereForGround(
  groundAltitudeMsl: number,
  groundTempK: number,
  groundPressurePa: number,
): Atmosphere {
  const lapse = -0.0065; // troposphere
  const seaLevelTempK = groundTempK - lapse * groundAltitudeMsl;
  // Invert the power-law barometric form to recover the sea-level pressure that yields
  // groundPressurePa at the field altitude.
  const seaLevelPressurePa =
    groundPressurePa * Math.pow(groundTempK / seaLevelTempK, G0 / (R_AIR * lapse));
  return new Atmosphere({ seaLevelTempK, seaLevelPressurePa });
}
