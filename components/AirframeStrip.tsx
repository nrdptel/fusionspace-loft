"use client";

import type { Rocket } from "@/lib/model/types";
import type { UnitSystem } from "@/lib/display";
import type { MotorMark } from "@/lib/sim/setup";
import RocketDiagram from "./RocketDiagram";
import { Card } from "./ui";

/** The design, kept on screen while you work on something else — `COMPETITION.md` row 31.
 *
 *  **This is the one thing the route split cost that the scrolling page it replaced did not.** Every
 *  desktop tool keeps a view of the rocket beside whatever tab is open: OpenRocket's Rocket Views
 *  Pane is its own window section BELOW the task tabs, so the airframe is on screen while you pick a
 *  motor and while you run a simulation, and RASAero draws the rocket on the input screen itself. In
 *  Loft the drawing was reachable through `GeometryInspector` only, which renders inside
 *  `panel-design` alone — so a flyer sweeping a fin on `/sweep`, or reading a dispersion, lost sight
 *  of the airframe both are about. What survived the move was the summary strip and the warnings:
 *  numbers, not the picture.
 *
 *  Three things about where it sits and what it is:
 *
 *  **Above the spine, and OUTSIDE every `hidden` region.** `RocketDiagram` sizes itself with
 *  `useMeasuredWidth`, which reads 0 inside a `hidden` subtree — mounted in one, the strip would
 *  measure nothing and draw nothing, silently. Its host in `ResultsView` is deliberately above the
 *  `role="region"` blocks rather than repeated inside each of them.
 *
 *  **Not rendered on `/design`.** The full drawing is already the top of that workspace, and a second
 *  copy would be both redundant and ambiguous — the same accessible names would appear twice, which
 *  is what makes a selector match two nodes.
 *
 *  **A reminder, not a second editor.** No `onEdit`, no `onMoveTo`, no hover or select callbacks: the
 *  editing affordances belong to the surface that owns them, and a drag handle on a strip that
 *  cannot show you the field it changed is a worse version of the thing one route away. What it does
 *  carry is the CG and CP marks and the static margin, because those are the numbers that move when
 *  you change something in another workspace, and watching them move is the reason to keep the
 *  picture in view at all.
 *
 *  **That last part makes this a margin-publishing surface, and it is gated like every other one.**
 *  `ResultsView` passes `cg` and `marginCal` only under `run.motorsComplete` — the predicate meaning
 *  EVERY motor resolved, never `hasPropulsion`, which was the shape of two shipped defects. An
 *  unmatched motor therefore retires the CG mark, its caption and the drawing's own `aria-label`
 *  together, rather than drawing a balance point that assumes a motor is aboard. Registered in
 *  `lib/margin-surfaces.test.ts`, which fails on any surface that publishes the figure without
 *  saying how it is gated. */
export default function AirframeStrip({
  rocket,
  units,
  cg,
  cp,
  marginCal,
  motors,
}: {
  rocket: Rocket;
  units: UnitSystem;
  /** Loaded centre of gravity (m from the nose tip). */
  cg?: number;
  /** Centre of pressure (m from the nose tip). */
  cp?: number;
  /** Static margin in calibers, for the caption the diagram draws. */
  marginCal?: number;
  /** The motor(s) loaded, drawn inside the aft body — so the strip shows what is being flown, not
   *  just what was built. */
  motors?: MotorMark[];
}) {
  return (
    <Card
      as="section"
      tone="sunken"
      aria-label="Airframe"
      // **Desktop and tablet only, and that is a finding rather than a shortcut.** Driven at
      // 390x664, the strip pushed the sweep's first answer to 2.13 screens — past `DESIGN.md`'s
      // two-screen rule, which `e2e/depth.spec.ts` enforces — because on a phone vertical space is
      // the scarce resource and persistent chrome spends it on every route at once. Every tool
      // `COMPETITION.md` row 31 cites keeps its rocket view in a DESKTOP window: OpenRocket's Rocket
      // Views Pane is a section of a four-section window, RASAero draws on its main screen. On a
      // phone the drawing stays one tap away on `/design`, which is the trade the two-screen rule
      // exists to make.
      //
      // CSS rather than a media-query hook: reading the viewport during render is the hydration
      // mismatch `RocketDiagram` avoids for exactly this reason. Below `sm` the container is
      // `display:none`, so `useMeasuredWidth` reads 0 and the drawing costs nothing.
      //
      // `py-2` rather than the card default: this is a band, and the drawing brings its own padding.
      className="hidden px-3 py-2 sm:block"
    >
      <RocketDiagram rocket={rocket} units={units} cg={cg} cp={cp} marginCal={marginCal} motors={motors} variant="strip" />
    </Card>
  );
}
