"use client";

import { useState } from "react";
import { toCsv, toTsv, type CsvCell } from "@/lib/csv";
import { TOUCH_TARGET } from "@/lib/ui-tokens";

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

const BUTTON =
  "inline-flex items-center rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 " +
  TOUCH_TARGET;

/** Copy a table straight to the clipboard as tab-separated text. A file download is the right shape
 *  for archiving a run and the wrong one for "put these numbers in my build thread" or for pasting a
 *  block into a spreadsheet — which is what this audience does with a motor comparison. Falls back
 *  to a hidden textarea + execCommand where the async clipboard isn't available (an insecure origin,
 *  or an older browser), and says plainly when neither works rather than failing silently. */
export function CopyTable({ rows, label = "Copy" }: { rows: CsvCell[][]; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const onClick = async () => {
    const text = toTsv(rows);
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
    }
    setState(ok ? "copied" : "failed");
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <button type="button" onClick={onClick} className={BUTTON} aria-live="polite">
      {state === "copied" ? "Copied" : state === "failed" ? "Press ⌘/Ctrl+C" : label}
    </button>
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
      className={BUTTON}
    >
      {label}
    </button>
  );
}
