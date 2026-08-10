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
  primaryMassObject,
  type GeometryEdits,
  type MoveSlot,
} from "@/lib/model/edit";
import { flattenRocket } from "@/lib/model/geometry";
import type { MotorMark } from "@/lib/sim/setup";
import { useMeasuredWidth } from "./LineChart";
import { Button, Segmented, Swatch } from "./ui";
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

/** **Hold the page still while a gesture on the drawing is live.**
 *
 *  The drawing changes HEIGHT as it is dragged — a wider caliber, a longer span, a carried part
 *  moving between slots — and when its top edge is above the viewport the browser's scroll anchoring
 *  compensates by scrolling, to keep whatever it chose as the anchor still. The grip slides out from
 *  under the finger, the mapping reads a station the finger never visited, and the value runs away.
 *
 *  Measured on the bundled 38 mm design at 1440x900, dragging the body wall UP by 30 px (which must
 *  WIDEN it): from scrollY 484 the page scrolled itself to 786 and the caliber went **38 mm to
 *  10 mm**, the clamp floor — the exact opposite of the gesture. Held still it gives **205 mm**.
 *  Nothing in the drag maths was wrong; the page moved underneath it.
 *
 *  Suppressed on the SCROLL ROOT, because that is the element that performs the adjustment: setting
 *  it on the figure that changes size does nothing, since the anchor is chosen from the content
 *  BELOW the change. Only while a gesture is live — anchoring is worth having the rest of the time,
 *  and this app resizes content above the fold constantly. Restores whatever was there rather than
 *  clearing, so two overlapping gestures cannot leave it off.
 *
 *  It survived every green gate because every scroll position the suite dragged from happened to
 *  have the diagram's top on screen. The persistent airframe strip pushed `/design` down far enough
 *  that it no longer did — the defect was revealed by that change, not caused by it. */
