"use client";

import { useMemo, useState } from "react";

import { TOUCH_TARGET_SQUARE, cx } from "@/lib/ui-tokens";
import { compareCells } from "@/lib/table-sort";
import { withPreamble, type CsvCell } from "@/lib/csv";
import DownloadCsv, { CopyTable } from "./DownloadCsv";
import { EmptyState } from "./ui";

/** One column of a `DataTable` — `DESIGN.md` §5, which names this primitive and says "every table is
 *  this one".
 *
 *  `sortValue` is what makes a column sortable; omitting it is how a column opts OUT, which is right
 *  for a cell that is a sentence rather than a value. `csv` is separate from `cell` on purpose: a cell
 *  renders nodes (a unit in its own span, an amber delta, a "not logged" fallback) and a CSV row wants
 *  the number. Deriving one from the other would put markup in the export or strip meaning from the
 *  screen. */
export interface Column<R> {
  key: string;
  label: string;
  /** Numerals right-align so digits line up down the column; text stays left. */
  align?: "left" | "right";
  /** Return a sortable scalar, or omit to make this column unsortable. */
  sortValue?: (row: R) => number | string;
  /** Which way this column sorts on its FIRST click. Defaults to ascending, which is right for a name
   *  and wrong for a measurement: someone clicking "Apogee" wants the highest, not the lowest. The
   *  motor sweep had encoded that per column before it took the primitive — biggest first for a
   *  number, A→Z for a name — and a table that opens every column ascending makes a flyer click
   *  twice to ask the question they meant. */
  sortDir?: 1 | -1;
  cell: (row: R) => React.ReactNode;
  /** Render this column's cell as `<th scope="row">` rather than `<td>` — the column that NAMES the
   *  row. A screen reader then reads "Apogee, 994 m" instead of announcing a bare number, which is
   *  the whole reason a data table has row headers.
   *
   *  It also decides `td` indices for anything reading the DOM. Converting a table whose first column
   *  was a row header into all-`<td>` shifts every column by one: the cross-check e2e reads
   *  `td[0]` as RocketPy's apogee and silently got the row's label instead — `NaN`, against an
   *  expected 994. */
  rowHeader?: boolean;
  /** What this column contributes to a copy or a CSV export. Omit and the column is left out of
   *  both, which is correct for a column that is purely presentational. */
  csv?: (row: R) => CsvCell;
  /** The header this column carries in an export, when that legitimately differs from the one on
   *  screen.
   *
   *  **It differs whenever the screen puts the unit in the CELL.** A rendered cell can show
   *  "994 m" and stay a number to the eye; a CSV cell cannot be both a number a spreadsheet will
   *  sum and a string carrying its unit, so the unit has to move into the header — which is what
   *  every hand-built export in this app already does (`Apogee (ft)`). Measured 2026-08-05: the
   *  cross-check and validation exports shipped bare floats under headers reading `Stored` and
   *  `Loft`, whose VALUE flips with the unit toggle, under one filename, with no unit anywhere in
   *  the file. Defaults to `label`, so a column that needs nothing says nothing. */
  csvLabel?: string;
}

/** The one table.
 *
 *  Before this existed there were six hand-rolled `<table>` elements with three different affordance
 *  sets between them: two sorted, two copied, two exported, and **three offered nothing at all** —
 *  `ValidationPanel`, `RocketpyCrossCheck` and the phase table, which is the surface `COMPETITION.md`
 *  row 25 calls a lead no competitor has and whose numbers could not leave the page. `DESIGN.md` §5
 *  names "tables you cannot sort, filter, or copy out of" as a tell, and says it is only fixable once
 *  rather than per table.
 *
 *  What it gives every table, from `COMPETITION.md` rows 24 and 26:
 *  - **sort on any column that offers a value**, with `aria-sort` on the header and a real `<button>`
 *    inside it, so the sort is reachable from the keyboard rather than being a click target;
 *  - **a sticky header**, which §5 asks for and which no table here had — `GeometryInspector` runs one
 *    row per component and scrolls its own header away on a real design;
 *  - **copy and CSV export**, because a number a flyer cannot paste into a build thread is a number
 *    that stays on the page. OpenRocket has shipped a simulation-table CSV export since 23.09.
 *
 *  Deliberately NOT here yet: column choice (RockSim's Available/Displayed lists, row 24) and filter.
 *  Both are real gaps, both are recorded, and neither is worth half-building into the primitive that
 *  six surfaces are about to depend on. */
