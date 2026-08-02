"use client";

import { useEffect, useId, useMemo, useState } from "react";

import DataTable, { type Column } from "./DataTable";
import { Button, Card } from "./ui";
import { TOUCH_TARGET, cx } from "@/lib/ui-tokens";
import { mToIn } from "@/lib/units";
import { fmtEditable } from "@/lib/display";
import type { CatalogPart, CatalogSource } from "@/lib/components/db";
import type { PickedBodyTube } from "@/lib/model/edit";

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

export default function PartPicker({
  /** Metres. The caliber the design is at now, so the list can open on tubes that actually fit it. */
  currentOuterDiameter,
  imperial,
  onPick,
  picked,
  onClear,
}: {
  currentOuterDiameter?: number;
  imperial: boolean;
  onPick: (part: PickedBodyTube) => void;
  /** What the flyer chose, so the surface can say so rather than leaving four changed numbers to
   *  speak for themselves. `DESIGN.md` §6: every reference value names its source. */
  picked?: PickedBodyTube;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<CatalogPart[] | null>(null);
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
        const tubes = db.partsOfKind("bodytube");
        setParts(tubes);
        // The files that actually CONTRIBUTE a body tube, not all 16 vendored `.orc`. Four of them
        // (apogee, competition_chutes, generic_materials, top_flight) carry none, so quoting the
        // full count attached a provenance figure to a list it does not describe — in the one
        // sentence whose whole job is to say where these numbers came from.
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
  }, [open, parts, failed]);

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
      label: `OD (${unit})`,
      align: "right",
      sortValue: (p) => p.outerDiameter ?? Infinity,
      cell: (p) => <span className="font-mono tabular-nums">{span(p.outerDiameter, imperial)}</span>,
      csv: (p) => span(p.outerDiameter, imperial),
    },
    {
      key: "id",
      label: `ID (${unit})`,
      align: "right",
      sortValue: (p) => p.innerDiameter ?? Infinity,
      cell: (p) => <span className="font-mono tabular-nums">{span(p.innerDiameter, imperial)}</span>,
      csv: (p) => span(p.innerDiameter, imperial),
    },
    {
      key: "len",
      label: `Length (${unit})`,
      align: "right",
      sortValue: (p) => p.length ?? Infinity,
      cell: (p) => <span className="font-mono tabular-nums">{span(p.length, imperial)}</span>,
      csv: (p) => span(p.length, imperial),
    },
    {
      key: "material",
      label: "Material",
      sortValue: (p) => materialLabel(p).toLowerCase(),
      cell: (p) => <span className="text-xs">{materialLabel(p)}</span>,
      csv: (p) => materialLabel(p),
    },
    {
      key: "pick",
      // Named rather than empty. `DataTable` writes this into a `<th scope="col">`, and a column
      // header with no accessible name leaves 1,089 buttons all reading just "Use" with nothing to
      // place them (WCAG 1.3.1) — on a table whose row header is otherwise set up to give them
      // exactly that context.
      label: "Choose",
      cell: (p) => (
        <Button
          variant="secondary"
          onClick={() => {
            if (p.outerDiameter === undefined || p.length === undefined) return;
            onPick({
              manufacturer: p.manufacturer,
              partNumber: p.partNumber,
              outerDiameter: p.outerDiameter,
              length: p.length,
            });
            setOpen(false);
          }}
          disabled={p.outerDiameter === undefined || p.length === undefined}
        >
          Use
        </Button>
      ),
    },
  ], [imperial, unit, onPick]);

  const control =
    "mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Close the parts list" : "Pick a real body tube"}
        </Button>
        {picked && (
          // Named rather than implied. Four numbers changing at once with nothing saying why is the
          // "controls that forget" tell wearing the opposite hat — the flyer needs to be able to read
          // back what they chose, on the surface that changed.
          <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span>
              Flying{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {picked.manufacturer} {picked.partNumber}
              </span>
            </span>
            <Button variant="ghost" onClick={onClear}>
              Back to the design&apos;s own tube
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
                    placeholder="BT-60, 38 mm, phenolic…"
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
                {currentOuterDiameter !== undefined && (
                  <label className={cx("flex items-end gap-2 text-sm", TOUCH_TARGET)}>
                    <input
                      type="checkbox"
                      checked={fitsOnly}
                      onChange={(e) => setFitsOnly(e.target.checked)}
                      className="mb-2 h-4 w-4"
                    />
                    <span className="mb-1.5 text-zinc-700 dark:text-zinc-300">
                      Only tubes at this design&apos;s caliber ({span(currentOuterDiameter, imperial)}{" "}
                      {unit})
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
                {rows.length} of {parts.length}{" "}
                catalogued body tubes. Dimensions are the vendor&apos;s own published figures, from
                the Apache-2.0 openrocket-database
                {sources && sources.length > 0 ? ` (${sources.length} vendor files)` : ""}{" "}
                — see THIRD-PARTY-NOTICES.md. Choosing one sets this design&apos;s body diameter and
                length;
                the airframe is scaled to the caliber you pick so the mould line stays faired.{" "}
                {/* Said plainly rather than left to be inferred. The material column beside it is the
                    vendor's, so a flyer could reasonably read the resulting MASS as the vendor's too —
                    and it is not: the design keeps its own wall and stock, scaled. Claiming otherwise
                    would be exactly the false precision the safety posture forbids, on the number CG,
                    stability and apogee all sit on. Wall and material are the next increment. */}
                <span className="text-zinc-600 dark:text-zinc-300">
                  The wall and the material stay the design&apos;s own — so the mass is Loft&apos;s,
                  scaled, not the vendor&apos;s published weight.
                </span>
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
                  rowKey={(p) =>
                    `${p.manufacturer}/${p.partNumber}/${p.outerDiameter ?? ""}/${p.length ?? ""}`
                  }
                  initialSort={{ key: "od", dir: 1 }}
                  minWidth="34rem"
                  empty={
                    <p>
                      No catalogued body tube matches that. Clear the search, or turn off the caliber
                      filter to see tubes of every diameter.
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