function useHeldScroll(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const prev = root.style.overflowAnchor;
    root.style.overflowAnchor = "none";
    return () => {
      root.style.overflowAnchor = prev;
    };
  }, [active]);
}

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
  onMoveTo,
  moveSlotsFor,
  selectedFinSetId,
  selectedBodyTubeId,
  selectedMassObjectId,
  variant = "full",
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
  /** Commit a reorder: put this part immediately behind `after`, or first when `after` is null.
   *
   *  Deliberately its own callback rather than an `onEdit({ moved })`. The app applies an edit patch
   *  by SPREADING it over the bag, so a `moved` array sent that way replaces the whole list — every
   *  earlier reorder, and every undo step that goes with it, gone. Appending is the caller's job and
   *  this is the door into it. */
  onMoveTo?: (id: string, after: string | null) => void;
  /** Every legal drop for a part, resolved by the app against the tree the operation runs against —
   *  NOT against the rocket drawn here, which carries dimension edits that synthesise top-level parts
   *  the operation cannot address. Each slot names the part it lands in front of, and this component
   *  turns that into a station and then a pixel. */
  moveSlotsFor?: (id: string) => MoveSlot[];
  /** Which fin set and body tube the editor's fields — and therefore these handles — are aimed at. The
   *  handles emit ABSOLUTE values, so reading one off a different part than the edit writes to would
   *  snap the edited part to the read part's dimensions on the first nudge. */
  selectedFinSetId?: string;
  selectedBodyTubeId?: string;
  selectedMassObjectId?: string;
  /** `"strip"` is the persistent airframe above the workspace spine, and it differs from the full
   *  drawing in exactly two ways — both because it is a REMINDER of the subject rather than the
   *  surface you work on.
   *
   *  **It never rotates.** The full drawing turns upright on a phone held upright (`DESIGN.md` §8),
   *  which is right for the drawing you are editing and wrong for a strip: the rotated layout takes a
   *  500 px height budget, and 500 px of chrome above every workspace is not a strip, it is a second
   *  panel the flyer has to scroll past to reach the numbers they navigated for.
   *
   *  **It carries no zoom control.** Zoom belongs to the surface you are working on; on the strip it
   *  is a control with no task, and `DESIGN.md` §5 does not spend a control row on one.
   *
   *  Everything else is shared deliberately — one outline, one CG/CP marking, one set of tap columns
   *  — so the picture above the spine and the picture on `/design` cannot drift into disagreeing
   *  about the same rocket. */
  variant?: "full" | "strip";
}) {
  const uid = useId();
  // A drag-frozen vertical extent, set while a vertical resize handle is being dragged (the fin SPAN
  // or the body DIAMETER). The diagram normally fits the airframe tightly, which pins the widest part
  // to the frame edge — so an outward drag couldn't move it. When editable we reserve a little
  // headroom (below), and while such a drag is live we hold the frame at its grab-time extent so the
  // grabbed edge tracks the pointer instead of the frame chasing the growing geometry. Null otherwise.
  const [vFrameExtent, setVFrameExtent] = useState<number | null>(null);
  // The reorder drag in flight: which part is being carried, and where the indicator goes. The
  // POSITION rather than the slot index, because the render needs a pixel and a ref may not be read
  // during one — the slot itself stays in a ref, where the commit reads it.
  const [carry, setCarry] = useState<{ id: string; px: number } | null>(null);
  useHeldScroll(carry !== null);
  // Everything the live drag needs, snapshotted at pointer-down. The slot table in particular: with no
  // live preview the geometry does not move under the pointer, but a re-render for any other reason
  // (a hover, a re-fly finishing) would otherwise recompute it mid-gesture.
  const carryRef = useRef<{
    id: string;
    slots: { after: string | null; px: number }[];
    startX: number;
    moved: boolean;
    controller: AbortController;
  } | null>(null);
  const carryRafRef = useRef<number | null>(null);
  const carryXRef = useRef(0);
  // The chosen slot, in a ref as well as in state: `pointerup`'s handler is created once at
  // pointer-down, so the state it closes over is the one from that render and would commit the first
  // slot however far the pointer travelled.
  const slotAtRef = useRef(0);
  // The containing <svg>, captured at pointer-down. Reading it from the event each frame is not an
  // option — the window handlers fire on the window, not on the path.
  const svgRef = useRef<SVGSVGElement | null>(null);

  const endCarry = useCallback(() => {
    carryRef.current?.controller.abort();
    carryRef.current = null;
    if (carryRafRef.current != null) {
      cancelAnimationFrame(carryRafRef.current);
      carryRafRef.current = null;
    }
    setCarry(null);
  }, []);
  useEffect(() => endCarry, [endCarry]); // an in-flight drag must not outlive the component
  // Set at the end of a real drag so the pointerup's synthetic click does not also PICK the part.
  // Without it every reorder silently re-aims the editor's fields at whatever was dragged, which on a
  // field holding an absolute value is a change to the design, not just to the selection.
  const suppressClick = useRef(false);
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

  /** **A phone held upright draws the rocket upright** — `DESIGN.md` §8's orientation rule. Read in
   *  an effect for the same reason `coarse` is: the server has no viewport, so deciding this during
   *  render is a hydration mismatch.
   *
   *  **Portrait AND coarse, never coarse alone.** A phone in landscape gives a horizontal drawing far
   *  more room than a vertical one — `e2e/touch-landscape.spec.ts` runs 863x360, where the drawing
   *  gets ~831 px of width against at most ~340 px of height — so rotating there is strictly worse,
   *  and that suite has a case saying it does not happen. */
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const sync = () => setPortrait(mq.matches);
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

  // The strip stays horizontal whatever the device is doing — see `variant`.
  const vertical = variant !== "strip" && coarse && portrait;
  /** The column the drawing sits in. `W` below is the drawing's own width, which is the same thing
   *  horizontally and is the LENGTH extent once rotated. */
  const colW = Math.round(available * zoom);
  const basePadX = 14;
  const padY = 10;
  // Editable diagrams reserve 30% headroom around the widest part so a radial grip (fin span, body
  // diameter) has room to pull the edge outward; a static diagram fits tightly. A live radial drag
  // holds this fixed (see `vFrameExtent`) so the frame doesn't chase the growing geometry.
  const V_HEADROOM = 1.3;
  const frameExtent = vFrameExtent ?? (onEdit ? o.maxExtent * V_HEADROOM : o.maxExtent);
  /** **How much screen height a rotated airframe may use, and it is a named constant because the
   *  milestone that needed it could not be scoped without one.** `useMeasuredWidth` is the only
   *  measurement hook in this codebase and it measures width; a height cannot be read from `100vh`
   *  during render without a hydration mismatch, so this is stated rather than discovered.
   *
   *  500 px of the 664 px `e2e/touch.spec.ts` runs at, leaving room above and below rather than
   *  filling the viewport with one drawing. **What it buys is legibility, not hit targets:** at
   *  fit-width the bundled 38 mm single-deploy airframe renders 296 x 11.8 px, which is to scale and
   *  unreadable as a rocket; at this budget it is 500 x 19.2 px. None of the bundled designs reaches
   *  §8's 44 px that way and this must not be sold as if it did — the tap columns stay the hit
   *  targets, exactly as before. */
  const VERTICAL_HEIGHT_BUDGET = 500;
  /** **How much height the persistent strip may use, and why it needs a budget at all.**
   *
   *  A horizontal drawing is true to scale with its length filling the column, so its HEIGHT is set
   *  by the airframe's widest point — which is the fin span, not the tube. Measured on the bundled
   *  38 mm single-deploy at 1440 px: the same drawing that is 12 px tall in a narrow panel is
   *  **216 px** across a full-width desktop column, because the fins scale with everything else.
   *  That is a correct drawing and a terrible strip: it put 280 px of chrome above every workspace
   *  and pushed the sweep's first answer to 2.13 screens on a phone, past `DESIGN.md`'s two-screen
   *  rule, which `e2e/depth.spec.ts` caught on the first run.
   *
   *  So the strip is height-bound rather than width-bound: the scale is whichever of the two limits
   *  binds first, and a design that cannot fill the column at this height is drawn smaller and
   *  centred rather than cropped. Same shape as the rotated layout's budget directly above, for the
   *  same reason — a height cannot be read during render without a hydration mismatch, so it is
   *  stated. */
  const STRIP_HEIGHT_BUDGET = 72;
  /** Pixels per metre — equal on both axes, so the drawing stays true to scale whichever way it runs.
   *
   *  Horizontal: the length fills the column. Vertical: the length fills the HEIGHT budget, and the
   *  result is then held so the airframe's widest point still fits the column. A short wide design is
   *  caliber-bound rather than length-bound, and letting it overflow would push the airframe past the
   *  panel's edge with no way to reach it, because the wrapper scrolls horizontally only. */
  const s = vertical
    ? Math.min(
        (VERTICAL_HEIGHT_BUDGET - 2 * padY) / o.length,
        (colW - 2 * padY) / (2 * frameExtent),
      )
    : variant === "strip"
      ? Math.min(
          (colW - 2 * basePadX) / o.length,
          (STRIP_HEIGHT_BUDGET - 2 * padY) / (2 * frameExtent),
        )
      : (colW - 2 * basePadX) / o.length;
  /** The drawing's left inset. Constant everywhere except the strip, where a height-bound design is
   *  narrower than its column and is centred in it — a rocket pinned to the left edge under a full
   *  width of empty space reads as a layout fault rather than as a scale. Every consumer of the
   *  x-mapping takes this same value, including the drag handles' inverse mapping, so the picture and
   *  the pointer cannot disagree about where a station is. */
  const padX =
    variant === "strip" ? Math.max(basePadX, (colW - o.length * s) / 2) : basePadX;
  /** The drawing's own width, in its own coordinates: the airframe's LENGTH plus padding. Identical
   *  to the column horizontally; once rotated it is what becomes the drawing's screen HEIGHT. */
  const W = vertical ? Math.round(2 * basePadX + o.length * s) : colW;
  const centerY = padY + frameExtent * s;
  const H = centerY + frameExtent * s + padY;

  const X = (x: number) => padX + x * s;
  const top = (r: number) => centerY - r * s;
  const bot = (r: number) => centerY + r * s;

  /** Tap columns for the parts with no body outline — fin sets and mass objects. See where they are
   *  rendered for what they cost and why they sit where they do in the paint order.
   *
   *  **A mass object's column is clipped to the midpoint between it and its neighbours, and that is
   *  the whole of the difficulty.** A fin set has a real extent to widen; a mass is a station, and
   *  stations cluster — measured across the corpus, **12 of 30 neighbouring pairs sit closer than
   *  44 px apart at this width, one of them at 0.0**. Two unclipped 44 px columns would overlap, and
   *  in an overlap the later-painted one wins, so which mass a tap selected would depend on nothing
   *  but list order. Clipping to the midpoint makes a tap resolve to the NEAREST mass, always, and
   *  gives each one every pixel the geometry allows. **Two masses at the SAME station collapse both
   *  midpoints onto themselves and get no column at all** — the corpus has such a pair, the 0.0 in
   *  that spread — and that is the right answer rather than a defect: at one station there is one
   *  place to tap and no rule can hand it to both. They keep their drawn dots, and the zoom control,
   *  already a 44 px target, is what separates them. */
  const TAP_MIN = 44;
  const tapColumns: { id: string; x0: number; x1: number }[] = [];
  /** Clamp into the drawing, and drop anything too thin to be a target. Both halves are load-bearing:
   *  `Math.max(0, …)` and `Math.min(W, …)` applied independently can cross over for a part centred
   *  outside the viewBox and emit `<rect width="-12">`, which a browser rejects with a console error
   *  and no rect at all — a silently missing target. And a column a few pixels wide is not a touch
   *  target, only a way for one part to shadow another. A part left with none keeps the shape it is
   *  drawn as, exactly as before this existed. */
  const column = (id: string, from: number, to: number) => {
    const x0 = Math.min(Math.max(0, from), W);
    const x1 = Math.min(Math.max(x0, to), W);
    if (x1 - x0 >= 4) tapColumns.push({ id, x0, x1 });
  };
  for (const fin of o.fins) {
    const xs = fin.poly.map(([x]) => X(x));
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    const mid = (lo + hi) / 2;
    const half = Math.max((hi - lo) / 2, TAP_MIN / 2);
    column(fin.id, mid - half, mid + half);
  }
  // Sorted by station so "neighbour" means what it says. Masses go in AFTER the fins so a mass that
  // shares a fin set's station stays reachable — it is the smaller, more specific object, and the
  // fin's own drawn planform is painted later still and wins back its exact shape.
  const massAt = o.masses.map((m) => ({ id: m.id, cx: X(m.x) })).sort((a, b) => a.cx - b.cx);
  massAt.forEach((m, i) => {
    const before = massAt[i - 1];
    const after = massAt[i + 1];
    const lo = before ? (before.cx + m.cx) / 2 : 0;
    const hi = after ? (m.cx + after.cx) / 2 : W;
    column(m.id, Math.max(m.cx - TAP_MIN / 2, lo), Math.min(m.cx + TAP_MIN / 2, hi));
  });

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
          // **Which PART this element selects, readable from the DOM.** Every hit-bearing shape on
          // the diagram goes through this helper — the tap columns, the per-part silhouettes, the fin
          // planforms, the mass dots — so one attribute here labels all of them and nothing can carry
          // a click without carrying its identity.
          //
          // It exists because the touch check could not otherwise ask the right question. It sampled
          // each column with `elementFromPoint` and counted a point as reaching the part only when it
          // landed on that exact rect — so a point landing on the DRAWN fin, which selects the very
          // same part, counted as a miss. The fin column measured 32% by that rule and 49% by the one
          // that matters — and this suite gates reach at 40%, so the identity rule would have FAILED
          // the very target it exists to check. A metric that punishes a more specific target for
          // existing would have pushed the next session to delete it.
          "data-part": id,
          onMouseEnter: () => onHover?.(id),
          onMouseLeave: () => onHover?.(null),
          onClick: () => {
            // A reorder drag ends on this same element, and its pointerup synthesises a click. Left
            // alone that click also PICKS the part, and a pick re-aims the editor's fields — which,
            // on a field holding an absolute value, changes the design rather than the selection.
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            onSelect?.(id);
          },
        }
      : {};
  const cursor = onHover || onSelect ? "cursor-pointer" : "";

  // Reorder by dragging a part along the airframe — the direct-manipulation half of R4, with the
  // parts panel's move buttons as its keyboard and touch equivalent.
  //
  // Fine pointers only, like the two centreline grips, and for the measured reason they are: at a
  // phone's fit width the airframe is about eleven pixels tall, so a drag started on the body
  // silhouette competes with every grip inside it. The buttons ARE the touch path.
  //
  // There is no live preview. The picture does not restack until the pointer is released, which is
  // what the desktop tools' component trees do too, and it is what keeps the slot table valid for the
  // whole gesture: a committed preview moves the boundaries by design, so a target recomputed from
  // the new geometry maps the same pointer x back to the previous slot and the part oscillates.
  const draggable = !!(onMoveTo && moveSlotsFor && !coarse);
  /** Station (m) of the joint a slot's indicator belongs at: the fore end of the part it lands in
   *  front of, or the aft end of the airframe. Read off the rocket being DRAWN — the anchor came from
   *  the tree the operation runs against, and these are deliberately two different trees. */
  const slotStation = (before: string | null): number | null => {
    if (before === null) return o.length;
    const p = o.parts.find((x) => x.id === before);
    return p ? p.profile[0][0] : null;
  };

  /** Map the pending pointer x to the nearest legal slot, on the next frame. */
  const trackCarry = () => {
    carryRafRef.current = null;
    const dg = carryRef.current;
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!dg || !svg || !ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = carryXRef.current;
    pt.y = 0;
    const x = pt.matrixTransform(ctm.inverse()).x;
    // A movement threshold, in SCREEN pixels, so a click that wobbles is still a click. Without it
    // every pick on the airframe would also commit a reorder to wherever the pointer happened to be.
    if (Math.abs(carryXRef.current - dg.startX) > 4) dg.moved = true;
    let best = 0;
    for (let i = 1; i < dg.slots.length; i++) {
      if (Math.abs(dg.slots[i].px - x) < Math.abs(dg.slots[best].px - x)) best = i;
    }
    slotAtRef.current = best;
    const px = dg.slots[best].px;
    setCarry((c) => (c && c.px === px && c.id === dg.id ? c : { id: dg.id, px }));
  };

  const beginCarry = (ev: React.PointerEvent<SVGPathElement>, id: string) => {
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg || !onMoveTo || !moveSlotsFor) return;
    const slots = moveSlotsFor(id)
      .map((s) => {
        const station = slotStation(s.before);
        return station === null ? null : { after: s.move.after, px: X(station) };
      })
      .filter((s): s is { after: string | null; px: number } => s !== null);
    if (!slots.length) return;
    // `preventDefault` for the same reason the other grips call it — it stops the native text
    // selection a drag across the page would otherwise start. It does NOT take the click with it for a
    // mouse pointer, which was checked rather than assumed: with it restored, a plain click on a part
    // still picks that part, and the suppression below is still what stops a DRAG from doing so.
    ev.preventDefault();
    ev.stopPropagation();
    // Cleared at the START of every gesture, not left to be consumed by the click it suppresses. A
    // drag does not always produce one — the pointer can leave the element, or the browser can decide
    // the down and the up were too far apart to be a click — and a flag left standing then swallows
    // the NEXT genuine pick instead. Clearing here bounds it to exactly one click: the one this
    // gesture is about to synthesise, if it synthesises one at all.
    suppressClick.current = false;
    svgRef.current = svg;
    const controller = new AbortController();
    carryRef.current = { id, slots, startX: ev.clientX, moved: false, controller };
    carryXRef.current = ev.clientX;
    slotAtRef.current = 0;
    setCarry({ id, px: slots[0].px });
    // Put the indicator on the slot nearest the grab BEFORE the pointer moves, so the first frame is
    // not a promise to drop the part at the nose.
    trackCarry();
    const onMove = (e: PointerEvent) => {
      carryXRef.current = e.clientX;
      if (carryRafRef.current == null) carryRafRef.current = requestAnimationFrame(trackCarry);
    };
    const onUp = () => {
      const dg = carryRef.current;
      const at = dg?.slots[slotAtRef.current];
      if (dg?.moved && at) {
        // Suppress the click this pointerup is about to synthesise. It lands on the same path, whose
        // click handler PICKS the part — and a pick re-aims the editor's fields, which on a field
        // holding an absolute value changes the design rather than the selection.
        suppressClick.current = true;
        onMoveTo(dg.id, at.after);
      }
      endCarry();
    };
    window.addEventListener("pointermove", onMove, { signal: controller.signal });
    window.addEventListener("pointerup", onUp, { signal: controller.signal });
    window.addEventListener("pointercancel", () => endCarry(), { signal: controller.signal });
  };

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

  // Mass-object handle. A point mass is the one part whose whole geometry IS a station, so it is the
  // one that most needs a grip — R3's *done when* asks for a part placed "at a station by direct
  // manipulation", and a typed millimetre is not that. It rides the centreline on the mark already
  // drawn for it, and its bounds are the part holding it: the model clamps the station into its host
  // anyway (a point mass outside the airframe would still be flown), so a handle that could be dragged
  // past the end would stick at a value the pointer had left behind.
  const massNow = onEdit ? primaryMassObject(rocket, selectedMassObjectId) : undefined;
  const massPlaced = massNow ? flattenRocket(rocket).find((p) => p.component.id === massNow.id) : undefined;
  const massHost = massNow
    ? flattenRocket(rocket).find((p) => p.component.children.some((c) => c.id === massNow.id))
    : undefined;
  const massStationNow = massPlaced?.xFore;
  const massLo = massHost ? massHost.xFore : 0;
  const massHi = massHost ? massHost.xFore + massHost.length : 0;
  const massCx = massStationNow !== undefined ? X(massStationNow) : 0;

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
        // **Rotated, the box swaps and NOTHING ELSE IN THIS FILE CHANGES.** Every coordinate below
        // stays in the drawing's own space — station along `x`, radius about `centerY` — and one
        // transform on the group that holds them turns the whole picture a quarter turn. That is why
        // the tap columns, the labels, the CG/CP marks and the nine grips need no rotated variants:
        // there is one drawing and two framings of it, rather than two drawings to keep in step.
        viewBox={vertical ? `0 0 ${H.toFixed(0)} ${W}` : `0 0 ${W} ${H.toFixed(0)}`}
        width={vertical ? Math.round(H) : W}
        height={vertical ? W : Math.round(H)}
        className="block max-w-none"
        // A pure picture is an `img`; once it carries the interactive fin handle it becomes a
        // labelled `group` — an `img` may not hold focusable descendants (it's an atomic graphic).
        role={onEdit ? "group" : "img"}
        // **The strip is named differently on purpose, and it is an accessibility fix before it is a
        // selector one.** Two graphics with the same accessible name on one page is a worse thing to
        // hand a screen reader than it is to hand a test: "scale side-view of X" twice gives no way
        // to tell the working drawing from the reminder above the spine. Naming them apart also
        // resolves the strict-mode ambiguity the strip introduced across four existing selectors,
        // which is the same problem stated in the other direction.
        aria-label={`${
          variant === "strip" ? "Airframe reminder" : "Scale side-view"
        } of ${rocket.name || "the rocket"}: ${lengthLabel} long, ${d.q(d.lengthMm(2 * o.maxRadius, units))} maximum diameter${motorLabel ? `, motor ${motorLabel}` : ""}${marginLabel && showCg && showCp ? `, centre of gravity ahead of centre of pressure by ${marginLabel}` : ""}`}
        preserveAspectRatio="xMidYMid meet"
      >
      {/* **Nose at TOP, which is settled by convention rather than taste**: `MassBreakdown`'s "CG from
          nose", `GeometryInspector`'s station sort and its "at X from the nose" readout, and the
          parts table's design order all read nose-first, and nose-at-bottom would contradict all
          four. `rotate(90) translate(0,-H)` sends drawing (x, y) to screen (H - y, x): station zero —
          the nose tip — lands at screen y 0. */}
      <g transform={vertical ? `rotate(90) translate(0,${-H})` : undefined}>
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

        {/* **A full-height tap COLUMN per part, on a coarse pointer only** — the touch target the
            silhouette itself can never be. Measured on the built export at 390 px with the bundled
            sample: the two body parts that carry an overlay render **78x12 and 218x12 px** against
            `DESIGN.md` §8's 44, because at fit width the airframe is about eleven pixels tall. No
            amount of care on the shape fixes that; the shape IS the rocket, drawn to scale.
            Extending each part's hit area over the diagram's whole height gives it a target a thumb
            can find without changing a drawn pixel.

            **Drawn FIRST — before the fins, the masses, the silhouette and every handle — and the
            order is the whole of the correctness here.** SVG paints in document order and hit-tests
            the topmost, so anything painted later still wins inside a column. That is what keeps the
            grips working (each carries its own 44x44 `hitR` circle, and a grip is a smaller, more
            specific target the flyer aimed at), and it is what keeps the FIN SETS and MASS OBJECTS
            working — both already carried `hoverProps` and were tappable on a phone.

            **A first version put these after the fins and buried them**: a fin's planform sits
            inside its host tube's x-range and inside the column's full height, so tapping a fin
            selected "Body tube". That is a strict LOSS of a working target on the surface this
            exists to improve, and it was hidden by a wrong premise — that only the two body parts
            had diagram targets. Four of the sample's eight parts did. Painted first, the column is
            the FALLBACK: it catches the area nothing more specific claims, which is exactly the
            eleven-pixel gap that made the picture untappable, and it takes nothing from anything.

            Not on a fine pointer: a mouse has the precision for the silhouette, and full-height
            columns there would swallow the hover previews the diagram is built around. */}
        {/* Gated on `onSelect` alone, not `onHover || onSelect`: the rect wires only a click, so a
            caller passing hover and no select would get invisible full-height rects that do nothing
            but swallow taps meant for the fins and the silhouette beneath. Latent today —
            `GeometryInspector` passes both — but it is a trap one prop away. */}
        {coarse &&
          onSelect &&
          o.parts.map((part) => {
            const xs = part.profile.map(([x]) => X(x));
            const x0 = Math.min(...xs);
            const x1 = Math.max(...xs);
            if (!(x1 > x0)) return null;
            return (
              <rect
                key={`tap${uid}${part.id}`}
                x={x0}
                y={0}
                width={x1 - x0}
                height={H}
                className="fill-transparent"
                // `hoverProps` rather than a hand-rolled click, and that is not just less code. It
                // carries the onMouseEnter/onMouseLeave pair the silhouette has, and a coarse pointer
                // still fires those as compatibility events — which is what sets `hoveredId`, and
                // `activeId = hoveredId ?? selectedId` is what drives both the diagram tint and the
                // "what you just pointed at" readout. A click-only rect left that path dead, so the
                // readout rode on `selectedId` alone — and `pick` TOGGLES, so a second tap anywhere
                // in the now much larger column cleared the selection and blanked the readout. It
                // also inherits the reorder-drag suppression, keeping the two in step if that
                // gesture ever becomes touch-capable.
                {...hoverProps(part.id)}
              />
            );
          })}
        {/* **The two kinds with no body outline, and the reason increment 5 stopped short of them.**
            The columns above are built from `o.parts`, which is body silhouettes only — a nose cone,
            a tube, a transition. A fin set and a mass object are drawn from their own geometry and
            were left with the shape they are DRAWN as, which is what a thumb then has to hit.

            Measured over all 35 corpus designs at this fit width: of 64 fin sets, the planform is a
            median 32.1 px wide and 16.0 px tall — **45 of 64 under 44 px wide and 63 of 64 under
            44 px tall**. A mass object is worse and does not vary: it is drawn as an r=3.5 dot, so
            **7 px**, on all 56 of them.

            Same column, then, and the same reasoning as above: full height, at least `TAP_MIN` wide,
            transparent, not a drawn pixel changed. Painted AFTER the body columns and BEFORE the
            drawn fins and masses, which is the only ordering that works — earlier and the body column
            covers the same area and wins, so the target would do nothing at all.

            **Painted BEFORE the drawn fins, the silhouette and the per-part overlays — a fallback,
            never a winner — and a version that got this wrong was caught by the pre-push review.**
            Moving them after the per-part overlays does buy the fin a bigger share of its own column
            (52% against 49%, and the mass 100% against 90%), and it costs two things that matter
            more. A body part NARROWER than 44 px that happens to lie inside a fin's or a mass's
            column is then covered whole and has no tap point at all — 56 of the 150 body parts across
            the corpus are under 44 px wide, so this is not a corner case. And a mass column sitting
            at a fin's station buries the fin's own drawn planform, destroying the target this exists
            to create. Increment 5 learned the same lesson from the other side and wrote it down; the
            rule is that a column catches what nothing more specific claims, and it is worth more than
            the percentage.

            **What that costs, stated rather than glossed:** at a fin set's own station the column now
            beats the body tube's. Tapping the tube's centre between the two fin planforms selects the
            FIN. That is the right answer where a fin is drawn — it is what the flyer is looking at —
            and it is a small slice of the tube: 44 px against body columns of 78 and 218 px on the
            bundled sample. The alternative, two rects that stop at the centreline, cannot reach 44 px
            tall at all, because the whole diagram is 84 px high at this width.

            **And what it does NOT close, measured rather than implied.** Sampling each column on a
            9x9 grid and attributing every point: a mass object's column reaches it on 73 of 81, the
            rest going to the body silhouette it sits inside. A fin set's reaches it on 40 of 81, and
            the largest single claimant of the rest is the fin's own *Fin position* grip — a 44x44
            circle on the centreline at exactly that station. So the PRIMARY fin set (the only one
            that gets a grip) is selectable in bands above and below its own grip plus its drawn
            planform; every other fin set keeps more. That is a real gain on 32x16 and it is not yet
            44x44. Closing it means the grip and the fin wanting different places to live — a taller
            diagram on a coarse pointer — which spends the depth contract `e2e/depth.spec.ts` holds,
            so it is filed rather than bundled in here. */}
        {coarse &&
          onSelect &&
          tapColumns.map((c) => (
            <rect
              key={`tap${uid}${c.id}`}
              x={c.x0}
              y={0}
              width={c.x1 - c.x0}
              height={H}
              className="fill-transparent"
              {...hoverProps(c.id)}
            />
          ))}
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

        {/* per-part overlays: transparent hit targets that tint their part when hovered/highlighted,
            and — on a fine pointer — the grab target for a reorder drag. The silhouette is already
            closed, hit-testable and addressed by component id, so the gesture needs no new geometry. */}
        {o.parts.map((part) => {
          const canCarry = draggable && (moveSlotsFor?.(part.id).length ?? 0) > 0;
          const lifted = carry?.id === part.id;
          return (
            <path
              key={`part${uid}${part.id}`}
              d={partPath(part.profile)}
              className={
                (lifted
                  ? "fill-indigo-500/25 dark:fill-indigo-400/25"
                  : part.id === highlightId
                    ? "fill-indigo-400/40 dark:fill-indigo-400/30"
                    : "fill-transparent") +
                " " +
                (carry ? "cursor-grabbing" : canCarry ? "cursor-grab" : cursor)
              }
              {...hoverProps(part.id)}
              {...(canCarry ? { onPointerDown: (ev: React.PointerEvent<SVGPathElement>) => beginCarry(ev, part.id) } : {})}
            >
              {canCarry && <title>Drag along the airframe to reorder</title>}
            </path>
          );
        })}

        {/* Where the carried part would land. A rule at the joint rather than a ghost of the part: the
            drop is a position in the stack, and the stack has no gaps to open — everything behind the
            drop closes up by the same amount. Drawn after the overlays so it reads over the airframe,
            and before the CG/CP marks so it never covers them. */}
        {carry && (
          <g className="pointer-events-none">
            <line
              x1={carry.px}
              x2={carry.px}
              y1={markTop - 6}
              y2={markBot + 6}
              className="stroke-indigo-500 dark:stroke-indigo-400"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <text
              x={carry.px}
              y={Math.max(9, markTop - 10)}
              textAnchor="middle"
              className="fill-indigo-600 text-[11px] font-semibold [paint-order:stroke] [stroke:white] [stroke-width:3px] dark:fill-indigo-300 dark:[stroke:#18181b]"
            >
              drop here
            </text>
          </g>
        )}

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

        {/* centre of pressure (aft of CG when stable) — draw first, so CG sits on top if they meet.
            `pointer-events-none` on both marks, like the carry indicator: they are annotations, not
            controls, and they sit in the middle of a part's tap column. Without it the guide lines,
            the r=4 dots and the CG/CP text labels punch dead holes straight through the target this
            increment exists to create — a tap on "CG" would do nothing at all, because the mark is
            not a descendant of the rect and so nothing falls through to it. */}
        {showCp && (
          <g className="pointer-events-none">
            <line x1={X(cp!)} x2={X(cp!)} y1={markTop} y2={markBot} className="stroke-amber-500" strokeWidth={1.3} strokeDasharray="3 3" />
            <circle cx={X(cp!)} cy={centerY} r={4} className="fill-amber-500" />
            <text x={X(cp!)} y={markBot + 11} textAnchor="middle" className="fill-amber-600 text-[11px] font-semibold dark:fill-amber-400">CP</text>
          </g>
        )}
        {/* centre of gravity (loaded) — annotation, not a control; see the CP note above. */}
        {showCg && (
          <g className="pointer-events-none">
            <line x1={X(cg!)} x2={X(cg!)} y1={markTop} y2={markBot} className="stroke-indigo-500" strokeWidth={1.3} strokeDasharray="3 3" />
            <circle cx={X(cg!)} cy={centerY} r={4} className="fill-indigo-500" />
            <text x={X(cg!)} y={markTop - 3} textAnchor="middle" className="fill-indigo-600 text-[11px] font-semibold dark:fill-indigo-400">CG</text>
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
              vertical={vertical}
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
              vertical={vertical}
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
              vertical={vertical}
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
              vertical={vertical}
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
              vertical={vertical}
                units={units}
                field="finSpan"
                axis="radius"
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
              vertical={vertical}
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
              vertical={vertical}
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

        {/* mass-object handle — slide the picked point mass along the airframe. Fine-pointer only, for
            the same reason the tube-length grip is: it rides the centreline where the fin handles and
            the CG/CP marks already live, and on a coarse pointer a 44 px target there swallows theirs.
            On a phone the station stays the number field, which is a real control at a real size. */}
        {onEdit && !coarse && massStationNow !== undefined && massHi > massLo && (
          <FinHandle
              vertical={vertical}
            units={units}
            field="massObjectStation"
            label="Mass position"
            valueText={`${d.q(d.lengthMm(massStationNow, units))} from the nose`}
            title="Drag or use arrow keys to slide this mass along the airframe"
            current={massStationNow}
            lo={massLo}
            hi={massHi}
            cx={massCx}
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
              vertical={vertical}
            units={units}
            field="bodyDiameter"
            axis="radius"
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
      </g>
      </svg>
      </div>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        {variant !== "strip" && <ZoomControl zoom={zoom} onZoom={setZoom} />}
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
            <Swatch className="bg-zinc-500 dark:bg-zinc-400" /> {motorLabel}
          </span>
        )}
        {showCg && (
          <span className="inline-flex items-center gap-1">
            <Swatch shape="dot" className="bg-indigo-500" /> CG
          </span>
        )}
        {showCp && (
          <span className="inline-flex items-center gap-1">
            <Swatch shape="dot" className="bg-amber-500" /> CP
          </span>
        )}
        {o.masses.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Swatch shape="dot" className="border border-fuchsia-500" /> mass
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
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label="Diagram zoom">
      {/* `text-[11px]` because this group is drawn inside the diagram's own figcaption and reads at
          its size — §3 allows that token for diagram annotation, and it is what these two carried
          before they took the primitive. `size="sm"` alone puts the glyphs a pixel above the readout
          they flank, which is the mismatch the conversion introduced. */}
      <Button
        size="sm"
        square
        className="text-[11px]"
        onClick={() => onZoom(STEPS[at - 1])}
        disabled={at === 0}
        aria-label="Zoom out"
      >
        −
      </Button>
      <span className="min-w-10 text-center tabular-nums" aria-live="polite">
        {zoom === 1 ? "Fit" : `${zoom}×`}
      </span>
      <Button
        size="sm"
        square
        className="text-[11px]"
        onClick={() => onZoom(STEPS[at + 1])}
        disabled={at === STEPS.length - 1}
        aria-label="Zoom in"
      >
        +
      </Button>
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
  // `Segmented`, not a hand-rolled row of toggles. `DESIGN.md` §5 names this exact control — "2–5
  // mutually exclusive options, all visible" — and this is one: at most five fin dimensions, one
  // active. It was the last hand-rolled control outside the primitives, and it had drifted to its own
  // active treatment (an indigo tint and border) where every other exclusive switch in the app uses
  // the primitive's raised-white one. A flyer meets both on the same screen.
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-zinc-500 dark:text-zinc-400">Drag:</span>
      <Segmented
        value={value}
        onChange={(v) => onChange(v as FinField)}
        options={offered.map((f) => ({ value: f, label: FIN_FIELD_LABEL[f] }))}
        ariaLabel="Fin handle"
        size="sm"
      />
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
  axis = "station",
  axisScale = 1,
  vertical = false,
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
    | "noseLength"
    | "massObjectStation";
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
  /** **The MODEL axis this grip moves along, never the screen's** — `DESIGN.md` §8. `"station"` is a
   *  distance along the airframe (fin position, root chord, nose length); `"radius"` is a distance
   *  out from the centreline (fin span, body caliber). Which way either of those runs on screen is a
   *  rendering decision made later, by `vertical`, and everything the screen needs is derived from
   *  the pair: the value mapping, the resize cursor, `aria-orientation`, the arrow-key direction and
   *  the arrow glyph.
   *
   *  **It used to be the SCREEN axis, spelled `"x"`/`"y"`, and that is the trap the rule names.** The
   *  call sites read identically either way, so a rotated drawing would have inverted every grip in
   *  silence — a drag toward the nose lengthening the fin root, and a screen reader announcing the
   *  opposite of the gesture — with the roles and accessible names unchanged and nothing red. */
  axis?: "station" | "radius";
  /** Multiplies the mapped axis value before it becomes the field value — 1 for a station or a
   *  radius-valued field (span), 2 for a diameter-valued one (the body caliber is twice the radius
   *  the pointer's y maps to). Defaults to 1. */
  axisScale?: number;
  /** Viewbox y of the centreline — needed to turn a pointer y into a radius (the "y" axis only). */
  centerY?: number;
  /** Whether the drawing is rotated so the airframe runs DOWN the screen (a portrait phone). The
   *  drawing's own coordinates are unchanged — the rotation is one transform on the group that holds
   *  everything — so the pointer mapping below is untouched by it. What this decides is only what a
   *  flyer sees and presses: which way the resize cursor points, which arrow key increases the value,
   *  and which way the glyph is drawn. */
  vertical?: boolean;
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
    /** The handle's own `<g>`. Its screen CTM carries the drawing's rotation; the `<svg>`'s does not. */
    frame: SVGGraphicsElement;
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
  useHeldScroll(dragging);
  const [focused, setFocused] = useState(false);

  /** **The screen axis, DERIVED — never stated at a call site.** A station runs across a horizontal
   *  drawing and down a rotated one; a radius does the opposite. Everything the screen needs comes
   *  from here, so the four presentations below (cursor, `aria-orientation`, arrow keys, glyph)
   *  cannot disagree with each other or with the drawing. */
  const screenAxis: "x" | "y" = (axis === "radius") !== vertical ? "y" : "x";
  /** Which arrow key moves the value UP, on the screen the flyer is looking at. A station grows aft:
   *  rightward on a horizontal drawing, downward on a nose-up vertical one. A radius grows outward:
   *  upward from the centreline horizontally, rightward when the airframe is rotated. */
  const plusKey = screenAxis === "y" ? (vertical && axis === "station" ? "ArrowDown" : "ArrowUp") : "ArrowRight";
  const minusKey = plusKey === "ArrowDown" ? "ArrowUp" : plusKey === "ArrowUp" ? "ArrowDown" : "ArrowLeft";

  // Map the pending pointer position (through the SVG's live transform) to this axis's value and
  // apply it, on the next frame — the window handlers fire far faster than paint.
  const apply = useCallback(() => {
    rafRef.current = null;
    const dg = dragRef.current;
    // **The CTM comes from the HANDLE, not from the `<svg>`, and that is what makes a rotated
    // drawing free.** An element's screen CTM carries every transform above it, so a pointer mapped
    // through it lands in the coordinate space the handle is drawn in — which is the drawing's own,
    // rotation included. The mapping below therefore never needs to know the drawing is rotated, and
    // a rotation cannot silently invert a grip: there is nothing to keep in step.
    const ctm = dg?.frame.getScreenCTM();
    if (!dg || !ctm) return;
    const pt = dg.svg.createSVGPoint();
    pt.x = pendingXRef.current;
    pt.y = pendingYRef.current;
    const local = pt.matrixTransform(ctm.inverse());
    const mapped = (axis === "radius" ? (dg.centerY - local.y) / dg.s : (local.x - dg.padX) / dg.s) * dg.axisScale;
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

  /** Cancel the browser's scroll for the whole of a handle drag — from the FIRST move, with no slop.
   *
   *  **An axis lock was the obvious refinement and it does not work.** Two of the three grips are
   *  horizontal (fin position, nose length), so a vertical flick on one is unambiguously a scroll,
   *  and a version of this waited 8 px before deciding which way the gesture was going. Measured, it
   *  fixed nothing on the case that matters: a vertical flick on the body-diameter grip still took
   *  ⌀38 mm to 139 mm AND scrolled the page 500 to 747 px. Chromium commits to the scroll inside
   *  that slop window, and once committed the `touchmove` is no longer `cancelable` — there is no
   *  point later at which the decision can still be made. The choice has to be taken on the first
   *  move or not at all.
   *
   *  So the gesture belongs to the handle, which is what a native range input does too. The cost is
   *  stated rather than hidden: a flick that starts exactly on one of the three 44 px grips will not
   *  scroll the page. That is a small target on a 324 px-wide diagram, and the alternative is the
   *  Sev-1 this replaces — a flick doing BOTH, silently editing the design while scrolling it out of
   *  view. `cancelable` is still checked, because a `touchmove` the browser has already committed to
   *  cannot be cancelled and calling `preventDefault` on one only logs an error. */
  const preventScroll = useCallback((ev: TouchEvent) => {
    if (ev.cancelable) ev.preventDefault();
  }, []);

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
      className={`group touch-none outline-none ${screenAxis === "y" ? "cursor-ns-resize" : "cursor-ew-resize"}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation={screenAxis === "y" ? "vertical" : "horizontal"}
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
        // **Which arrow increases depends on where the value's own axis POINTS on screen**, and this
        // was hard-coded to left-down-decreases until the drawing could rotate. On a vertical
        // airframe drawn nose-up, a larger station is further DOWN the page, so `ArrowDown` has to
        // increase it — the opposite of the horizontal case, and of the ARIA convention for a
        // vertical slider, which assumes the value grows upward. The gesture on screen wins: a key
        // that moves the grip one way while the number moves the other is the same wrong control the
        // model-axis rule exists to prevent, just reached with a keyboard instead of a finger.
        if (ev.key === plusKey || ev.key === (screenAxis === "y" ? "ArrowRight" : "ArrowUp")) next = current + step;
        else if (ev.key === minusKey || ev.key === (screenAxis === "y" ? "ArrowLeft" : "ArrowDown")) next = current - step;
        else if (ev.key === "Home") next = lo;
        else if (ev.key === "End") next = hi;
        else return;
        ev.preventDefault();
        onEdit({ [field]: Math.min(hi, Math.max(lo, next)) });
      }}
      onPointerDown={(ev) => {
        const svg = ev.currentTarget.ownerSVGElement; // for `createSVGPoint` only — see the CTM below
        const frame = ev.currentTarget;
        const ctm = frame.getScreenCTM();
        if (!svg || !ctm) return;
        ev.preventDefault();
        ev.stopPropagation();
        ev.currentTarget.focus();
        const pt = svg.createSVGPoint();
        pt.x = ev.clientX;
        pt.y = ev.clientY;
        const local = pt.matrixTransform(ctm.inverse());
        const mapped = (axis === "radius" ? (centerY - local.y) / s : (local.x - padX) / s) * axisScale;
        const controller = new AbortController();
        dragRef.current = { grabOffset: mapped - current, s, padX, centerY, axisScale, lo, hi, svg, frame, controller };
        // **The gesture belongs to the handle, and this is the only thing that makes that true on a
        // phone.** The `<g>` carries `touch-none`, but `touch-action` is not honoured on an inner SVG
        // element in Chromium — so a one-thumb flick that happened to start on a handle did BOTH: it
        // scrolled the page AND dragged. Measured at 390x844 with real touch events, flicking up
        // 220 px from the body-diameter grip: ⌀38 mm to 205 mm and the page scrolled 500 to 731 px,
        // so the airframe was off screen before the numbers settled. Apogee went 993 m to 133 m and
        // static margin 4.07 to 1.12 cal, and nothing on screen said a design edit had happened.
        // `ev.preventDefault()` on the pointerdown does not do it either — only a NON-PASSIVE
        // `touchmove` can cancel a scroll once it has been offered, and it has to be registered
        // before the first move, which is here. Aborted with everything else when the drag ends, so
        // the diagram scrolls normally the rest of the time.
        window.addEventListener("touchmove", preventScroll, { passive: false, signal: controller.signal });
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
          screenAxis === "y"
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
          className="pointer-events-none fill-zinc-800 text-[11px] font-semibold tabular-nums [paint-order:stroke] [stroke:white] [stroke-width:3px] dark:fill-zinc-100 dark:[stroke:#18181b]"
        >
          {d.q(d.lengthMm(current, units))}
        </text>
      )}
      <title>{title}</title>
    </g>
  );
}
