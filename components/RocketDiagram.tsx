"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Rocket } from "@/lib/model/types";
import { rocketOutline } from "@/lib/model/silhouette";
import { primaryFinStation, primaryFinChord, primaryFinRootChord, type GeometryEdits } from "@/lib/model/edit";
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
  onEdit,
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
  /** When provided, the diagram becomes editable: drag handles on the fins trim their position, tip
   *  rake, and root and tip chords (the stability and area levers), re-flying the design live. Applies
   *  a geometry edit patch, exactly what a numeric what-if field does — so building by dragging and
   *  building by typing share one path. */
  onEdit?: (patch: GeometryEdits) => void;
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

  // Mouse hover on desktop; tap on touch (no mouseleave fires there, so a tap simply picks the part
  // and it stays lit until another is tapped). Keyboard parity comes from the focusable parts table.
  const hoverProps = (id: string) =>
    onHover
      ? { onMouseEnter: () => onHover(id), onMouseLeave: () => onHover(null), onClick: () => onHover(id) }
      : {};
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

  // Fin drag handles sit on the primary (frontmost) fin set. Both edits they expose keep the diagram
  // to scale, so the pointer maths below is snapshot-and-map with no rescale to chase.
  const finStationNow = onEdit ? primaryFinStation(rocket) : undefined;
  const finChord = onEdit ? primaryFinChord(rocket) : undefined;
  const primaryFin =
    finStationNow !== undefined && o.fins.length
      ? o.fins.reduce((best, f) =>
          Math.abs(f.poly[0][0] - finStationNow) < Math.abs(best.poly[0][0] - finStationNow) ? f : best,
        )
      : null;

  // Station handle (slide the whole group fore/aft): bounds keep the fins on the airframe — aft of
  // the nose, and fully ahead of the body's aft end.
  const nosePart = o.parts.find((p) => p.kind === "nosecone");
  const noseEnd = nosePart ? nosePart.profile[nosePart.profile.length - 1][0] : 0;
  const finLo = Math.max(0.01, noseEnd);
  const finHi = Math.max(finLo, o.length - (finChord ?? 0));
  const stationCx = primaryFin ? X((primaryFin.poly[0][0] + primaryFin.poly[3][0]) / 2) : 0;
  const stationCy = primaryFin ? top((primaryFin.poly[0][1] + primaryFin.poly[1][1]) / 2) : 0;

  // Sweep handle (rake the tip fore/aft) — trapezoidal fins only, where the leading-edge sweep is a
  // real editable dimension. Sweep is the tip leading edge's aft offset from the root leading edge,
  // read straight off the planform. Bounds keep the tip over the airframe and always include today's
  // value (so a design that already rakes forward stays reachable). It sits on the tip's leading-edge
  // corner, so the two tip handles land on distinct corners (leading = rake, trailing = tip chord)
  // rather than crowding the tip's mid-point.
  const trapezoid = onEdit ? primaryFinRootChord(rocket) !== undefined : false;
  const sweepNow = primaryFin && trapezoid ? primaryFin.poly[1][0] - primaryFin.poly[0][0] : undefined;
  const tipChord = primaryFin ? primaryFin.poly[2][0] - primaryFin.poly[1][0] : 0;
  const sweepLo = Math.min(0, sweepNow ?? 0);
  // Rake the tip aft until its trailing edge reaches the right edge of the frame (a to-scale fin can
  // overhang the tail), and never below today's value — so a design already raked to the tail can
  // still be raked a touch further and, of course, straightened.
  const maxDrawX = (W - padX) / s; // rightmost station that still maps inside the viewBox
  const sweepHi = primaryFin ? Math.max(sweepNow ?? 0, maxDrawX - primaryFin.poly[0][0] - tipChord) : 0;
  const sweepCx = primaryFin ? X(primaryFin.poly[1][0]) : 0;
  const sweepCy = primaryFin ? top(primaryFin.poly[1][1]) : 0;

  // Tip-chord handle (lengthen/shorten the fin tip by dragging its trailing-edge corner fore/aft) —
  // trapezoidal fins only, the last of the four planform dimensions the diagram exposes (with
  // position, sweep, and root chord). It shapes the fin's taper: shrinking the tip toward zero makes
  // a delta, growing it a squarer planform. Like the root chord it leaves the fin's radial extent, so
  // the diagram's scale holds — the same snapshot-and-map. Bounds run from a pointed tip (0) up to
  // the frame's right edge, always including today's value.
  const tipChordNow = primaryFin && trapezoid ? tipChord : undefined;
  const tipLeStation = primaryFin ? primaryFin.poly[1][0] : 0;
  const tipLo = tipChordNow !== undefined ? Math.min(tipChordNow, 0) : 0;
  const tipHi = tipChordNow !== undefined ? Math.max(tipChordNow, maxDrawX - tipLeStation) : 0;
  const tipCx = primaryFin ? X(primaryFin.poly[2][0]) : 0;
  const tipCy = primaryFin ? top(primaryFin.poly[2][1]) : 0;

  // Root-chord handle (lengthen/shorten the fin root by dragging its trailing-edge corner fore/aft)
  // — trapezoidal fins only, where the root chord is a directly editable dimension. The root is the
  // fin's longest chord, so it drives the planform area and thus a good deal of the stability margin
  // and the fin drag; a strong lever to have on the picture. It leaves the fin's radial extent, so
  // the diagram's scale is unchanged — the same snapshot-and-map as the other two handles. Bounds
  // keep the root on the airframe (never past the aft end) and off zero, always including today's
  // value so it stays reachable.
  const rootChordNow =
    primaryFin && trapezoid ? primaryFin.poly[3][0] - primaryFin.poly[0][0] : undefined;
  const rootLeStation = primaryFin ? primaryFin.poly[0][0] : 0;
  const rootLo = rootChordNow !== undefined ? Math.min(rootChordNow, 0.01) : 0;
  const rootHi = rootChordNow !== undefined ? Math.max(rootChordNow, o.length - rootLeStation) : 0;
  const rootCx = primaryFin ? X(primaryFin.poly[3][0]) : 0;
  const rootCy = primaryFin ? top(primaryFin.poly[3][1]) : 0;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H.toFixed(0)}`}
        className="h-auto w-full"
        // A pure picture is an `img`; once it carries the interactive fin handle it becomes a
        // labelled `group` — an `img` may not hold focusable descendants (it's an atomic graphic).
        role={onEdit ? "group" : "img"}
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

        {/* internal mass objects (payload, avionics, ballast) — a hollow mark at each station, so
            the CG's cause is visible and the part's table row highlights it */}
        {o.masses.map((m) => (
          <circle
            key={`mass${uid}${m.id}`}
            cx={X(m.x)}
            cy={centerY}
            r={m.id === highlightId ? 5 : 3.5}
            className={`${
              m.id === highlightId
                ? "fill-fuchsia-400 stroke-fuchsia-600 dark:fill-fuchsia-500 dark:stroke-fuchsia-300"
                : "fill-white stroke-fuchsia-500 dark:fill-zinc-900 dark:stroke-fuchsia-400"
            } ${cursor}`}
            strokeWidth={1.4}
            {...hoverProps(m.id)}
          >
            <title>{m.label}</title>
          </circle>
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

        {/* fin drag handles — grab a fin to trim stability directly on the picture. Each is a real
            slider: focusable, arrow keys nudge it, drag moves it. The station handle (mid-fin) slides
            the whole group fore/aft; the sweep handle (tip leading corner) rakes the tip fore/aft; the
            root- and tip-chord handles (root and tip trailing corners) lengthen or shorten each chord. */}
        {onEdit && primaryFin && finStationNow !== undefined && (
          <>
            <FinHandle
              field="finStation"
              label="Fin position"
              valueText={`${Math.round(finStationNow * 1000)} mm from the nose`}
              title="Drag or use arrow keys to move the fins fore/aft"
              current={finStationNow}
              lo={finLo}
              hi={finHi}
              cx={stationCx}
              cy={stationCy}
              s={s}
              padX={padX}
              onEdit={onEdit}
            />
            {sweepNow !== undefined && (
              <FinHandle
                field="finSweepLength"
                label="Fin sweep"
                valueText={`${Math.round(sweepNow * 1000)} mm of tip rake`}
                title="Drag or use arrow keys to rake the fin tip fore/aft"
                current={sweepNow}
                lo={sweepLo}
                hi={sweepHi}
                cx={sweepCx}
                cy={sweepCy}
                s={s}
                padX={padX}
                onEdit={onEdit}
              />
            )}
            {rootChordNow !== undefined && (
              <FinHandle
                field="finRootChord"
                label="Fin root chord"
                valueText={`${Math.round(rootChordNow * 1000)} mm root chord`}
                title="Drag or use arrow keys to lengthen or shorten the fin root"
                current={rootChordNow}
                lo={rootLo}
                hi={rootHi}
                cx={rootCx}
                cy={rootCy}
                s={s}
                padX={padX}
                onEdit={onEdit}
              />
            )}
            {tipChordNow !== undefined && (
              <FinHandle
                field="finTipChord"
                label="Fin tip chord"
                valueText={`${Math.round(tipChordNow * 1000)} mm tip chord`}
                title="Drag or use arrow keys to lengthen or shorten the fin tip"
                current={tipChordNow}
                lo={tipLo}
                hi={tipHi}
                cx={tipCx}
                cy={tipCy}
                s={s}
                padX={padX}
                onEdit={onEdit}
              />
            )}
          </>
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
        {o.masses.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full border border-fuchsia-500" /> mass
          </span>
        )}
        {marginLabel && <span>· {marginLabel}</span>}
      </figcaption>
    </figure>
  );
}

/** A single draggable, focusable slider handle on the diagram — the direct-manipulation grip. It
 *  drives one scale-stable fin edit (moving the group fore/aft, raking the tip, or resizing the root
 *  or tip chord), drawn as an indigo grip with a fore/aft glyph. All these edits keep the diagram's
 *  scale fixed, so the drag is a plain snapshot-and-map: at pointer-down it records where along the
 *  airframe the grab landed, then each move maps the pointer's x back to a station and applies the
 *  field, clamped to bounds. Owning its own drag refs keeps that ref access inside its own event
 *  handlers, where it belongs. */
function FinHandle({
  field,
  label,
  valueText,
  title,
  current,
  lo,
  hi,
  cx,
  cy,
  s,
  padX,
  onEdit,
}: {
  field: "finStation" | "finSweepLength" | "finRootChord" | "finTipChord";
  label: string;
  valueText: string;
  title: string;
  current: number;
  lo: number;
  hi: number;
  cx: number;
  cy: number;
  s: number;
  padX: number;
  onEdit: (patch: GeometryEdits) => void;
}) {
  const dragRef = useRef<{
    grabOffset: number;
    s: number;
    padX: number;
    lo: number;
    hi: number;
    svg: SVGSVGElement;
    controller: AbortController;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingXRef = useRef(0);
  // Show the live value while the handle is in use — dragging or keyboard-focused. It gives the
  // mouse a precise number to aim for and puts on screen, for sighted keyboard users, the value that
  // otherwise only reaches assistive tech through aria-valuetext.
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  // Apply the pending pointer-x on the next frame — the window handlers fire far faster than paint.
  const apply = useCallback(() => {
    rafRef.current = null;
    const dg = dragRef.current;
    const ctm = dg?.svg.getScreenCTM();
    if (!dg || !ctm) return;
    const pt = dg.svg.createSVGPoint();
    pt.x = pendingXRef.current;
    pt.y = 0;
    const station = (pt.matrixTransform(ctm.inverse()).x - dg.padX) / dg.s;
    onEdit({ [field]: Math.min(dg.hi, Math.max(dg.lo, station - dg.grabOffset)) });
  }, [field, onEdit]);

  const onMove = useCallback(
    (ev: PointerEvent) => {
      pendingXRef.current = ev.clientX;
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(apply);
    },
    [apply],
  );

  const end = useCallback(() => {
    dragRef.current?.controller.abort();
    dragRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setDragging(false);
  }, []);

  useEffect(() => end, [end]); // clean up an in-flight drag on unmount

  return (
    <g
      className="group cursor-ew-resize touch-none outline-none"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={Math.round(lo * 1000)}
      aria-valuemax={Math.round(hi * 1000)}
      aria-valuenow={Math.round(current * 1000)}
      aria-valuetext={valueText}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(ev) => {
        const step = ev.shiftKey ? 0.05 : 0.01; // 50 mm coarse / 10 mm fine
        let next: number | null = null;
        if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") next = current - step;
        else if (ev.key === "ArrowRight" || ev.key === "ArrowUp") next = current + step;
        else if (ev.key === "Home") next = lo;
        else if (ev.key === "End") next = hi;
        else return;
        ev.preventDefault();
        onEdit({ [field]: Math.min(hi, Math.max(lo, next)) });
      }}
      onPointerDown={(ev) => {
        const svg = ev.currentTarget.ownerSVGElement; // the containing <svg>, straight from the event
        const ctm = svg?.getScreenCTM();
        if (!svg || !ctm) return;
        ev.preventDefault();
        ev.stopPropagation();
        ev.currentTarget.focus();
        const pt = svg.createSVGPoint();
        pt.x = ev.clientX;
        pt.y = 0;
        const station = (pt.matrixTransform(ctm.inverse()).x - padX) / s;
        const controller = new AbortController();
        dragRef.current = { grabOffset: station - current, s, padX, lo, hi, svg, controller };
        window.addEventListener("pointermove", onMove, { signal: controller.signal });
        window.addEventListener("pointerup", end, { signal: controller.signal });
        window.addEventListener("pointercancel", end, { signal: controller.signal });
        setDragging(true);
      }}
    >
      {/* focus ring — only shown when the handle is keyboard-focused */}
      <circle cx={cx} cy={cy} r={11} className="fill-none stroke-indigo-400 opacity-0 group-focus-visible:opacity-100" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={7} className="fill-indigo-500/90 stroke-white dark:stroke-zinc-900" strokeWidth={1.5} />
      <path
        d={`M ${cx - 4} ${cy} h 8 M ${cx - 4} ${cy} l 2 -2 m -2 2 l 2 2 M ${cx + 4} ${cy} l -2 -2 m 2 2 l -2 2`}
        className="stroke-white"
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* live value while dragging or keyboard-focused — a haloed label so it reads over the airframe */}
      {(dragging || focused) && (
        <text
          x={cx}
          y={Math.max(11, cy - 13)}
          textAnchor="middle"
          className="pointer-events-none fill-zinc-800 text-[10px] font-semibold tabular-nums [paint-order:stroke] [stroke:white] [stroke-width:3px] dark:fill-zinc-100 dark:[stroke:#18181b]"
        >
          {Math.round(current * 1000)} mm
        </text>
      )}
      <title>{title}</title>
    </g>
  );
}
