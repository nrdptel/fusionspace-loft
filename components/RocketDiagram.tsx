"use client";

import { useId } from "react";
import type { Rocket } from "@/lib/model/types";
import { rocketOutline } from "@/lib/model/silhouette";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";

/** A to-scale side-view of the airframe, drawn from the same internal model the simulator flies —
 *  the picture that answers "did Loft read my rocket right?" at a glance, for an imported design or
 *  a built one. Pure SVG, responsive, theme-aware, and strictly to scale (equal axial and radial
 *  scale), so proportions and fin size are honest. The geometry comes from `rocketOutline`
 *  (lib/model/silhouette); this component only maps metres to pixels and styles them. It is the
 *  visual surface a direct-manipulation editor will grow on top of. */
export default function RocketDiagram({ rocket, units }: { rocket: Rocket; units: UnitSystem }) {
  const uid = useId();
  const o = rocketOutline(rocket);
  if (!(o.length > 0) || !(o.maxExtent > 0) || o.body.length < 2) return null;

  const W = 640;
  const padX = 14;
  const padY = 10;
  const s = (W - 2 * padX) / o.length; // pixels per metre (equal on both axes → true scale)
  const centerY = padY + o.maxExtent * s;
  const H = centerY + o.maxExtent * s + padY;

  const X = (x: number) => padX + x * s;
  const top = (r: number) => centerY - r * s;
  const bot = (r: number) => centerY + r * s;

  // Closed body silhouette: top profile out, bottom profile (mirror) back.
  let bodyPath = `M ${X(o.body[0][0]).toFixed(1)} ${top(o.body[0][1]).toFixed(1)}`;
  for (let i = 1; i < o.body.length; i++) bodyPath += ` L ${X(o.body[i][0]).toFixed(1)} ${top(o.body[i][1]).toFixed(1)}`;
  for (let i = o.body.length - 1; i >= 0; i--) bodyPath += ` L ${X(o.body[i][0]).toFixed(1)} ${bot(o.body[i][1]).toFixed(1)}`;
  bodyPath += " Z";

  const finPath = (pts: [number, number][], side: (r: number) => number) => {
    let p = `M ${X(pts[0][0]).toFixed(1)} ${side(pts[0][1]).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) p += ` L ${X(pts[i][0]).toFixed(1)} ${side(pts[i][1]).toFixed(1)}`;
    return p + " Z";
  };

  const lengthLabel =
    units === "imperial"
      ? `${(o.length * 39.3701).toFixed(1)} in`
      : o.length >= 1
        ? `${o.length.toFixed(2)} m`
        : `${Math.round(o.length * 1000)} mm`;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H.toFixed(0)}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Scale side-view of ${rocket.name || "the rocket"}: ${lengthLabel} long, ${d.q(d.lengthMm(2 * o.maxRadius, units))} maximum diameter`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* centreline */}
        <line
          x1={X(0)}
          x2={X(o.length)}
          y1={centerY}
          y2={centerY}
          className="stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* fins, top and bottom, behind the body edge */}
        {o.fins.map((pts, i) => (
          <g key={`fin${uid}${i}`} className="fill-zinc-300 stroke-zinc-400 dark:fill-zinc-600 dark:stroke-zinc-500">
            <path d={finPath(pts, top)} strokeWidth={1} strokeLinejoin="round" />
            <path d={finPath(pts, bot)} strokeWidth={1} strokeLinejoin="round" />
          </g>
        ))}

        {/* airframe body */}
        <path
          d={bodyPath}
          className="fill-zinc-200 stroke-zinc-400 dark:fill-zinc-700 dark:stroke-zinc-500"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </svg>
      <figcaption className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        To scale · {lengthLabel} long · ⌀ {d.q(d.lengthMm(2 * o.maxRadius, units))} max
      </figcaption>
    </figure>
  );
}
