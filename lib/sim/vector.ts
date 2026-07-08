/** Minimal 3-vector algebra for the simulation state. The solver this session integrates
 *  translational motion in a vertical plane, but the state is carried as full 3-D vectors
 *  (position, velocity, acceleration) so extending to a 6-DOF rotational solve later is
 *  additive — the integrator already steps a vector state, not a pair of scalars.
 *
 *  Frame convention: a local launch frame with +Z up, +X down-range (the wind/rod-tilt
 *  plane), +Y cross-range. Gravity acts along −Z. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
export const UP: Vec3 = { x: 0, y: 0, z: 1 };

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const mag = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

/** Unit vector; returns ZERO for a zero-length input (no NaN). */
export function normalize(a: Vec3): Vec3 {
  const m = mag(a);
  return m > 0 ? scale(a, 1 / m) : { ...ZERO };
}

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