export default function DataTable<R>({
  columns,
  rows,
  rowKey,
  caption,
  /** A name for the exported file. Omit to leave the table without copy/export controls — right for a
   *  table whose rows are already exported by the surface around it. */
  exportName,
  exportSuffix,
  csvPreamble,
  /** Minimum table width before the wrapper starts scrolling. `ValidationPanel` is the one table that
   *  needs it: its four columns compress into unreadability before the viewport does. */
  minWidth,
  initialSort,
  /** Controlled sort. Pass BOTH to hold the sort model outside the table — needed when it must
   *  survive the component (`MotorSweep` persists it per browser, validated against its own column
   *  list) or when the surface computes something from it (that same panel exports its CSV in the
   *  order on screen, so it has to know what the order IS).
   *
   *  Deliberately a controlled pair rather than a `persistKey` on the primitive. Persistence here is
   *  not a write-and-read-back: the stored value is validated against the current column set so a
   *  remembered sort from an older build is discarded rather than leaving the table sorted on a
   *  column that no longer exists, and key and direction ride in ONE stored string so the pair cannot
   *  come back inconsistent. A `persistKey` signature holds none of that, and it could not express a
   *  third state — the parts table's third click returns to the design's own nose-to-tail order,
   *  which is `null`, not a `{key, dir}`. */
  sort: controlledSort,
  onSortChange,
  /** A totals row, keyed by column. Rendered in a `<tfoot>` — which is what it is, semantically, and
   *  which also keeps it OUT of the sort: a dry total that sorted into the middle of the parts it
   *  totals would be worse than no total at all. Columns absent from the record render empty. */
  footer,
  empty,
  /** Attributes for one row's `<tr>` — selection, hover-linking, a keyboard path, a tone.
   *
   *  An escape hatch with a narrow mouth: the primitive owns the row's structure and its border, and
   *  the caller owns what the row MEANS. The parts table's rows are pickable and link to the diagram
   *  on hover and on focus, which is seven attributes on the `<tr>` and not one of them a styling
   *  choice — without this the table could not take the primitive at all, which is why it was still
   *  hand-rolled. `className` here is appended to the primitive's own, never replaces it. */
  rowProps,
  className,
}: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R, i: number) => string;
  caption?: React.ReactNode;
  exportName?: string;
  exportSuffix?: string;
  /** Lines placed above the header in the CSV and the copied grid — what the table said that a grid
   *  of cells cannot say for itself.
   *
   *  Each becomes its own single-cell row. For a caveat that changes how the numbers should be read:
   *  a withheld metric and why, the conditions a flown figure assumed. NOT for a title or a
   *  timestamp — the filename carries the first and nobody asked for the second. */
  csvPreamble?: string[];
  minWidth?: string;
  initialSort?: { key: string; dir: 1 | -1 };
  sort?: { key: string; dir: 1 | -1 } | null;
  onSortChange?: (next: { key: string; dir: 1 | -1 } | null) => void;
  footer?: Record<string, React.ReactNode>;
  /** `DESIGN.md` §5: a surface with no empty state is not finished, and "No data" is forbidden — say
   *  what would fill it. Required rather than optional for exactly that reason. */
  empty: React.ReactNode;
  rowProps?: (row: R, i: number) => React.HTMLAttributes<HTMLTableRowElement> & { className?: string };
  className?: string;
}) {
  const [ownSort, setOwnSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ?? null);
  const controlled = onSortChange !== undefined;
  const sort = controlled ? controlledSort ?? null : ownSort;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    // A copy, never in place: `rows` is the caller's array and sorting it under them changes what the
    // surface around the table is holding.
    // `compareCells` lives in `lib/` because it is pure and this file is not in vitest's walk — see
    // the note at the top of that module. It is also where the non-finite-last rule is documented.
    return [...rows].sort((a, b) => compareCells(get(a), get(b), sort.dir));
  }, [rows, sort, columns]);

  // Built from the SORTED rows, so what a flyer copies is what they are looking at. Columns with no
  // `csv` are left out of both the header and the body, so the two cannot fall out of step.
  const csvCols = columns.filter((c) => c.csv);
  const csvRows: CsvCell[][] = useMemo(
    // The preamble carries what the TABLE said and a grid of cells cannot — see `withPreamble` for
    // why it goes above the header rather than under the last row.
    () =>
      withPreamble(csvPreamble, [
        csvCols.map((c) => c.csvLabel ?? c.label),
        ...sorted.map((r) => csvCols.map((c) => c.csv!(r))),
      ]),
    [sorted, csvCols, csvPreamble],
  );

  if (rows.length === 0) {
    // `DESIGN.md` §5's `EmptyState`, not a bare div. Every table in the app is this component, so
    // this one branch is the empty state of all seven of them — which is exactly why it should not
    // be a treatment spelled here. The `empty` prop is already required, and its copy already has to
    // say what would fill the table; the primitive is what makes it LOOK like the state it is,
    // rather than like a paragraph where a table was.
    return <EmptyState what={empty} className={className} />;
  }

  const click = (key: string) => {
    const col = columns.find((c) => c.key === key);
    const next: { key: string; dir: 1 | -1 } =
      sort?.key === key
        ? { key, dir: (sort.dir === 1 ? -1 : 1) as 1 | -1 }
        : { key, dir: col?.sortDir ?? 1 };
    if (controlled) onSortChange!(next);
    else setOwnSort(next);
  };

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums" style={minWidth ? { minWidth } : undefined}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {columns.map((c, i) => {
                const active = sort?.key === c.key;
                const last = i === columns.length - 1;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    // Sticky so a long table keeps its header. `bg-*` is required with `sticky` or the
                    // rows scroll THROUGH the header text.
                    className={cx(
                      "sticky top-0 z-10 bg-white py-1 font-medium dark:bg-zinc-900",
                      !last && "pr-4",
                      c.align === "right" && "text-right",
                    )}
                    aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : c.sortValue ? "none" : undefined}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => click(c.key)}
                        // No `title`. It said "Sort by mass" on a button already reading "Mass",
                        // which is `MAINTAINING.md`'s named tell — a tooltip that restates the label
                        // instead of teaching something — and on a phone a native tooltip never
                        // fires at all, so it counted against §8's hover-only budget while telling
                        // nobody anything. The `aria-label` below is what actually carries the verb,
                        // and it reaches a screen reader on every form factor.
                        // The accessible name says what the control DOES, not just what the column is
                        // called. Without it a column header is named only by its label, and a column
                        // called "Metric" is then indistinguishable from the units toggle's "Metric"
                        // button — which is a strict-mode violation for a test and, more to the point,
                        // two identically-named buttons on one screen for anyone listening to it.
                        // WCAG 2.5.3 wants the visible label inside the accessible name, and it is.
                        aria-label={`Sort by ${c.label}`}
                        className={cx(
                          "inline-flex items-center gap-1 uppercase tracking-wide hover:text-zinc-800 dark:hover:text-zinc-100",
                          TOUCH_TARGET_SQUARE,
                          active && "text-zinc-800 dark:text-zinc-100",
                        )}
                      >
                        {c.label}
                        {/* Kept in the layout when inactive so a sort does not shift the header row. */}
                        <span aria-hidden className={active ? "" : "opacity-0"}>
                          {active && sort!.dir === -1 ? "▼" : "▲"}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="font-mono">
            {sorted.map((row, i) => {
              const extra = rowProps?.(row, i);
              const { className: rowClass, ...rest } = extra ?? {};
              return (
              <tr
                key={rowKey(row, i)}
                className={cx("border-t border-zinc-100 dark:border-zinc-800", rowClass)}
                {...rest}
              >
                {columns.map((c, k) => {
                  const Cell = c.rowHeader ? "th" : "td";
                  return (
                    <Cell
                      key={c.key}
                      scope={c.rowHeader ? "row" : undefined}
                      className={cx(
                        "py-1.5 font-normal text-zinc-800 dark:text-zinc-100",
                        c.rowHeader && "text-left",
                        k < columns.length - 1 && "pr-4",
                        c.align === "right" && "text-right",
                      )}
                    >
                      {c.cell(row)}
                    </Cell>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="border-t border-zinc-300 dark:border-zinc-700">
                {columns.map((c, k) => {
                  // The first column is the row's name, the same way `rowHeader` works in the body.
                  const Cell = k === 0 ? "th" : "td";
                  return (
                    <Cell
                      key={c.key}
                      scope={k === 0 ? "row" : undefined}
                      className={cx(
                        "py-1.5 font-medium text-zinc-900 dark:text-zinc-50",
                        k === 0 && "text-left",
                        k < columns.length - 1 && "pr-4",
                        c.align === "right" && "text-right",
                      )}
                    >
                      {footer[c.key]}
                    </Cell>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {exportName && csvCols.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <DownloadCsv rows={csvRows} name={exportName} suffix={exportSuffix ?? "table"} />
          <CopyTable rows={csvRows} />
        </div>
      )}
    </div>
  );
}
