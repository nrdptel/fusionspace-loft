"use client";

import { toCsv, type CsvCell } from "@/lib/csv";

/** Turn a design name into a safe filename stem. */
function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "loft"
  );
}

/** A small "Download CSV" button that serialises a grid of rows and saves it to a file, entirely in
 *  the browser (a Blob + object URL — nothing is uploaded). Used to export the analysis tables so a
 *  flyer can take the numbers into a spreadsheet. */
export default function DownloadCsv({
  rows,
  name,
  suffix,
  label = "Download CSV",
}: {
  rows: CsvCell[][];
  /** Design name, slugged into the filename. */
  name: string;
  /** What this export is, e.g. "motor-sweep". */
  suffix: string;
  label?: string;
}) {
  const onClick = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(name)}-${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {label}
    </button>
  );
}
