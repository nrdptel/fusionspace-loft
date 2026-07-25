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

/** Vertical spacing between stacked marker-label rows, in viewBox units. */
const MARKER_ROW_H = 10;
/** Fixed viewBox geometry. The chart scales to its container through the viewBox, so these are
 *  constants rather than measured pixels. */
const CHART_W = 640;
const PAD_L = 52;
const PAD_R = 14;
/** Mean glyph width at the 9px marker font, in viewBox units — enough to know when two labels
 *  would touch. Deliberately an estimate: measuring text would mean a DOM round-trip per render. */
const MARKER_CHAR_W = 4.4;

interface PlacedMarker extends Marker {
  row: number;
  textX: number;
  anchor: "start" | "middle" | "end";
}

/** Place marker labels so they never overprint. Each label takes the topmost row in which it
 *  clears the previous label on that row; a label that would run off either end of the plot is
 *  anchored inward instead of being clipped. */
export function layoutMarkers(markers: Marker[], px: (x: number) => number): PlacedMarker[] {
  const sorted = [...markers].sort((a, b) => a.x - b.x);
  const rowEnds: number[] = [];
  return sorted.map((m) => {
    const w = Math.max(1, m.label.length) * MARKER_CHAR_W;
    const at = px(m.x);
    // Keep the label inside the plot: hug the edge rather than overflow it.
    let anchor: PlacedMarker["anchor"] = "middle";
    let textX = at;
    if (at - w / 2 < PAD_L) {
      anchor = "start";
      textX = Math.max(PAD_L, at - w / 2);
    } else if (at + w / 2 > CHART_W - PAD_R) {
      anchor = "end";
      textX = Math.min(CHART_W - PAD_R, at + w / 2);
    }
    const left = anchor === "start" ? textX : anchor === "end" ? textX - w : textX - w / 2;
    const right = left + w;
    let row = 0;
    while (row < rowEnds.length && rowEnds[row] > left - 2) row++;
    rowEnds[row] = right;
    return { ...m, row, textX, anchor };
  });
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
  const W = CHART_W;
  const H = height;
  const padL = PAD_L;
  const padR = PAD_R;
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

        {/* Event markers. Labels are stacked into rows so that events close together in time —
            liftoff and burnout on a short burn, apogee and deployment on an at-apogee chute —
            stay readable instead of overprinting each other into a smear. */}
        {layoutMarkers(markers, px).map((m, i) => (
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
              x={m.textX}
              y={padT + 4 + m.row * MARKER_ROW_H}
              textAnchor={m.anchor}
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
