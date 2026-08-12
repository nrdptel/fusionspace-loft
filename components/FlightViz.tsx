"use client";

import { useId, useRef } from "react";
import type { FlightResult } from "@/lib/sim/simulate";
import { mToFt } from "@/lib/units";
import type { UnitSystem } from "@/lib/display";
import { useMeasuredWidth } from "./LineChart";
import { EmptyState, Swatch } from "./ui";

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
  const box = useRef<HTMLElement>(null);
  // User units are CSS pixels (see useMeasuredWidth) so the labels stay the size they say they
  // are — at a fixed 640-unit viewBox, a 9 px event label rendered at 5 px in a phone column.
  const W = useMeasuredWidth(box);
  const H = 300;
  const padL = W < 420 ? 38 : 50;
  const padR = 16;
  const padT = 16;
  const padB = 34;

  const conv = (m: number) => (units === "imperial" ? mToFt(m) : m);
  const unit = units === "imperial" ? "ft" : "m";

  const traj = result.trajectory;
  // **A flight with nothing to draw says so, rather than leaving a hole under its own heading.**
  // `DESIGN.md` §5: a data surface without an empty state is not finished. This one sits inside the
  // "Flight path" panel, so returning null left the heading standing over an empty box —
  // indistinguishable from a render that failed, which is the version of the empty state that teaches
  // nothing.
  //
  // **The copy names the CONDITION and stops.** Its first draft ended "A flight that leaves the pad
  // plots its arc here", which is the same false-cause claim the zero-range note twenty lines below
  // spends a paragraph refusing: a vehicle that never leaves the rail still returns a full trajectory
  // — the solver integrates it sitting there — so a short sample list says nothing about whether it
  // flew. A prediction tool stating a physical cause it cannot know is the thing this file already
  // litigated once.
  if (traj.length < 2)
    return <EmptyState what="This flight came back with fewer than two recorded positions, so there is no path to draw." />;

  const xs = traj.map((p) => conv(p.x));
  const ys = traj.map((p) => conv(p.altitude));
  const xMax = Math.max(...xs, 1);
  const yMax = Math.max(...ys, 1);

  // **A flight with no horizontal extent, said rather than drawn.** `x` is `hypot(pos.x, pos.y)`, so
  // it is never negative and the range IS its maximum. Left alone this is the shape the owner
  // reported: `Math.max(..., 1)` above invents a one-metre range that does not exist, the path is
  // drawn ON the axis line, and the caption underneath still reads "down-range", promising a
  // dimension the picture does not have. A flyer reads that as the tool being broken rather than as
  // the flight being vertical, which is what it is.
  //
  // Measured in METRES off the model rather than in display units, so the threshold means the same
  // thing in both unit systems — half a metre of range over a whole flight is not a trajectory, it
  // is arithmetic noise. Reachable on a real file, not only on the from-scratch build: one of the
  // corpus's 91 stored simulations declares exactly zero wind.
  //
  // **Two things this deliberately does NOT do, both caught by review before it shipped.**
  //
  // It does not state a CAUSE. The obvious wording — "the rail is plumb and the wind is zero" — is a
  // claim about inputs this component never receives, and it is false in a reachable case: a rocket
  // that never leaves the rail has x ≡ 0 for every sample no matter what the wind is, because the
  // solver cancels off-rail acceleration until rail exit. That note would have told a flyer whose
  // file states 3 m/s to go and set a wind, on a design whose real problem is a thrust-to-weight
  // below 1. A prediction tool stating a false physical cause is worse than the vertical line it
  // replaced. So the sentence states what is OBSERVED and names the two inputs a down-range comes
  // from, without asserting their values.
  //
  // And it fires only on a flight that actually flew. `liftoff` is in the event list precisely when
  // the vehicle left the rail, so a no-liftoff run — where the vertical line is a symptom of
  // something the existing warning already explains — says nothing here rather than adding a second,
  // shallower explanation beside the real one.
  const rangeM = Math.max(...traj.map((p) => p.x));
  const leftTheRail = result.events.some((e) => e.type === "liftoff");
  const degenerate = leftTheRail && rangeM < 0.5;
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
    // `separation` belongs here: the altitude chart has always marked it (`eventMarkers` drops only
    // `ignition`), so leaving it out gave two charts on one page two different ideas of what is worth
    // drawing — and staging is now a first-class surface with its own phase table.
    .filter((e) => ["rail-exit", "burnout", "separation", "apogee", "deploy", "landing"].includes(e.type))
    .map((e) => {
      // find nearest trajectory sample by time
      let best = traj[0];
      for (const p of traj) if (Math.abs(p.t - e.time) < Math.abs(best.t - e.time)) best = p;
      return { e, x: px(conv(best.x)), y: py(conv(best.altitude)) };
    });

  return (
    <figure className="m-0" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Flight path: altitude versus down-range distance" preserveAspectRatio="xMidYMid meet">
        {/* ground */}
        <line x1={padL} x2={W - padR} y1={py(0)} y2={py(0)} className="stroke-zinc-400 dark:stroke-zinc-600" strokeWidth={1} />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={1} />

        {/* pad marker */}
        <circle cx={px(0)} cy={py(0)} r={3} className="fill-zinc-400 dark:fill-zinc-500" />
        <text x={px(0)} y={py(0) + 14} textAnchor="middle" className="fill-zinc-500 text-[11px]">pad</text>

        {segments.map((s, i) => (
          <path key={`seg${uid}${i}`} d={s.d} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* Labels are lifted clear of one another: apogee and an at-apogee deployment sit on the
            same point, and drawing both at the dot smeared them into an unreadable overprint. */}
        {placeLabels(eventDots.map((d) => ({ ...d, text: label(d.e.type, d.e.label) }))).map((d, i) => (
          <g key={`e${uid}${i}`}>
            <circle cx={d.x} cy={d.y} r={3} className="fill-white stroke-zinc-700 dark:fill-zinc-900 dark:stroke-zinc-200" strokeWidth={1.5} />
            <text x={d.x} y={d.labelY} textAnchor="middle" className="fill-zinc-600 text-[11px] dark:fill-zinc-300">
              {d.text}
            </text>
          </g>
        ))}

        <text x={(W + padL) / 2} y={H - 2} textAnchor="middle" className="fill-zinc-500 text-[11px]">
          {degenerate ? `down-range (${unit}) — none on these conditions` : `down-range (${unit}) — apogee not to scale with range`}
        </text>
        <text x={12} y={(H - padB + padT) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(H - padB + padT) / 2})`} className="fill-zinc-500 text-[11px]">
          altitude ({unit})
        </text>
      </svg>
      {degenerate && (
        // **Decision-grade, so it takes the body default rather than the annotation size.** §3 puts a
        // sentence whose purpose is to change what the flyer does NEXT at `text-sm`, and this one
        // does exactly that: it turns "the plot is broken" into "add a wind". Secondary rather than
        // amber deliberately — nothing here is an estimate outside its envelope or a caveat on a
        // number. The flight is correct; it simply has no horizontal extent, and saying so is an
        // explanation, not a warning. Colouring it as one would be the flag-that-cries-wolf the
        // SAFETY posture warns about.
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This flight has no down-range — every point of the path is directly above the pad, so you
          are seeing the whole trajectory edge-on. Down-range comes from the surface wind and the
          rail angle; both are under Conditions.
        </p>
      )}
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        <Legend color="#ef4444" label="boost" />
        <Legend color="#6366f1" label="coast" />
        <Legend color="#10b981" label="descent" />
      </figcaption>
    </figure>
  );
}

/** Mean glyph width and line height at the 9px label font, in px. */
const LABEL_CHAR_W = 4.6;
const LABEL_LINE_H = 11;

/** Lift each label above its dot, raising it a line at a time until it clears every label already
 *  placed. Events that share a point — apogee and a deployment triggered at apogee — then read as
 *  two stacked words instead of one smear. */
function placeLabels<T extends { x: number; y: number; text: string }>(dots: T[]): (T & { labelY: number })[] {
  const boxes: { x0: number; x1: number; y: number }[] = [];
  return dots.map((d) => {
    const w = Math.max(1, d.text.length) * LABEL_CHAR_W;
    const x0 = d.x - w / 2;
    const x1 = d.x + w / 2;
    let y = d.y - 7;
    // Six lines is more than any flight's worth of coincident events; the bound keeps a
    // degenerate trajectory from marching labels off the top of the plot.
    for (let guard = 0; guard < 6; guard++) {
      const clash = boxes.some((b) => b.x1 > x0 - 2 && b.x0 < x1 + 2 && Math.abs(b.y - y) < LABEL_LINE_H);
      if (!clash) break;
      y -= LABEL_LINE_H;
    }
    boxes.push({ x0, x1, y });
    return { ...d, labelY: y };
  });
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Swatch color={color} />
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
  // Without this, adding `separation` to the dots above rendered the raw enum string — the only dot in
  // the chart not on the short-word vocabulary the rest use.
  if (type === "separation") return "stage";
  return type;
}
