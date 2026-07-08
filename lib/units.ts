/** Unit conversions. The simulation core works entirely in SI (metres, kilograms,
 *  seconds, kelvin, newtons, pascals, radians); these helpers convert at the edges —
 *  the importer converts a design INTO SI, and the UI converts SI OUT for display.
 *  Keeping one canonical unit system inside the solver is what lets the physics stay
 *  format-agnostic: a RocketPy importer later feeds the same SI model. */

// --- length ---
export const M_PER_FT = 0.3048;
export const M_PER_IN = 0.0254;
export const FT_PER_M = 1 / M_PER_FT;
export const IN_PER_M = 1 / M_PER_IN;
export const M_PER_MILE = 1609.344;

export const ftToM = (ft: number): number => ft * M_PER_FT;
export const mToFt = (m: number): number => m * FT_PER_M;
export const inToM = (inch: number): number => inch * M_PER_IN;
export const mToIn = (m: number): number => m * IN_PER_M;

// --- mass ---
export const KG_PER_LB = 0.45359237;
export const G_PER_OZ = 28.349523125;
export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const kgToG = (kg: number): number => kg * 1000;
export const gToKg = (g: number): number => g / 1000;

// --- velocity ---
export const MPH_PER_MPS = 2.2369362920544;
export const KMH_PER_MPS = 3.6;
export const KT_PER_MPS = 1.9438444924406;
export const mpsToMph = (mps: number): number => mps * MPH_PER_MPS;
export const mphToMps = (mph: number): number => mph / MPH_PER_MPS;
export const mpsToFtps = (mps: number): number => mps * FT_PER_M;
export const ftpsToMps = (ftps: number): number => ftps * M_PER_FT;

// --- angle ---
export const DEG_PER_RAD = 180 / Math.PI;
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => rad * DEG_PER_RAD;

// --- pressure / temperature ---
export const PA_PER_PSI = 6894.757293168;
export const cToK = (c: number): number => c + 273.15;
export const kToC = (k: number): number => k - 273.15;
export const fToC = (f: number): number => ((f - 32) * 5) / 9;
export const cToF = (c: number): number => (c * 9) / 5 + 32;

// --- physical constants ---
/** Standard gravity at sea level (m/s²). */
export const G0 = 9.80665;
/** Specific gas constant for dry air (J/(kg·K)). */
export const R_AIR = 287.05287;
/** Ratio of specific heats for air. */
export const GAMMA_AIR = 1.4;

/** Clamp a value into [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Linear interpolation between a and b by t∈[0,1]. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
