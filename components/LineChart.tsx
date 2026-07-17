"use client";

import { useId } from "react";

export interface Series {
  points: { x: number; y: number }[];
  /** CSS color for the line. */
  color: string;
  label: string;
}

export interface Marker {
  x: number;
  label: string;
}

/** A small, dependency-free, theme-aware SVG line chart. Responsive: it scales to its
 *  container width via a viewBox. Used for the altitude/velocity/acceleration/thrust plots.
 *  Kept deliberately simple — no chart library, so it works offline and ships nothing. */
export default function LineChart({
  series,
  markers = [],
  xLabel,
  yLabel,
  height = 220,
  yZeroFloor = false,
}: {
  series: Series[];
  markers?: Marker[];
  xLabel: string;
  yLabel: string;
  height?: number;
  /** Force the y-axis to start at 0. */
  yZeroFloor?: boolean;
}) {
  const uid = useId();
  const W = 640;
  const H = height;
  const padL = 52;
  const padR = 14;
  const padT = 12;
  const padB = 34;

  const all = series.flatMap((s) => s.points);
  if (all.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No data.</p>;
  }
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yZeroFloor) yMin = Math.min(0, yMin);
  if (yMax === yMin) yMax = yMin + 1;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const px = (x: number) => padL + ((x - xMin) / xSpan) * (W - padL - padR);
  const py = (y: number) => H - padB - ((y - yMin) / ySpan) * (H - padT - padB);

  const ticks = (min: number, max: number, n: number) => {
    const step = niceStep((max - min) / n);
    const start = Math.ceil(min / step) * step;
    const out: number[] = [];
    for (let v = start; v <= max + 1e-9; v += step) out.push(v);
    return out;
  };
  const xTicks = ticks(xMin, xMax, 5);
  const yTicks = ticks(yMin, yMax, 4);

  const path = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${yLabel} versus ${xLabel}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* gridlines + axis ticks */}
        {yTicks.map((t) => (
          <g key={`y${uid}${t}`}>
            <line
              x1={padL}
              x2={W - padR}
              y1={py(t)}
              y2={py(t)}
              className="stroke-zinc-200 dark:stroke-zinc-800"
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={py(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-zinc-500 text-[10px]"
            >
              {formatTick(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x${uid}${t}`}
            x={px(t)}
            y={H - padB + 16}
            textAnchor="middle"
            className="fill-zinc-500 text-[10px]"
          >
            {formatTick(t)}
          </text>
        ))}

        {/* event markers */}
        {markers.map((m, i) => (
          <g key={`m${uid}${i}`}>
            <line
              x1={px(m.x)}
              x2={px(m.x)}
              y1={padT}
              y2={H - padB}
              className="stroke-zinc-300 dark:stroke-zinc-700"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={px(m.x)}
              y={padT + 4}
              textAnchor="middle"
              className="fill-zinc-400 text-[9px]"
            >
              {m.label}
            </text>
          </g>
        ))}

        {/* axes */}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} className="stroke-zinc-400 dark:stroke-zinc-600" strokeWidth={1} />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} className="stroke-zinc-400 dark:stroke-zinc-600" strokeWidth={1} />

        {/* series */}
        {series.map((s, i) => (
          <path key={`s${uid}${i}`} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
        ))}

        {/* axis labels */}
        <text x={(W + padL) / 2} y={H - 2} textAnchor="middle" className="fill-zinc-500 text-[10px]">
          {xLabel}
        </text>
        <text
          x={12}
          y={(H - padB + padT) / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${(H - padB + padT) / 2})`}
          className="fill-zinc-500 text-[10px]"
        >
          {yLabel}
        </text>
      </svg>
      {series.length > 1 && (
        <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          {series.map((s, i) => (
            <span key={`l${uid}${i}`} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / pow;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * pow;
}

function formatTick(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  if (a < 1 && a > 0) return v.toFixed(2);
  return String(Math.round(v * 10) / 10);
}
