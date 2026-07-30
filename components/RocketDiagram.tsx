"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Rocket } from "@/lib/model/types";
import { rocketOutline } from "@/lib/model/silhouette";
import {
  primaryFinStation,
  primaryFinChord,
  primaryFinRootChord,
  primaryBodyTube,
  primaryBodyDiameter,
  primaryNose,
  type GeometryEdits,
} from "@/lib/model/edit";
import type { MotorMark } from "@/lib/sim/setup";
import { useMeasuredWidth } from "./LineChart";
import { TOUCH_TARGET_SQUARE } from "@/lib/ui-tokens";
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
/** The fin dimensions the diagram can edit, in the order the touch chip row offers them. */
const FIN_FIELDS = ["finStation", "finSweepLength", "finRootChord", "finTipChord", "finSpan"] as const;
type FinField = (typeof FIN_FIELDS)[number];
const FIN_FIELD_LABEL: Record<FinField, string> = {
  finStation: "Position",
  finSweepLength: "Sweep",
  finRootChord: "Root",
  finTipChord: "Tip",
  finSpan: "Span",
};

export default function RocketDiagram({
  rocket,
  units,
  cg,
  cp,
  marginCal,
  highlightId,
  onHover,
  onSelect,
  motors,
  onEdit,
  selectedFinSetId,
  selectedBodyTubeId,
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
  /** Called with a component id when one is clicked or tapped — a sticky pick, unlike hover, so the
   *  part stays identified while you read what it is. */
  onSelect?: (id: string) => void;
  /** Loaded motor casing(s), drawn inside the aft body so the design shows what it's flying. */
  motors?: MotorMark[];
  /** When provided, the diagram becomes editable: drag handles on the fins trim their position, tip
   *  rake, span, and root and tip chords, and a handle on the body wall resizes the caliber (the
   *  stability, area, and drag levers), re-flying the design live. Applies a geometry edit patch,
   *  exactly what a numeric what-if field does — so building by dragging and building by typing share
   *  one path. */
  onEdit?: (patch: GeometryEdits) => void;
  /** Which fin set and body tube the editor's fields — and therefore these handles — are aimed at. The
   *  handles emit ABSOLUTE values, so reading one off a different part than the edit writes to would
   *  snap the edited part to the read part's dimensions on the first nudge. */
  selectedFinSetId?: string;
  selectedBodyTubeId?: string;
}) {
  const uid = useId();
  // A drag-frozen vertical extent, set while a vertical resize handle is being dragged (the fin SPAN
  // or the body DIAMETER). The diagram normally fits the airframe tightly, which pins the widest part
  // to the frame edge — so an outward drag couldn't move it. When editable we reserve a little
  // headroom (below), and while such a drag is live we hold the frame at its grab-time extent so the
  // grabbed edge tracks the pointer instead of the frame chasing the growing geometry. Null otherwise.
  const [vFrameExtent, setVFrameExtent] = useState<number | null>(null);
  // The diagram draws in CSS pixels (a user unit IS a pixel), so a handle and a label stay the size
  // they claim whatever the column width — and the airframe can be magnified without the furniture
  // growing with it. Fit-to-width is the default; zooming makes the drawing wider than its column
  // and the column scrolls.
  const box = useRef<HTMLElement>(null);
  const available = useMeasuredWidth(box);
  const [zoom, setZoom] = useState(1);

  // A finger is not a mouse pointer, and the five fin handles sit within 10-22 px of each other at a
  // phone's fit-width: measured on a 412x915 viewport, `document.elementFromPoint` at the centre of
  // "Fin position" returns "Fin sweep", so that handle could not be tapped at all. Enlarging them
  // makes it worse — at 10 px apart, 44 px circles nest. So on a coarse pointer the fin handles show
  // one at a time, picked from a chip row, and the one on screen gets a hit area a glove can find.
  // Read in an effect, never during render, so the server's HTML and the client's first pass agree.
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const [activeFin, setActiveFin] = useState<FinField>("finStation");

  // Half the project's own 44 px minimum, in the diagram's own units (a user unit here IS a pixel).
  // Only on a coarse pointer: on a mouse layout the drawn dot is the target, and an invisible circle
  // three times its size would swallow taps meant for the airframe underneath.
  const hitR = coarse ? 22 : 0;
  const showFin = (f: FinField) => !coarse || activeFin === f;

  const o = rocketOutline(rocket);
  if (!(o.length > 0) || !(o.maxExtent > 0) || o.body.length < 2) return null;

  const W = Math.round(available * zoom);
  const padX = 14;
  const padY = 10;
  const s = (W - 2 * padX) / o.length; // pixels per metre (equal on both axes → true scale)
  // Vertical extent the view frames to. Editable diagrams reserve 30% headroom around the widest part
  // so a vertical handle (fin span, body diameter) has room to pull the edge outward; a static
  // (view-only) diagram fits tightly. A live vertical drag holds this fixed (see vFrameExtent) so the
  // frame doesn't chase the growing geometry.
  const V_HEADROOM = 1.3;
  const frameExtent = vFrameExtent ?? (onEdit ? o.maxExtent * V_HEADROOM : o.maxExtent);
  const centerY = padY + frameExtent * s;
  const H = centerY + frameExtent * s + padY;

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

  // Mouse hover previews a part; a click or tap PICKS it, and the pick sticks — hover alone can't,
  // because the pointer has to leave the shape to read anything about it. Touch fires no mouseleave,
  // so a tap does both. Keyboard parity comes from the focusable parts table.
  const hoverProps = (id: string) =>
    onHover || onSelect
      ? {
          onMouseEnter: () => onHover?.(id),
          onMouseLeave: () => onHover?.(null),
          onClick: () => onSelect?.(id),
        }
      : {};
  const cursor = onHover || onSelect ? "cursor-pointer" : "";

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

  // Fin drag handles sit on the fin set the fields are aimed at — the selected one, or the frontmost
  // when nothing is picked. Both edits they expose keep the diagram to scale, so the pointer maths
  // below is snapshot-and-map with no rescale to chase.
  const finStationNow = onEdit ? primaryFinStation(rocket, selectedFinSetId) : undefined;
  const finChord = onEdit ? primaryFinChord(rocket, selectedFinSetId) : undefined;
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
  const trapezoid = onEdit ? primaryFinRootChord(rocket, selectedFinSetId) !== undefined : false;
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

  // Span handle (pull the fin tip outward to resize the semi-span). Unlike the four horizontal
  // handles this changes the fin's radial extent, so it drags VERTICALLY, rides the reserved headroom
  // above the tip, and freezes the frame while dragging so the tip tracks the pointer. It applies to
  // every fin kind — span (height) is the one dimension a generic elliptical/freeform set edits
  // directly too. Bounds keep the tip inside the framed extent (so it stays visible) and off zero.
  const spanNow = primaryFin ? primaryFin.poly[1][1] - primaryFin.poly[0][1] : undefined; // tipR − seatR
  const seatR = primaryFin ? primaryFin.poly[0][1] : 0;
  const spanLo = spanNow !== undefined ? Math.min(spanNow, 0.005) : 0;
  const spanHi = spanNow !== undefined ? Math.max(spanNow, frameExtent - seatR) : 0;
  const spanCx = primaryFin ? X((primaryFin.poly[1][0] + primaryFin.poly[2][0]) / 2) : 0;
  const spanCy = primaryFin ? top(primaryFin.poly[1][1]) - 13 : 0; // a touch outside the tip, in the headroom

  // Diameter handle (pull the body wall outward to resize the caliber). Like the span it drags
  // VERTICALLY, rides the reserved headroom, and freezes the frame while dragging. It sits on the top
  // wall at the picked body tube's mid-station — the primary tube when nothing is picked — and drives
  // `bodyDiameter`, which scales the whole outer airframe to that caliber: the lever that sets the
  // reference area (and so the drag and the stability, measured in calibers). Its value is a diameter,
  // so the pointer→radius map is doubled (axisScale 2). Independent of the fins, so a finless design
  // still gets it. Bounds keep the wall inside the framed extent and off zero, always including
  // today's caliber.
  const bodyTube = onEdit ? primaryBodyTube(rocket, selectedBodyTubeId) : undefined;
  const bodyDiaNow = onEdit ? primaryBodyDiameter(rocket, selectedBodyTubeId) : undefined;
  const bodyPart = bodyTube ? o.parts.find((p) => p.id === bodyTube.id) : undefined;
  const bodyR = bodyTube ? bodyTube.outerRadius : 0;
  const diaLo = bodyDiaNow !== undefined ? Math.min(bodyDiaNow, 0.01) : 0;
  const diaHi = bodyDiaNow !== undefined ? Math.max(bodyDiaNow, 2 * frameExtent) : 0;
  const diaCx = bodyPart ? X((bodyPart.profile[0][0] + bodyPart.profile[bodyPart.profile.length - 1][0]) / 2) : 0;
  const diaCy = bodyPart ? top(bodyR) : 0;

  // Nose-length handle. The nose/body joint is the one place on the silhouette where the nose's
  // length is a visible edge, so that is where it goes: drag it aft and the cone stretches, forward
  // and it blunts, with everything downstream restacking. Bounds keep it a nose rather than a
  // needle or a disc, always including today's length.
  const nose = onEdit ? primaryNose(rocket) : undefined;
  // Body-length handle geometry — the aft edge of the PICKED tube, on the centreline so it cannot sit
  // under the diameter handle (which rides the top wall at mid-length) or the fin handles (which ride
  // the fin planform). It is the one dimension of a tube that had no grip at all: `Body length` could
  // only be typed, which is a gap the moment a flyer authors a tube and wants to size it by eye.
  const bodyLenNow = onEdit ? bodyTube?.length : undefined;
  const bodyLenLo = bodyLenNow !== undefined ? Math.min(bodyLenNow, 0.02) : 0;
  const bodyLenHi = bodyLenNow !== undefined ? Math.max(bodyLenNow * 2, 20 * (bodyTube?.outerRadius ?? 0.05)) : 0;
  const lenCx = bodyPart ? X(bodyPart.profile[bodyPart.profile.length - 1][0]) : 0;

  const noseLenNow = nose?.length;
  const noseLo = noseLenNow !== undefined ? Math.min(noseLenNow, 0.02) : 0;
  const noseHi = noseLenNow !== undefined ? Math.max(noseLenNow * 2, 12 * (nose?.aftRadius ?? 0.05)) : 0;
  const noseCx = nosePart ? X(nosePart.profile[nosePart.profile.length - 1][0]) : 0;
  const noseCy = nose ? top(nose.aftRadius) : 0;

  return (
    <figure className="m-0" ref={box}>
      <div className="overflow-x-auto overscroll-x-contain">
      <svg
        viewBox={`0 0 ${W} ${H.toFixed(0)}`}
        width={W}
        height={Math.round(H)}
        className="block max-w-none"
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
            root- and tip-chord handles (root and tip trailing corners) lengthen or shorten each chord;
            the span handle (above the tip) drags vertically to resize the semi-span. */}
        {onEdit && primaryFin && finStationNow !== undefined && (
          <>
            {showFin("finStation") && (
            <FinHandle
              units={units}
              field="finStation"
              label="Fin position"
              valueText={`${d.q(d.lengthMm(finStationNow, units))} from the nose`}
              title="Drag or use arrow keys to move the fins fore/aft"
              current={finStationNow}
              lo={finLo}
              hi={finHi}
              cx={stationCx}
              cy={stationCy}
              s={s}
              padX={padX}
              onEdit={onEdit}
              hitR={hitR}
            />
            )}
            {sweepNow !== undefined && showFin("finSweepLength") && (
              <FinHandle
                units={units}
                field="finSweepLength"
                label="Fin sweep"
                valueText={`${d.q(d.lengthMm(sweepNow, units))} of tip rake`}
                title="Drag or use arrow keys to rake the fin tip fore/aft"
                current={sweepNow}
                lo={sweepLo}
                hi={sweepHi}
                cx={sweepCx}
                cy={sweepCy}
                s={s}
                padX={padX}
                onEdit={onEdit}
                hitR={hitR}
              />
            )}
            {rootChordNow !== undefined && showFin("finRootChord") && (
              <FinHandle
                units={units}
                field="finRootChord"
                label="Fin root chord"
                valueText={`${d.q(d.lengthMm(rootChordNow, units))} root chord`}
                title="Drag or use arrow keys to lengthen or shorten the fin root"
                current={rootChordNow}
                lo={rootLo}
                hi={rootHi}
                cx={rootCx}
                cy={rootCy}
                s={s}
                padX={padX}
                onEdit={onEdit}
                hitR={hitR}
              />
            )}
            {tipChordNow !== undefined && showFin("finTipChord") && (
              <FinHandle
                units={units}
                field="finTipChord"
                label="Fin tip chord"
                valueText={`${d.q(d.lengthMm(tipChordNow, units))} tip chord`}
                title="Drag or use arrow keys to lengthen or shorten the fin tip"
                current={tipChordNow}
                lo={tipLo}
                hi={tipHi}
                cx={tipCx}
                cy={tipCy}
                s={s}
                padX={padX}
                onEdit={onEdit}
                hitR={hitR}
              />
            )}
            {spanNow !== undefined && showFin("finSpan") && (
              <FinHandle
                units={units}
                field="finSpan"
                axis="y"
                label="Fin span"
                valueText={`${d.q(d.lengthMm(spanNow, units))} semi-span`}
                title="Drag up/down or use arrow keys to resize the fin span"
                current={spanNow}
                lo={spanLo}
                hi={spanHi}
                cx={spanCx}
                cy={spanCy}
                s={s}
                padX={padX}
                centerY={centerY}
                onEdit={onEdit}
                hitR={hitR}
                onActiveChange={(active) =>
                  setVFrameExtent(active ? o.maxExtent * V_HEADROOM : null)
                }
              />
            )}
          </>
        )}

        {/* nose-length handle — grab the nose/body joint and stretch or blunt the cone */}
        {onEdit && nosePart && noseLenNow !== undefined && (
          <FinHandle
            units={units}
            field="noseLength"
            label="Nose length"
            valueText={`${d.q(d.lengthMm(noseLenNow, units))} long`}
            title="Drag or use arrow keys to lengthen or shorten the nose cone"
            current={noseLenNow}
            lo={noseLo}
            hi={noseHi}
            cx={noseCx}
            cy={noseCy}
            s={s}
            padX={padX}
            onEdit={onEdit}
            hitR={hitR}
          />
        )}

        {/* body-length handle — grab the tube's aft edge and stretch it. Everything behind it restacks,
            exactly as the number field already does, so the picture and the field are one edit.

            A FINE-pointer grip only, for the same measured reason the five fin handles collapse to one
            on a touch layout: at a phone's fit width the airframe is about eleven pixels tall, so every
            grip on the body is inside every other grip's 44 px target. The phone suite caught it as
            soon as this handle existed — the fin root chord's own centre resolved to "Body length" —
            and a control that steals another control's centre is worse than one that is not there. On
            a phone the tube's length stays the number field, which is a real control at a real size. */}
        {onEdit && !coarse && bodyPart && bodyLenNow !== undefined && (
          <FinHandle
            units={units}
            field="bodyLength"
            label="Body length"
            valueText={`${d.q(d.lengthMm(bodyLenNow, units))} long`}
            title="Drag or use arrow keys to lengthen or shorten this body tube"
            current={bodyLenNow}
            lo={bodyLenLo}
            hi={bodyLenHi}
            cx={lenCx}
            cy={centerY}
            s={s}
            padX={padX}
            onEdit={onEdit}
            hitR={hitR}
          />
        )}

        {/* body-diameter handle — grab the body wall to resize the caliber, independent of the fins */}
        {onEdit && bodyPart && bodyDiaNow !== undefined && (
          <FinHandle
            units={units}
            field="bodyDiameter"
            axis="y"
            axisScale={2}
            label="Body diameter"
            valueText={`${d.q(d.lengthMm(bodyDiaNow, units))} diameter`}
            title="Drag up/down or use arrow keys to resize the body diameter"
            current={bodyDiaNow}
            lo={diaLo}
            hi={diaHi}
            cx={diaCx}
            cy={diaCy}
            s={s}
            padX={padX}
            centerY={centerY}
            onEdit={onEdit}
            hitR={hitR}
            onActiveChange={(active) =>
              setVFrameExtent(active ? o.maxExtent * V_HEADROOM : null)
            }
          />
        )}
      </svg>
      </div>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        <ZoomControl zoom={zoom} onZoom={setZoom} />
        {coarse && onEdit && primaryFin && finStationNow !== undefined && (
          <FinHandlePicker
            value={activeFin}
            onChange={setActiveFin}
            offered={FIN_FIELDS.filter((f) =>
              f === "finStation"
                ? true
                : f === "finSweepLength"
                  ? sweepNow !== undefined
                  : f === "finRootChord"
                    ? rootChordNow !== undefined
                    : f === "finTipChord"
                      ? tipChordNow !== undefined
                      : spanNow !== undefined,
            )}
          />
        )}
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

/** Zoom for the diagram. A hobby airframe is a long thin thing — a 1.6 m rocket 56 mm across is a
 *  29:1 sliver — so fitting it to the column width is the only way to see the whole design and the
 *  worst way to see any of it. In a phone column, fit puts the body wall about eleven pixels apart,
 *  which is smaller than the drag handles on it. Zooming keeps the airframe to scale and lets the
 *  column scroll, the same escape hatch the desktop tools' rocket figures give. */
function ZoomControl({ zoom, onZoom }: { zoom: number; onZoom: (z: number) => void }) {
  const STEPS = [1, 1.5, 2, 3, 4, 6, 8];
  const i = STEPS.indexOf(zoom);
  const at = i < 0 ? 0 : i;
  const btn =
    "inline-flex items-center justify-center rounded-md border border-zinc-200 px-2 font-medium text-zinc-600 " +
    "hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-700 dark:text-zinc-300 " +
    "dark:hover:bg-zinc-800 " +
    TOUCH_TARGET_SQUARE;
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label="Diagram zoom">
      <button type="button" className={btn} onClick={() => onZoom(STEPS[at - 1])} disabled={at === 0} aria-label="Zoom out">
        −
      </button>
      <span className="min-w-10 text-center tabular-nums" aria-live="polite">
        {zoom === 1 ? "Fit" : `${zoom}×`}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => onZoom(STEPS[at + 1])}
        disabled={at === STEPS.length - 1}
        aria-label="Zoom in"
      >
        +
      </button>
    </span>
  );
}

