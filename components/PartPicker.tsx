"use client";

import { useEffect, useId, useMemo, useState } from "react";

import DataTable, { type Column } from "./DataTable";
import { Button, Card } from "./ui";
import { TOUCH_TARGET, cx } from "@/lib/ui-tokens";
import { mToIn } from "@/lib/units";
import { fmtEditable } from "@/lib/display";
import type { CatalogPart, CatalogSource } from "@/lib/components/db";
import type { Material } from "@/lib/model/types";

/** Choose a real commercial part instead of measuring one.
 *
 *  R8's whole point: authoring becomes SELECTION rather than measurement. A flyer who owns an Estes
 *  BT-60 should say so, not read four numbers off a ruler and type them — and the numbers they would
 *  have typed are worse than the vendor's own, because a tube's wall is two thousandths of an inch
 *  and nobody measures that with a rule.
 *
 *  **The catalogue is loaded on demand, and that is not an optimisation.** `lib/components/catalog.ts`
 *  is 1.17 MB of source and 85 KB gzipped against a whole-app JS budget of 335 KB gzipped — importing
 *  it at the top of the design workspace would grow every first load by a quarter to carry a table
 *  most sessions never open. It is fetched when the picker is first opened, which is also why this
 *  component has a real `loading` state rather than a spinner nobody sees. The service worker
 *  precaches everything under `_next/static` (see `scripts/gen-sw-precache.mjs`), so the chunk is
 *  present offline from the second visit exactly like the rest of the app — a pad with no signal
 *  loses nothing by this being a separate file.
 *
 *  **What a pick hands over is VALUES, never a pointer into the catalogue.** `lib/session.ts` persists
 *  the edit bag to `localStorage` and replays it, so an entry that stored `"Estes/BT-60"` and resolved
 *  it at apply time would silently change a flyer's design the day the catalogue is re-cut against a
 *  newer upstream commit. The numbers travel with the choice — the same rule `AddedPart` already
 *  follows, and the reason that type carries a length rather than a reference to one. */

/** Metres → the display unit, through the SAME formatter as the field this picker writes into.
 *
 *  Not `toFixed`, and the difference is a defect rather than a nicety. The design panel renders every
 *  span with `fmtEditable` (`components/LoftApp.tsx`), which adds a decimal only where the nominal
 *  precision would misstate what is being flown. A fixed 1 dp here disagreed with that on **642 of
 *  1,089** tubes for length and **443** for diameter: a Rocketarium tube read 457.2 mm in the table
 *  and 457 in the box directly above it, seconds after being picked, rounding opposite ways. A value
 *  shown differently on two surfaces is a named tell, and these two surfaces are inches apart. */
function span(m: number | undefined, imperial: boolean): string {
  if (m === undefined || !Number.isFinite(m)) return "—";
  return fmtEditable(imperial ? mToIn(m) : m * 1000, 1);
}

/** The vendor's own material string, shortened for a table cell but never rewritten.
 *
 *  The upstream names are descriptive rather than nominal — "Paper, spiral kraft glassine, Estes avg,
 *  bulk" — and the trailing type word is noise once the column is known to be a material. Everything
 *  before it is the vendor's claim about what the part IS, and that is not ours to paraphrase: the
 *  same milestone deleted a name Loft had guessed ("vulcanised fibre" on Blue Tube) precisely because
 *  a composition nobody published is a claim the tool cannot make. */
function materialLabel(part: CatalogPart): string {
  const name = part.material?.name;
  if (!name) return "not stated";
  return name.replace(/,\s*bulk$/i, "");
}

/** The kinds of part this picker can offer. One component rather than one per kind, deliberately:
 *  the catalogue fetch, the failed-fetch state, the search, the vendor filter, the caliber filter,
 *  the provenance line and the table are the same surface for every kind, and the repo has spent
 *  three milestones collapsing five partial implementations of a table into one. What differs is
 *  four strings and which columns a kind actually states — which is what `KIND` below holds. */
export type PickerKind = "bodytube" | "nosecone" | "parachute";

/** Everything about a kind that is not shared, in one table, so adding the next kind is an entry
 *  rather than an edit spread through the body. */
