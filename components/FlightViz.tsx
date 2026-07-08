"use client";

import { useId } from "react";
import type { FlightResult } from "@/lib/sim/simulate";
import { mToFt } from "@/lib/units";
import type { UnitSystem } from "@/lib/display";

/** Flight-path visualization: altitude vs down-range distance, coloured by phase (boost →
 *  coast → descent), with the key events marked. It's the "where does it go" picture that a
 *  plot of altitude-vs-time can't show — you see the arc, the drift downwind, and where it
 *  comes down relative to the pad. Pure SVG, responsive, theme-aware. */
const PHASE_COLOR: Record<string, string> = {
  rod: "#ef4444",
  boost: "#ef4444",
  coast: "#6366f1",
  descent: "#10b981",
  landed: "#10b981",
};

export default function FlightViz({ result, units }: { result: FlightResult; units: UnitSystem }) {
  const uid = useId();
  const W = 640;
  const H = 300;
  const padL = 50;
  const padR = 16;
  const padT = 16;
  const padB = 34;

  const conv = (m: number) => (units === "imperial" ? mToFt(m) : m);
  const unit = units === "imperial" ? "ft" : "m";

  const traj = result.trajectory;
  if (traj.length < 2) return null;

  const xs = traj.map((p) => conv(p.x));
  const ys = traj.map((p) => conv(p.altitude));
  const xMax = Math.max(...xs, 1);
  const yMax = Math.max(...ys, 1);
  // Keep aspect honest-ish but fit the box; independent scales are labeled.
  const px = (x: number) => padL + (x / xMax) * (W - padL - padR);
  const py = (y: number) => H - padB - (y / yMax) * (H - padT - padB);

  // Build phase-segmented polylines.
  const segments: { color: string; d: string }[] = [];
  let curColor = "";
  let cur: string[] = [];
  for (const p of traj) {
    const color = PHASE_COLOR[p.phase] ?? "#6366f1";
    const cmd = `${cur.length === 0 ? "M" : "L"}${px(conv(p.x)).toFixed(1)},${py(conv(p.altitude)).toFixed(1)}`;
    if (color !== curColor && cur.length > 0) {
      segments.push({ color: curColor, d: cur.join(" ") });
      // start next segment from the last point for continuity
      cur = [`M${px(conv(p.x)).toFixed(1)},${py(conv(p.altitude)).toFixed(1)}`];
    }
    cur.push(cmd);
    curColor = color;
  }
  if (cur.length) segments.push({ color: curColor, d: cur.join(" ") });

  const eventDots = result.events
    .filter((e) => ["rail-exit", "burnout", "apogee", "deploy", "landing"].includes(e.type))
    .map((e) => {
      // find nearest trajectory sample by time
      let best = traj[0];
      for (const p of traj) if (Math.abs(p.t - e.time) < Math.abs(best.t - e.time)) best = p;
      return { e, x: px(conv(best.x)), y: py(conv(best.altitude)) };
    });

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Flight path: altitude versus down-range distance" preserveAspectRatio="xMidYMid meet">
        {/* ground */}
        <line x1={padL} x2={W - padR} y1={py(0)} y2={py(0)} className="stroke-zinc-400 dark:stroke-zinc-600" strokeWidth={1} />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={1} />

        {/* pad marker */}
        <circle cx={px(0)} cy={py(0)} r={3} className="fill-zinc-400 dark:fill-zinc-500" />
        <text x={px(0)} y={py(0) + 14} textAnchor="middle" className="fill-zinc-500 text-[9px]">pad</text>

        {segments.map((s, i) => (
          <path key={`seg${uid}${i}`} d={s.d} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {eventDots.map((d, i) => (
          <g key={`e${uid}${i}`}>
            <circle cx={d.x} cy={d.y} r={3} className="fill-white stroke-zinc-700 dark:fill-zinc-900 dark:stroke-zinc-200" strokeWidth={1.5} />
            <text x={d.x} y={d.y - 7} textAnchor="middle" className="fill-zinc-600 text-[9px] dark:fill-zinc-300">
              {label(d.e.type, d.e.label)}
            </text>
          </g>
        ))}

        <text x={(W + padL) / 2} y={H - 2} textAnchor="middle" className="fill-zinc-500 text-[10px]">
          down-range ({unit}) — apogee not to scale with range
        </text>
        <text x={12} y={(H - padB + padT) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(H - padB + padT) / 2})`} className="fill-zinc-500 text-[10px]">
          altitude ({unit})
        </text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <Legend color="#ef4444" label="boost" />
        <Legend color="#6366f1" label="coast" />
        <Legend color="#10b981" label="descent" />
      </figcaption>
    </figure>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-3 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function label(type: string, l?: string): string {
  if (type === "rail-exit") return "rail";
  if (type === "burnout") return "burnout";
  if (type === "apogee") return "apogee";
  if (type === "landing") return "land";
  if (type === "deploy") return l ? l.split(" ")[0].toLowerCase() : "deploy";
  return type;
}