/** A single draggable, focusable slider handle on the diagram — the direct-manipulation grip, drawn
 *  as an indigo grip. Most handles are HORIZONTAL (`axis` "x") and scale-stable — moving the fin
 *  group fore/aft, raking the tip, resizing a chord — so the drag is a plain snapshot-and-map: at
 *  pointer-down it records where the grab landed, then each move maps the pointer's x back to a
 *  station and applies the field. The VERTICAL handles (`axis` "y") — the fin span and the body
 *  diameter — map the pointer's y back to a radius (scaled by `axisScale`: ×1 for the span, ×2 for
 *  the diameter it drives), and because they change a radial extent they ask the parent (via
 *  `onActiveChange`) to freeze the frame for the drag so the grabbed edge tracks the pointer instead
 *  of the frame chasing the geometry. Owning its own drag refs keeps that ref access inside its own
 *  event handlers, where it belongs. */
/** Which fin dimension the diagram's single touch handle edits. Five handles within 22 px of each
 *  other is not a control a finger can use — one of them was provably unreachable — so a coarse
 *  pointer gets one handle and this row to aim it. The dimensions themselves are unchanged: this
 *  picks which one the picture exposes, not what can be edited. */
function FinHandlePicker({
  value,
  onChange,
  offered,
}: {
  value: FinField;
  onChange: (f: FinField) => void;
  offered: readonly FinField[];
}) {
  if (offered.length < 2) return null;
  return (
    <span role="group" aria-label="Fin handle" className="inline-flex flex-wrap items-center gap-1">
      <span className="text-zinc-500 dark:text-zinc-400">Drag:</span>
      {offered.map((f) => {
        const on = f === value;
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(f)}
            className={
              `inline-flex items-center rounded-md border px-2 ${TOUCH_TARGET_SQUARE} ` +
              (on
                ? "border-indigo-500 bg-indigo-500/10 font-medium text-indigo-700 dark:text-indigo-300"
                : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300")
            }
          >
            {FIN_FIELD_LABEL[f]}
          </button>
        );
      })}
    </span>
  );
}