const KIND: Record<
  PickerKind,
  {
    /** Singular, lower case, as it appears mid-sentence. */
    noun: string;
    /** Plural, for the count line. */
    plural: string;
    /** The button that opens the list. */
    open: string;
    /** The path back to the design's own part. */
    back: string;
    /** What the caliber filter is filtering, and the search box's own example. */
    fitsNoun: string;
    placeholder: string;
  }
> = {
  bodytube: {
    noun: "body tube",
    plural: "body tubes",
    open: "Pick a real body tube",
    back: "Back to the design's own tube",
    fitsNoun: "tubes",
    placeholder: "BT-60, 38 mm, phenolic…",
  },
  nosecone: {
    noun: "nose cone",
    plural: "nose cones",
    open: "Pick a real nose cone",
    back: "Back to the design's own nose",
    fitsNoun: "cones",
    placeholder: "BT-60, ogive, balsa…",
  },
  parachute: {
    noun: "parachute",
    plural: "parachutes",
    open: "Pick a real parachute",
    back: "Back to the design's own canopy",
    fitsNoun: "canopies",
    // Every term here is checked against the shipped catalogue, because the placeholder is the field
    // TEACHING a flyer what the box accepts: "18 in" → 16 rows, "nylon" → 80, "PAR-" → 36. A vendor
    // NAME is deliberately absent — the filter reads `partNumber` and `description` only, and the
    // maker is the select beside it, so the "Top Flight…" this first said returned 0 and sent the
    // flyer straight into the empty state one keystroke later. ("PAR" without the hyphen matches all
    // 151, because every description begins "Parachute".)
    placeholder: "18 in, nylon, PAR-…",
  },
};

/** Whether a catalogue row carries enough for the model to apply it — the picker's half of the same
 *  question `usableCatalogTube` and `usableCatalogNose` answer in `lib/model/edit.ts`.
 *
 *  It is asked here so a row that cannot be built is DISABLED rather than silently doing nothing on
 *  a tap, which on a 390 px viewport is indistinguishable from a missed target. The two must agree:
 *  a row this lets through and the model then refuses is a pick that appears to work and changes no
 *  number, which is the "controls that forget" tell. Kept deliberately as a mirror rather than an
 *  import — the model's predicates take the finished record, and this takes the catalogue row it
 *  would be built from, so they are the same rule at two different points on the wire. */
function buildable(p: CatalogPart, kind: PickerKind): boolean {
  // **The outer-diameter/length prelude belongs to the two AIRFRAME kinds, not to every kind**, and
  // that had to be discovered rather than assumed: 0 of the 151 catalogued parachutes state either
  // field — a canopy publishes a flat diameter, its sides, and its shroud lines — so leaving the
  // check shared would have rendered all 151 rows disabled, which on a phone is indistinguishable
  // from a missed tap.
  if (kind === "parachute") {
    return (
      p.diameter !== undefined &&
      // The SAME absolute band `usableCatalogParachute` enforces, not merely `> 0`. This function's
      // own header states the invariant: a row this lets through and the model then refuses is a
      // pick that appears to work and changes no number. The two airframe kinds have no absolute
      // bands to mirror, so a canopy is the first place the mirror could be incomplete — and every
      // shipped row is comfortably inside (203.2 mm to 3,657.6 mm), so this is defence against an
      // upstream re-cut rather than a filter on today's data.
      p.diameter > 0.05 &&
      p.diameter < 10 &&
      // The mass has to be obtainable, because the applier writes one unconditionally. Either the
      // vendor states it (21 of 151) or it is derived from the canopy's own stock — and 145 of the
      // 151 state a line material too, which is the second term. The six with neither a line
      // material nor a stated mass are Giant Leap's TAC series, and all six state a mass.
      (p.mass !== undefined
        ? p.mass > 0 && p.mass < 50
        : p.material !== undefined && p.material.density !== null && p.material.density > 0)
    );
  }
  if (p.outerDiameter === undefined || !(p.outerDiameter > 0)) return false;
  if (p.length === undefined || !(p.length > 0)) return false;
  if (kind === "bodytube") {
    return p.innerDiameter !== undefined && p.innerDiameter > 0 && p.innerDiameter < p.outerDiameter;
  }
  return (
    p.shape !== undefined &&
    p.shoulderDiameter !== undefined &&
    p.shoulderDiameter > 0 &&
    p.shoulderDiameter <= p.outerDiameter &&
    p.shoulderLength !== undefined &&
    p.shoulderLength >= 0 &&
    (p.thickness === undefined || (p.thickness > 0 && p.thickness < p.outerDiameter / 2))
  );
}

