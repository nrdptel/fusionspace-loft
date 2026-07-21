"use client";

import { useId } from "react";
import type { Rocket } from "@/lib/model/types";
import { rocketOutline } from "@/lib/model/silhouette";
import type { MotorMark } from "@/lib/sim/setup";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";

/** A to-scale side-view of the airframe, drawn from the same internal model the simulator flies —
 *  the picture that answers "did Loft read my rocket right?" at a glance, for an imported design or
 *  a built one. Pure SVG, responsive, theme-aware, and strictly to scale (equal axial and radial
 *  scale), so proportions and fin size are honest. The geometry comes from `rocketOutline`
 *  (lib/model/silhouette); this component only maps metres to pixels and styles them. It is the
 *  visual surface a direct-manipulation editor will grow on top of.
 *
 *  When the loaded centre of gravity (`cg`) and centre of pressure (`cp`) are supplied — the same
 *  values the results panel reports — they're marked on the airframe so the stability picture (CG
 *  ahead of CP, by the static margin) reads at a glance, which numbers alone can't show. */
export default function RocketDiagram({
  rocket,
  units,
  cg,
  cp,
  marginCal,
  highlightId,
  onHover,
  motors,
}: {
  rocket: Rocket;
  units: UnitSystem;
  /** Loaded centre-of-gravity station (m from the nose tip); marks the balance point. */
  cg?: number;
  /** Centre-of-pressure station (m from the nose tip); marks the aerodynamic centre. */
  cp?: number;
  /** Static margin (calibers), for the caption. */
  marginCal?: number;
  /** Component id to highlight (linked from the parts table); its shape is picked out. */
  highlightId?: string | null;
  /** Called with a component id on hover, null on leave — so the parts table can highlight in step. */
  onHover?: (id: string | null) => void;
  /** Loaded motor casing(s), drawn inside the aft body so the design shows what it's flying. */
  motors?: MotorMark[];
}) {
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

  // A single body component's closed silhouette (its top profile out, mirrored back) — for the
  // per-part hit/highlight overlays that sit over the seamless base body.
  const partPath = (profile: [number, number][]) => {
    let p = `M ${X(profile[0][0]).toFixed(1)} ${top(profile[0][1]).toFixed(1)}`;
    for (let i = 1; i < profile.length; i++) p += ` L ${X(profile[i][0]).toFixed(1)} ${top(profile[i][1]).toFixed(1)}`;
    for (let i = profile.length - 1; i >= 0; i--) p += ` L ${X(profile[i][0]).toFixed(1)} ${bot(profile[i][1]).toFixed(1)}`;
    return p + " Z";
  };

  const hoverProps = (id: string) =>
    onHover ? { onMouseEnter: () => onHover(id), onMouseLeave: () => onHover(null) } : {};
  const cursor = onHover ? "cursor-pointer" : "";

  const lengthLabel =
    units === "imperial"
      ? `${(o.length * 39.3701).toFixed(1)} in`
      : o.length >= 1
        ? `${o.length.toFixed(2)} m`
        : `${Math.round(o.length * 1000)} mm`;

  // CG/CP guide lines span the full drawing height so they read even on a slender airframe.
  const markTop = top(o.maxExtent);
  const markBot = bot(o.maxExtent);
  const showCg = cg !== undefined && Number.isFinite(cg) && cg >= 0;
  const showCp = cp !== undefined && Number.isFinite(cp) && cp >= 0;
  const marginLabel = marginCal !== undefined ? `${d.q(d.calibers(marginCal))} margin` : null;
  const motorLabel = motors && motors.length ? [...new Set(motors.map((m) => m.designation))].join(", ") : null;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H.toFixed(0)}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Scale side-view of ${rocket.name || "the rocket"}: ${lengthLabel} long, ${d.q(d.lengthMm(2 * o.maxRadius, units))} maximum diameter${motorLabel ? `, motor ${motorLabel}` : ""}${marginLabel && showCg && showCp ? `, centre of gravity ahead of centre of pressure by ${marginLabel}` : ""}`}
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

        {/* fins, top and bottom, behind the body edge — highlighted when their row is hovered */}
        {o.fins.map((fin) => (
          <g
            key={`fin${uid}${fin.id}`}
            className={`${
              fin.id === highlightId
                ? "fill-indigo-300 stroke-indigo-500 dark:fill-indigo-500/60 dark:stroke-indigo-400"
                : "fill-zinc-300 stroke-zinc-400 dark:fill-zinc-600 dark:stroke-zinc-500"
            } ${cursor}`}
            {...hoverProps(fin.id)}
          >
            <path d={finPath(fin.poly, top)} strokeWidth={1} strokeLinejoin="round" />
            <path d={finPath(fin.poly, bot)} strokeWidth={1} strokeLinejoin="round" />
          </g>
        ))}

        {/* airframe body — one seamless base fill */}
        <path
          d={bodyPath}
          className="fill-zinc-200 stroke-zinc-400 dark:fill-zinc-700 dark:stroke-zinc-500"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />

        {/* loaded motor casing(s) inside the aft body */}
        {(motors ?? []).map((m, i) => (
          <rect
            key={`motor${uid}${i}`}
            x={X(m.x0)}
            y={centerY - m.radius * s}
            width={Math.max(1, (m.x1 - m.x0) * s)}
            height={2 * m.radius * s}
            rx={1.5}
            className="fill-zinc-500 stroke-zinc-600 dark:fill-zinc-400 dark:stroke-zinc-300"
            strokeWidth={0.8}
          />
        ))}

        {/* per-part overlays: transparent hit targets that tint their part when hovered/highlighted */}
        {o.parts.map((part) => (
          <path
            key={`part${uid}${part.id}`}
            d={partPath(part.profile)}
            className={`${part.id === highlightId ? "fill-indigo-400/40 dark:fill-indigo-400/30" : "fill-transparent"} ${cursor}`}
            {...hoverProps(part.id)}
          />
        ))}

        {/* centre of pressure (aft of CG when stable) — draw first, so CG sits on top if they meet */}
        {showCp && (
          <g>
            <line x1={X(cp!)} x2={X(cp!)} y1={markTop} y2={markBot} className="stroke-amber-500" strokeWidth={1.3} strokeDasharray="3 3" />
            <circle cx={X(cp!)} cy={centerY} r={4} className="fill-amber-500" />
            <text x={X(cp!)} y={markBot + 11} textAnchor="middle" className="fill-amber-600 text-[10px] font-semibold dark:fill-amber-400">CP</text>
          </g>
        )}
        {/* centre of gravity (loaded) */}
        {showCg && (
          <g>
            <line x1={X(cg!)} x2={X(cg!)} y1={markTop} y2={markBot} className="stroke-indigo-500" strokeWidth={1.3} strokeDasharray="3 3" />
            <circle cx={X(cg!)} cy={centerY} r={4} className="fill-indigo-500" />
            <text x={X(cg!)} y={markTop - 3} textAnchor="middle" className="fill-indigo-600 text-[10px] font-semibold dark:fill-indigo-400">CG</text>
          </g>
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>To scale · {lengthLabel} long · ⌀ {d.q(d.lengthMm(2 * o.maxRadius, units))} max</span>
        {motorLabel && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-[2px] bg-zinc-500 dark:bg-zinc-400" /> {motorLabel}
          </span>
        )}
        {showCg && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" /> CG
          </span>
        )}
        {showCp && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> CP
          </span>
        )}
        {marginLabel && <span>· {marginLabel}</span>}
      </figcaption>
    </figure>
  );
}