function FinHandle({
  units,
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
  axis = "x",
  axisScale = 1,
  centerY = 0,
  onActiveChange,
  hitR = 0,
}: {
  /** The unit system on screen. A handle is the one place the number IS the feedback — there is
   *  nothing else to read while dragging — so it reports in the flyer's own units, like the caption
   *  above it and the field below it. */
  units: UnitSystem;
  field:
    | "finStation"
    | "finSweepLength"
    | "finRootChord"
    | "finTipChord"
    | "finSpan"
    | "bodyDiameter"
    | "bodyLength"
    | "noseLength";
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
  /** "x" maps the pointer's horizontal position to a station; "y" maps its vertical position to a
   *  radius (for the span). Defaults to "x". */
  axis?: "x" | "y";
  /** Multiplies the mapped axis value before it becomes the field value — 1 for a station or a
   *  radius-valued field (span), 2 for a diameter-valued one (the body caliber is twice the radius
   *  the pointer's y maps to). Defaults to 1. */
  axisScale?: number;
  /** Viewbox y of the centreline — needed to turn a pointer y into a radius (the "y" axis only). */
  centerY?: number;
  /** Called with true at drag start / false at drag end, so the parent can freeze the frame around a
   *  span drag. Only the span handle passes it. */
  onActiveChange?: (active: boolean) => void;
  /** Radius (px, and a user unit here IS a px) of an invisible circle that extends the grab area
   *  beyond the drawn dot. 0 leaves the handle exactly as drawn — right for a mouse, where the
   *  visible target is the real one; a touch layout passes half the 44 px minimum. */
  hitR?: number;
}) {
  const dragRef = useRef<{
    grabOffset: number;
    s: number;
    padX: number;
    centerY: number;
    axisScale: number;
    lo: number;
    hi: number;
    svg: SVGSVGElement;
    controller: AbortController;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingXRef = useRef(0);
  const pendingYRef = useRef(0);
  // Held in a ref so `end`/pointer-down stay stable across renders. `onActiveChange` is an inline
  // parent arrow (new identity each render); if it were a dependency of `end`, the freeze it triggers
  // would re-create `end`, firing the unmount-cleanup effect below and aborting the very drag that
  // set it — so the span drag would die on its first move. The ref sidesteps that.
  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);
  // Show the live value while the handle is in use — dragging or keyboard-focused. It gives the
  // mouse a precise number to aim for and puts on screen, for sighted keyboard users, the value that
  // otherwise only reaches assistive tech through aria-valuetext.
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  // Map the pending pointer position (through the SVG's live transform) to this axis's value and
  // apply it, on the next frame — the window handlers fire far faster than paint.
  const apply = useCallback(() => {
    rafRef.current = null;
    const dg = dragRef.current;
    const ctm = dg?.svg.getScreenCTM();
    if (!dg || !ctm) return;
    const pt = dg.svg.createSVGPoint();
    pt.x = pendingXRef.current;
    pt.y = pendingYRef.current;
    const local = pt.matrixTransform(ctm.inverse());
    const mapped = (axis === "y" ? (dg.centerY - local.y) / dg.s : (local.x - dg.padX) / dg.s) * dg.axisScale;
    onEdit({ [field]: Math.min(dg.hi, Math.max(dg.lo, mapped - dg.grabOffset)) });
  }, [field, onEdit, axis]);

  const onMove = useCallback(
    (ev: PointerEvent) => {
      pendingXRef.current = ev.clientX;
      pendingYRef.current = ev.clientY;
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
    onActiveChangeRef.current?.(false);
  }, []);

  useEffect(() => end, [end]); // clean up an in-flight drag on unmount

  /** The handle's numeric ARIA trio, in the unit system on screen. It has to agree with
   *  `aria-valuetext`: a valuetext in inches over a valuenow in millimetres is two different answers
   *  to the same question, and a reader that ignores the text announces the one nobody chose. */
  const ariaNum = (m: number) => (units === "imperial" ? Number((m * 39.3701).toFixed(2)) : Math.round(m * 1000));

  return (
    <g
      className={`group touch-none outline-none ${axis === "y" ? "cursor-ns-resize" : "cursor-ew-resize"}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === "y" ? "vertical" : "horizontal"}
      aria-valuemin={ariaNum(lo)}
      aria-valuemax={ariaNum(hi)}
      aria-valuenow={ariaNum(current)}
      aria-valuetext={valueText}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(ev) => {
        // A step scaled to the handle's own range: an arrow crosses it in ~100 nudges, Shift in ~10.
        // A single 10 mm "fine" step could not reach 62 mm on a 57 mm airframe, and Shift made it
        // coarser still — the wrong way round for the key that means "carefully".
        const span = Math.max(0, hi - lo);
        const fine = Math.max(0.0005, span / 100); // never below half a millimetre
        const step = ev.shiftKey ? fine * 10 : fine;
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
        pt.y = ev.clientY;
        const local = pt.matrixTransform(ctm.inverse());
        const mapped = (axis === "y" ? (centerY - local.y) / s : (local.x - padX) / s) * axisScale;
        const controller = new AbortController();
        dragRef.current = { grabOffset: mapped - current, s, padX, centerY, axisScale, lo, hi, svg, controller };
        window.addEventListener("pointermove", onMove, { signal: controller.signal });
        window.addEventListener("pointerup", end, { signal: controller.signal });
        window.addEventListener("pointercancel", end, { signal: controller.signal });
        setDragging(true);
        onActiveChangeRef.current?.(true);
      }}
    >
      {/* The grab area, drawn first so everything visible paints over it. Transparent rather than
          absent: a fill of `none` is not hit-testable, and this circle IS the touch target. */}
      {hitR > 0 && <circle cx={cx} cy={cy} r={hitR} fill="transparent" />}
      {/* focus ring — only shown when the handle is keyboard-focused */}
      <circle cx={cx} cy={cy} r={11} className="fill-none stroke-indigo-400 opacity-0 group-focus-visible:opacity-100" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={7} className="fill-indigo-500/90 stroke-white dark:stroke-zinc-900" strokeWidth={1.5} />
      <path
        d={
          axis === "y"
            ? `M ${cx} ${cy - 4} v 8 M ${cx} ${cy - 4} l -2 2 m 2 -2 l 2 2 M ${cx} ${cy + 4} l -2 -2 m 2 2 l 2 -2`
            : `M ${cx - 4} ${cy} h 8 M ${cx - 4} ${cy} l 2 -2 m -2 2 l 2 2 M ${cx + 4} ${cy} l -2 -2 m 2 2 l -2 2`
        }
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
          {d.q(d.lengthMm(current, units))}
        </text>
      )}
      <title>{title}</title>
    </g>
  );
}