export default function PartPicker({
  kind,
  /** Metres. The caliber the design is at now, so the list can open on parts that actually fit it. */
  currentOuterDiameter,
  imperial,
  onPick,
  picked,
  dimensionsMatch,
  onClear,
}: {
  kind: PickerKind;
  currentOuterDiameter?: number;
  imperial: boolean;
  /** The catalogue row and its resolved stock, NOT a finished edit-bag record.
   *
   *  The picker's job is choosing a published part; turning that choice into a `PickedBodyTube` or a
   *  `PickedNoseCone` is the model's, and it is done at the call site where the rest of the patch is
   *  assembled. That is what lets one component serve two kinds without a union type running through
   *  it — and it keeps `materialOf`'s refusal (a density the catalogue would not stand behind) as a
   *  single decision made here and passed on, rather than re-derived per kind. */
  onPick: (part: CatalogPart, material: Material | undefined) => void;
  /** What the flyer chose, so the surface can say so rather than leaving changed numbers to speak
   *  for themselves. `DESIGN.md` §6: every reference value names its source. Only the identity is
   *  needed — the caption names the part, and the record itself lives in the edit bag. */
  picked?: { manufacturer: string; partNumber: string };
  /** Whether the dimensions being flown are still the ones this part published — see the note at the
   *  attribution line. Governs the wording, never whether the clear path exists. */
  dimensionsMatch: boolean;
  onClear: () => void;
}) {
  const copy = KIND[kind];
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<CatalogPart[] | null>(null);
  /** The lazily-imported module itself, so `materialOf` — which is where the refused densities are
   *  known — is called rather than re-implemented. */
  const [db, setDb] = useState<typeof import("@/lib/components/db") | null>(null);
  const [sources, setSources] = useState<readonly CatalogSource[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  const [maker, setMaker] = useState("");
  const [fitsOnly, setFitsOnly] = useState(false);
  const searchId = useId();
  const makerId = useId();

  useEffect(() => {
    // Closing clears a failed fetch, so re-opening genuinely retries — which is what the error copy
    // below tells the flyer to do. Without this the guard below latched `failed` forever and only a
    // full page reload cleared it: a dead end whose own text promised the way out, on exactly the
    // flaky-connection path this component is built for.
    if (!open) {
      if (failed) setFailed(false);
      return;
    }
    if (parts) return;
    let live = true;
    // The one dynamic import in the app, for the reason in the header note. `.then` rather than an
    // async IIFE so the cleanup flag is the only thing guarding a resolve after unmount.
    import("@/lib/components/db")
      .then((db) => {
        if (!live) return;
        const tubes = db.partsOfKind(kind);
        setDb(db);
        setParts(tubes);
        // The files that actually CONTRIBUTE a part OF THIS KIND, not all 16 vendored `.orc`.
        // Quoting the full count would attach a provenance figure to a list it does not describe —
        // in the one sentence whose whole job is to say where these numbers came from. It differs
        // by kind: 12 of the 16 files carry a body tube, 11 carry a nose cone.
        const used = new Set(tubes.map((t) => t.source));
        setSources(db.allSources().filter((_, i) => used.has(i)));
      })
      .catch(() => {
        // A failed chunk fetch is a real state on a flaky connection, and it is not the same as an
        // empty catalogue: one says "try again", the other says "nothing matches". `DESIGN.md` §5
        // wants both, and an error that names neither the thing that failed nor the way forward is
        // itself a named tell.
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [open, parts, failed, kind]);

  const makers = useMemo(() => {
    if (!parts) return [];
    return [...new Set(parts.map((p) => p.manufacturer))].sort((a, b) => a.localeCompare(b));
  }, [parts]);

  const rows = useMemo(() => {
    if (!parts) return [];
    const q = text.trim().toLowerCase();
    // 0.5 mm — about the slip fit a real coupler has, and the same tolerance `searchParts` uses for
    // its own fit clauses, so the two cannot answer differently for the same question.
    const tol = 0.0005;
    return parts.filter((p) => {
      if (maker && p.manufacturer !== maker) return false;
      if (q && !p.partNumber.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q))
        return false;
      if (fitsOnly) {
        if (currentOuterDiameter === undefined || p.outerDiameter === undefined) return false;
        if (Math.abs(p.outerDiameter - currentOuterDiameter) > tol) return false;
      }
      return true;
    });
  }, [parts, text, maker, fitsOnly, currentOuterDiameter]);

  const unit = imperial ? "in" : "mm";

  // Memoised on what it actually depends on. A fresh array each render invalidates `DataTable`'s own
  // `sorted` and `csvRows` memos every time, so each keystroke in Search re-sorted 1,089 rows and
  // rebuilt a 1,089-row CSV — on the phone-at-the-pad case this component exists to serve.
  const columns: Column<CatalogPart>[] = useMemo(() => [
    {
      key: "part",
      label: "Part",
      rowHeader: true,
      sortValue: (p) => p.partNumber.toLowerCase(),
      cell: (p) => <span className="font-medium text-zinc-900 dark:text-zinc-100">{p.partNumber}</span>,
      csv: (p) => p.partNumber,
    },
    {
      key: "maker",
      label: "Vendor",
      sortValue: (p) => p.manufacturer.toLowerCase(),
      cell: (p) => p.manufacturer,
      csv: (p) => p.manufacturer,
    },
    {
      key: "od",
      // A tube's outer diameter is the whole part; a cone's is only its BASE, and the shoulder
      // below it is a second diameter on the same row. Naming both "OD" would put two different
      // measurements under one header on a surface whose entire job is published dimensions. A
      // canopy states none of those — its size is the flat diameter, which is the field the whole
      // choice turns on, so it takes this column rather than being a dash in it.
      label:
        kind === "parachute"
          ? `Canopy Ø (${unit})`
          : kind === "nosecone"
            ? `Base (${unit})`
            : `OD (${unit})`,
      align: "right",
      sortValue: (p) => (kind === "parachute" ? (p.diameter ?? Infinity) : (p.outerDiameter ?? Infinity)),
      cell: (p) => (
        <span className="font-mono tabular-nums">
          {span(kind === "parachute" ? p.diameter : p.outerDiameter, imperial)}
        </span>
      ),
      csv: (p) => span(kind === "parachute" ? p.diameter : p.outerDiameter, imperial),
    },
    // The bore, for the kind that states one. Every body tube publishes it and it is where the wall
    // comes from; only 37 of the 854 nose cones do, so the column would be a dash on 96% of the
    // rows it headed — and for a cone the wall is told by `filled` and `thickness` instead, which
    // is what the two columns after this one say.
    // A canopy's own two: how many gores it is cut from, and its shroud lines. Both are published on
    // 151 of 151, both are what a flyer compares two same-diameter canopies on, and neither exists
    // on either airframe kind.
    ...(kind === "parachute"
      ? [
          {
            key: "sides",
            label: "Gores",
            align: "right" as const,
            sortValue: (p: CatalogPart) => p.sides ?? Infinity,
            cell: (p: CatalogPart) => <span className="font-mono tabular-nums">{p.sides ?? "—"}</span>,
            csv: (p: CatalogPart) => p.sides ?? "",
          },
          {
            key: "lines",
            label: `Lines (${unit})`,
            align: "right" as const,
            sortValue: (p: CatalogPart) => p.lineLength ?? Infinity,
            // Count x length, because the pair is what a flyer checks against their harness and
            // because it is the second term of the derived mass — the same formula the `.ork`
            // importer uses (canopy area x surface density, plus lines x length x line density).
            cell: (p: CatalogPart) => (
              <span className="font-mono tabular-nums">
                {p.lineCount ?? "—"} x {span(p.lineLength, imperial)}
              </span>
            ),
            csv: (p: CatalogPart) => `${p.lineCount ?? ""} x ${span(p.lineLength, imperial)}`,
          },
        ]
      : kind === "bodytube"
      ? [
          {
            key: "id",
            label: `ID (${unit})`,
            align: "right" as const,
            sortValue: (p: CatalogPart) => p.innerDiameter ?? Infinity,
            cell: (p: CatalogPart) => (
              <span className="font-mono tabular-nums">{span(p.innerDiameter, imperial)}</span>
            ),
            csv: (p: CatalogPart) => span(p.innerDiameter, imperial),
          },
        ]
      : [
          {
            key: "shape",
            label: "Shape",
            // The vendor's own contour, and the reason this column exists at all: it is the field a
            // flyer is actually choosing on. 464 of the 854 are ogive, 233 ellipsoid, 135 conical,
            // 12 parabolic, 10 Haack — so a list sorted any other way buries every low-drag cone.
            sortValue: (p: CatalogPart) => p.shape ?? "",
            cell: (p: CatalogPart) => <span>{p.shape ?? "—"}</span>,
            csv: (p: CatalogPart) => p.shape ?? "",
          },
          {
            key: "shoulder",
            label: `Shoulder (${unit})`,
            align: "right" as const,
            sortValue: (p: CatalogPart) => p.shoulderDiameter ?? Infinity,
            // Diameter x length, because both matter and neither is guessable: the diameter says
            // which tube it plugs into, the length says how much mass sits at the very front of the
            // rocket. 50 of the 854 publish a length of 0 — a cone that BUTTS rather than plugs —
            // and that is said in words rather than shown as a zero a reader would take for missing.
            cell: (p: CatalogPart) =>
              p.shoulderLength === 0 ? (
                <span>no shoulder</span>
              ) : (
                <span className="font-mono tabular-nums">
                  {span(p.shoulderDiameter, imperial)} x {span(p.shoulderLength, imperial)}
                </span>
              ),
            csv: (p: CatalogPart) =>
              p.shoulderLength === 0
                ? "none"
                : `${span(p.shoulderDiameter, imperial)} x ${span(p.shoulderLength, imperial)}`,
          },
          {
            key: "wall",
            label: "Wall",
            // Solid or hollow, which for a cone is the whole mass story and is EXHAUSTIVE over the
            // catalogue: 728 of the 854 state `filled`, the other 126 state a thickness, none states
            // both and none states neither. `lib/sim/mass.ts` flies a shell with a material and no
            // wall as a solid rod — a defect for a tube, and the right answer for a turned balsa
            // cone — so which of the two a part is has to be visible before it is chosen.
            sortValue: (p: CatalogPart) => (p.filled ? 0 : (p.thickness ?? Infinity)),
            cell: (p: CatalogPart) =>
              p.filled ? (
                <span>solid</span>
              ) : p.thickness !== undefined ? (
                <span className="font-mono tabular-nums">{span(p.thickness, imperial)}</span>
              ) : (
                <span>not stated</span>
              ),
            csv: (p: CatalogPart) =>
              p.filled ? "solid" : p.thickness !== undefined ? span(p.thickness, imperial) : "",
          },
        ]),
    // Length is an airframe measurement. 0 of the 151 canopies state one — a parachute has a flat
    // diameter and a packed size, and the catalogue publishes neither packed field — so the column
    // is dropped for that kind rather than headed over 151 dashes.
    ...(kind === "parachute"
      ? []
      : [
          {
            key: "len",
            label: `Length (${unit})`,
            align: "right" as const,
            sortValue: (p: CatalogPart) => p.length ?? Infinity,
            cell: (p: CatalogPart) => (
              <span className="font-mono tabular-nums">{span(p.length, imperial)}</span>
            ),
            csv: (p: CatalogPart) => span(p.length, imperial),
          },
        ]),
    {
      key: "mass",
      label: `Mass (${imperial ? "oz" : "g"})`,
      align: "right",
      sortValue: (p) => p.mass ?? Infinity,
      // Stated where the vendor states one, and blank rather than derived where they do not — a
      // computed figure printed in a column headed by published ones would be the two kinds of
      // number sharing a cell. `DESIGN.md` §6: every reference value names its source.
      cell: (p) => (
        <span className="font-mono tabular-nums">
          {p.mass === undefined
            ? "—"
            : (imperial ? p.mass * 35.274 : p.mass * 1000).toFixed(imperial ? 2 : 1)}
        </span>
      ),
      csv: (p) => (p.mass === undefined ? "" : imperial ? p.mass * 35.274 : p.mass * 1000),
    },
    {
      key: "material",
      label: "Material",
      sortValue: (p) => materialLabel(p).toLowerCase(),
      cell: (p) => {
        // 18 catalogued parts state a density that cannot describe matter (two files define
        // `Paper, bulk` as 0.0011 kg/m³), and `materialOf` refuses those rather than handing back a
        // plausible number. The picker has to SURFACE that rather than paper over it: the part's
        // dimensions are still good, so it is worth offering — with its mass left to the design's
        // own stock and the reason said, not with a default silently substituted.
        const usable = db ? db.materialOf(p) !== undefined : true;
        return (
          <span className="text-xs">
            {materialLabel(p)}
            {!usable && (
              <span className="block text-amber-700 dark:text-amber-400">
                no usable published density — this design&apos;s own stock is kept
              </span>
            )}
          </span>
        );
      },
      csv: (p) => materialLabel(p),
    },
    {
      key: "pick",
      // Named rather than empty. `DataTable` writes this into a `<th scope="col">`, and a column
      // header with no accessible name leaves 1,089 buttons all reading just "Use" with nothing to
      // place them (WCAG 1.3.1) — on a table whose row header is otherwise set up to give them
      // exactly that context.
      label: "Choose",
      cell: (p) => {
        // `materialOf` returns undefined for the parts whose upstream density was refused as
        // physically impossible. It is resolved here, once, and handed to the call site rather than
        // re-derived there — the flyer chose a specific part, and a density they did not choose is
        // a mass they will not check. The row says so beside the button.
        const material = db?.materialOf(p);
        return (
        <Button
          variant="secondary"
          onClick={() => {
            if (!buildable(p, kind)) return;
            onPick(p, material);
            setOpen(false);
          }}
          disabled={!buildable(p, kind)}
        >
          Use
        </Button>
        );
      },
    },
  ], [imperial, unit, onPick, db, kind]);

  const control =
    "mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Close the parts list" : copy.open}
        </Button>
        {picked && (
          // Named rather than implied. Numbers changing at once with nothing saying why is the
          // "controls that forget" tell wearing the opposite hat — the flyer needs to read back what
          // they chose, on the surface that changed.
          //
          // **The control appears whenever a part is picked; the CLAIM is narrower.** Since the pick
          // began carrying a wall and a stock it changes the flight even with both dimension fields
          // blanked, so a clear path that vanished when the numbers stopped matching would strand
          // the flyer with an edit and nothing to undo it — which is exactly the one-way door this
          // component already shipped once. `dimensionsMatch` governs only the wording.
          <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span>
              {/* The narrowed wording differs by kind because what SURVIVES a hand edit differs by
                  kind. Every figure a tube pick writes has a field the flyer can retype, so once
                  they do, the only thing still the vendor's is the wall and the stock. A cone pick
                  writes six figures and only two of them — length and contour — have fields at all:
                  the base, the shoulder, the wall and the stock have none, so "with your own
                  dimensions" would be false in the one direction that matters, because the vendor's
                  base is what raises the mould-line-step caution the flyer then reads on the
                  flight. */}
              {dimensionsMatch
                ? "Flying"
                : kind === "nosecone"
                  ? "Base, shoulder, wall and stock from"
                  : // A canopy has neither a wall nor a stock the solver ever sees — the tube wording
                    // fell through to it and named two properties the part does not have while
                    // omitting the one it does. What survives a typed diameter is the vendor's MASS,
                    // scaled with the area.
                    kind === "parachute"
                    ? "Weight scaled from"
                    : "Wall and stock from"}{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {picked.manufacturer} {picked.partNumber}
              </span>
              {!dimensionsMatch &&
                (kind === "nosecone"
                  ? ", with your own length or contour"
                  : kind === "parachute"
                    ? ", at your own diameter"
                    : ", with your own dimensions")}
            </span>
            <Button variant="ghost" onClick={onClear}>
              {copy.back}
            </Button>
          </p>
        )}
      </div>

      {open && (
        <Card className="mt-3">
          {failed ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              The parts catalogue could not be loaded. It is a separate download the first time it is
              opened; on a connection that dropped, closing and re-opening this list asks for it
              again.
            </p>
          ) : !parts ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading the parts catalogue…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block" htmlFor={searchId}>
                  <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Search
                  </span>
                  <input
                    id={searchId}
                    type="search"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={copy.placeholder}
                    className={cx(control, TOUCH_TARGET)}
                  />
                </label>
                <label className="block" htmlFor={makerId}>
                  <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Vendor
                  </span>
                  <select
                    id={makerId}
                    value={maker}
                    onChange={(e) => setMaker(e.target.value)}
                    className={cx(control, TOUCH_TARGET)}
                  >
                    <option value="">Every vendor</option>
                    {makers.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                {/* The caliber filter compares a part's OUTER DIAMETER to the airframe's, which is
                    a question about fit — and a canopy does not fit anything, it hangs below it. 0
                    of the 151 state an outer diameter at all, so the control would filter every row
                    away while reading as though it were narrowing sensibly. Suppressed rather than
                    re-pointed at the canopy diameter, which would be a filter for "a chute the width
                    of my rocket", a thing nobody wants. */}
                {currentOuterDiameter !== undefined && kind !== "parachute" && (
                  <label className={cx("flex items-end gap-2 text-sm", TOUCH_TARGET)}>
                    <input
                      type="checkbox"
                      checked={fitsOnly}
                      onChange={(e) => setFitsOnly(e.target.checked)}
                      className="mb-2 h-4 w-4"
                    />
                    <span className="mb-1.5 text-zinc-700 dark:text-zinc-300">
                      {/* Explicit space expressions, not trusted whitespace — the same transform
                          trap the provenance line below already carries a note about. This exact
                          label lost the space after `{copy.fitsNoun}` on the way through the
                          bundler ("Only tubesat this design's caliber"), green through lint, unit,
                          build and e2e, because the defect exists only after the transform. It was
                          `scripts/check-text-gaps.mjs` that found it, and it is the SECOND time that
                          check has earned itself on this one component. */}
                      Only {copy.fitsNoun}{" "}
                      at this design&apos;s caliber ({span(currentOuterDiameter, imperial)} {unit})
                    </span>
                  </label>
                )}
              </div>

              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                {/* Explicit space expressions, not trusted whitespace. A JSX text run that spans a
                    line break loses its LEADING space, so `{parts.length} catalogued` rendered as
                    "1089catalogued" and the vendor-file count butted straight against the em dash —
                    both green through lint, unit, build and e2e, because the defect exists only after
                    the transform. `scripts/check-text-gaps.mjs` is what catches it. */}
                {rows.length} of {parts.length} catalogued {copy.plural}
                . Dimensions are the vendor&apos;s own published figures, from
                the Apache-2.0 openrocket-database
                {sources && sources.length > 0 ? ` (${sources.length} vendor files)` : ""}{" "}
                — see THIRD-PARTY-NOTICES.md.{" "}
                {/* Said plainly rather than left to be inferred, and it differs by kind because what
                    a pick can honestly claim differs by kind. A tube pick rescales the airframe to
                    the caliber chosen, because a body tube IS the caliber; a cone pick deliberately
                    does not, because resizing a whole rocket to fit a part costing a few pounds is
                    the tail wagging the airframe — so a cone whose base disagrees with the tube
                    behind it makes a real mould-line step, and the flight already says so. */}
                {kind === "parachute" ? (
                  <>
                    Choosing one sets this design&apos;s canopy diameter, and its mass — the
                    vendor&apos;s published weight where they state one, otherwise the figure their own
                    cloth and shroud lines imply — unless this design states its weight as a whole,
                    in which case the size lands and the mass is left where the file already counts
                    it.{" "}
                    <span className="text-zinc-600 dark:text-zinc-300">
                      The drag coefficient stays your design&apos;s own, because no vendor here
                      publishes one and a landing speed is not a number to compute from a guess. The
                      deploy event, altitude and delay are untouched too — this changes the canopy,
                      not when it opens.
                    </span>
                  </>
                ) : kind === "bodytube" ? (
                  <>
                    Choosing one sets this design&apos;s body diameter and length; the airframe is
                    scaled to the caliber you pick so the mould line stays faired.{" "}
                    <span className="text-zinc-600 dark:text-zinc-300">
                      Choosing one also takes the vendor&apos;s wall and stock, so the mass moves with
                      it — and where they publish a weight of their own, that is the one flown rather
                      than a figure computed from the geometry.
                    </span>
                  </>
                ) : (
                  <>
                    Choosing one sets this design&apos;s nose length, contour, base diameter,
                    shoulder, wall and stock — the whole part as the vendor publishes it, and where
                    they publish a weight that is the one flown.{" "}
                    <span className="text-zinc-600 dark:text-zinc-300">
                      The airframe behind it is left alone. A cone whose base does not match the tube
                      it sits on leaves a step in the mould line, and the flight says so rather than
                      the design being quietly resized around the part.
                    </span>
                  </>
                )}
              </p>

              <div className="mt-3 max-h-96 overflow-y-auto">
                <DataTable
                  columns={columns}
                  rows={rows}
                  // Keyed on the part's own identity, never on its index in the sorted array: the
                  // rows re-sort on a header click and re-filter on every keystroke, and an
                  // index-bearing key re-keys all 1,089 of them each time, remounting the row under
                  // the flyer's focus. The dimensions are in the key because identity alone is not
                  // unique — three body-tube (manufacturer, part number) pairs are duplicated.
                  // A canopy's own dimensions go in for CONSISTENCY, not because they are needed:
                  // measured, there are zero duplicate (manufacturer, part number) pairs among the
                  // 151, so the airframe form of this key would have been unique anyway. An earlier
                  // version justified it by claiming the collapsed form would "re-key every row on a
                  // re-sort", which is not a thing a constant-per-row key can do.
                  rowKey={(p) =>
                    kind === "parachute"
                      ? `${p.manufacturer}/${p.partNumber}/${p.diameter ?? ""}/${p.lineCount ?? ""}`
                      : `${p.manufacturer}/${p.partNumber}/${p.outerDiameter ?? ""}/${p.length ?? ""}`
                  }
                  initialSort={{ key: "od", dir: 1 }}
                  // A nose row states three more figures than a tube row — contour, shoulder and
                  // wall — and squeezing them into the tube width collapses the shoulder pair onto
                  // two lines on every row. The table scrolls inside its own container either way.
                  // A canopy row carries the same compound-cell shape that made a CONE need more
                  // width, not less: `{lineCount} x {lineLength}` collapses onto two lines at a tube's
                  // width exactly as the cone's shoulder pair did. It renders the same eight columns
                  // a tube does and five numeric figures to the tube's four, and its material names
                  // run to 39 characters. An earlier version gave it 30rem on a miscount.
                  minWidth={kind === "nosecone" ? "46rem" : kind === "parachute" ? "38rem" : "34rem"}
                  empty={
                    // §5: an empty state says what would fill it AND the one action that does — so
                    // it must not name an action that is not on screen. The caliber filter is not
                    // rendered for a canopy (it compares an OUTER diameter, which no parachute
                    // states, and a chute does not fit anything — it hangs below it), so offering
                    // to turn it off would have been the one concrete suggestion and the false one.
                    <p>
                      No catalogued {copy.noun} matches that.{" "}
                      {kind === "parachute" || currentOuterDiameter === undefined
                        ? "Clear the search, or try a size in inches — the descriptions are the vendors' own."
                        : `Clear the search, or turn off the caliber filter to see ${copy.fitsNoun} of every diameter.`}
                    </p>
                  }
                />
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
