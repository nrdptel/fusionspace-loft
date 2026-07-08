/** Parser for the RASP `.eng` motor file format — the long-standing, public interchange
 *  format for rocket-motor thrust curves (used by RASP, ThrustCurve.org, OpenRocket, and
 *  every sim). A `.eng` file is factual measurement data, not code; the bundled database
 *  stores curves in this format verbatim so the numbers are auditable against the source.
 *
 *  Format (one motor per block):
 *    ; optional comment lines
 *    <designation> <diameter mm> <length mm> <delays> <propellant kg> <total kg> <maker>
 *    <time s> <thrust N>
 *    ... ascending time, last point thrust 0 (burnout)
 *
 *  The propellant-mass profile is derived from the thrust curve: mass burned is taken
 *  proportional to impulse delivered (dm/dt ∝ thrust), the standard constant-Isp
 *  assumption, so propellant mass at time t is propMass·(1 − I(t)/I_total). */

export interface ThrustSample {
  /** Seconds since ignition. */
  t: number;
  /** Thrust (N). */
  thrust: number;
}

export interface MotorCurve {
  designation: string;
  manufacturer: string;
  /** Casing diameter (mm). */
  diameterMm: number;
  /** Casing length (mm). */
  lengthMm: number;
  /** Delay options as printed (e.g. "0-3-5-7", "P" for plugged). */
  delaysRaw: string;
  delays: number[];
  /** Loaded propellant mass (kg). */
  propMass: number;
  /** Total loaded motor mass (kg). */
  totalMass: number;
  /** Casing / inert mass = total − propellant (kg). */
  dryMass: number;
  samples: ThrustSample[];
  /** Total impulse (N·s), trapezoidal integral of the curve. */
  totalImpulse: number;
  /** Cumulative impulse at each sample, aligned with `samples` (N·s). */
  cumulativeImpulse: number[];
  /** Burn time to the last non-zero-ish thrust point (s). */
  burnTime: number;
  maxThrust: number;
  avgThrust: number;
  /** Motor class letter from total impulse (A, B, …). */
  motorClass: string;
}

/** Total-impulse class letter. Each letter doubles the previous band; 'A' is 1.26–2.5 N·s. */
export function impulseClass(totalImpulse: number): string {
  if (totalImpulse <= 0) return "?";
  // A: (1.25, 2.5]; the band index is floor(log2(I / 1.25)).
  const idx = Math.floor(Math.log2(totalImpulse / 1.25));
  if (idx < 0) return totalImpulse <= 0.625 ? "1/4A" : "1/2A";
  return String.fromCharCode(65 + idx);
}

/** Parse a single `.eng` block (header + samples). Throws on a malformed header. */
export function parseEng(text: string): MotorCurve {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith(";"));
  if (lines.length < 2) throw new Error("eng: empty or headerless motor block");

  const header = lines[0].split(/\s+/);
  if (header.length < 7) {
    throw new Error(`eng: malformed header "${lines[0]}"`);
  }
  const [designation, dia, len, delaysRaw, prop, total, ...makerParts] = header;
  const manufacturer = makerParts.join(" ");

  const samples: ThrustSample[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 2) continue;
    const t = Number(parts[0]);
    const thrust = Number(parts[1]);
    if (Number.isFinite(t) && Number.isFinite(thrust)) samples.push({ t, thrust });
  }
  if (samples.length < 2) throw new Error(`eng: motor ${designation} has too few data points`);

  // Ensure the curve starts at t=0 (RASP files sometimes omit the origin). A motor makes
  // no thrust before ignition, so prepend (0,0) if the first sample is later.
  if (samples[0].t > 0) samples.unshift({ t: 0, thrust: 0 });

  const cumulativeImpulse: number[] = new Array(samples.length).fill(0);
  let totalImpulse = 0;
  let maxThrust = 0;
  for (let i = 0; i < samples.length; i++) {
    maxThrust = Math.max(maxThrust, samples[i].thrust);
    if (i > 0) {
      const dt = samples[i].t - samples[i - 1].t;
      const seg = ((samples[i].thrust + samples[i - 1].thrust) / 2) * dt;
      totalImpulse += Math.max(0, seg);
    }
    cumulativeImpulse[i] = totalImpulse;
  }

  const burnTime = samples[samples.length - 1].t;
  const propMass = Number(prop);
  const totalMass = Number(total);

  return {
    designation,
    manufacturer,
    diameterMm: Number(dia),
    lengthMm: Number(len),
    delaysRaw,
    delays: parseDelays(delaysRaw),
    propMass,
    totalMass,
    dryMass: Math.max(0, totalMass - propMass),
    samples,
    totalImpulse,
    cumulativeImpulse,
    burnTime,
    maxThrust,
    avgThrust: burnTime > 0 ? totalImpulse / burnTime : 0,
    motorClass: impulseClass(totalImpulse),
  };
}

function parseDelays(raw: string): number[] {
  return raw
    .split("-")
    .map((d) => Number(d))
    .filter((d) => Number.isFinite(d));
}

/** Linear-interpolated thrust (N) at time t (s). Zero before ignition and after burnout. */
export function thrustAt(curve: MotorCurve, t: number): number {
  const s = curve.samples;
  if (t <= s[0].t) return 0;
  if (t >= s[s.length - 1].t) return 0;
  // Binary search for the bracketing samples.
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = s[lo];
  const b = s[hi];
  const f = (t - a.t) / (b.t - a.t);
  return a.thrust + (b.thrust - a.thrust) * f;
}

/** Cumulative impulse (N·s) delivered by time t — used to derive propellant mass. */
export function impulseAt(curve: MotorCurve, t: number): number {
  const s = curve.samples;
  if (t <= s[0].t) return 0;
  if (t >= s[s.length - 1].t) return curve.totalImpulse;
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = s[lo];
  const b = s[hi];
  const dt = t - a.t;
  // Impulse over the partial segment [a.t, t] via the trapezoid up to the interpolated thrust.
  const thrustT = a.thrust + ((b.thrust - a.thrust) * dt) / (b.t - a.t);
  const seg = ((a.thrust + thrustT) / 2) * dt;
  return curve.cumulativeImpulse[lo] + seg;
}

/** Propellant mass remaining (kg) at time t, from the impulse-fraction burn model. */
export function propMassAt(curve: MotorCurve, t: number): number {
  if (curve.totalImpulse <= 0) return 0;
  const fraction = impulseAt(curve, t) / curve.totalImpulse;
  return curve.propMass * (1 - fraction);
}

/** Total motor mass (kg) at time t = casing + remaining propellant. */
export function motorMassAt(curve: MotorCurve, t: number): number {
  return curve.dryMass + propMassAt(curve, t);
}
