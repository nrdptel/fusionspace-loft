"use client";

import type { Rocket } from "@/lib/model/types";
import { structurePointMasses, combine, type PointMass } from "@/lib/sim/mass";
import { flattenRocket } from "@/lib/model/geometry";
import { massSourceLabel } from "@/lib/mass-provenance";
import { kgToLb, mToIn } from "@/lib/units";
import type { CsvCell } from "@/lib/csv";
import DownloadCsv, { CopyTable } from "./DownloadCsv";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import { Card } from "./ui";
import DataTable from "./DataTable";

const round = (n: number, dp: number) => (Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : "");

/** Mass & balance breakdown: where the design's dry structural mass comes from, part by part, and
 *  how it balances. Pure transparency into what Loft parsed — the same per-component point masses the
 *  simulator flies — so a flyer can sanity-check an import (a mistyped wall thickness or a missing
 *  override shows up as a wrong row) and see the dry centre of gravity. Structure only: the motor and
 *  nose ballast add their mass at launch and aren't shown here; an airframe what-if IS, because
 *  the airframe is what this describes. Read-only for now; it's also the component-level view a
 *  from-scratch builder will edit. */
export default function MassBreakdown({
  rocket,
  units,
  edited,
  massAbsorbed,
  massHeldBy,
}: {
  rocket: Rocket;
  units: UnitSystem;
  /** A geometry what-if is in force, so this describes the edited airframe rather than the file's.
   *  Said on the panel, in the same words and the same badge the diagram above it uses — a mass
   *  table that silently swapped which rocket it describes is worse than one that never moved. */
  edited?: boolean;
  /** Mass was added by a what-if and the design's total did not move, because the design states its
   *  weight as a whole-assembly override and the added part sits inside it. The model is right to
   *  hold the stated figure — that is what an override means — but the flyer has just typed a
   *  kilogram into a field and every number stayed put, so the panel where mass is read says why. */
  massAbsorbed?: boolean;
  /** The assembly or stage whose stated weight covers a part the flyer has REMOVED, or undefined. The
   *  mirror of `massAbsorbed`: the total does not fall either, and the panel where mass is read is
   *  where that has to be said. Carries the holder's own name rather than a boolean, because "the
   *  design states this" is not actionable and "Sustainer states this" is. */
  massHeldBy?: string;
}) {
  const points = structurePointMasses(rocket);
  const total = combine(points);
  // Heaviest first — the parts that dominate the dry mass lead.
  const rows = [...points].sort((a, b) => b.mass - a.mass);
  // One describer for all three mass surfaces — see `lib/mass-provenance.ts` for why it is not local
  // to any of them. Every row here HAS its own mass by construction (that is what a point mass is),
  // so the "counted elsewhere" case the parts table handles cannot arise; the one row without a
  // component is the stage-level lump, which has no single part to attribute.
  const byId = new Map(flattenRocket(rocket).map((p) => [p.component.id, p.component]));
  const provenanceOf = (p: PointMass): string => {
    const c = p.componentId ? byId.get(p.componentId) : undefined;
    return c ? massSourceLabel(c, true) : "—";
  };

  const massUnit = units === "imperial" ? "lb" : "kg";
  const lenUnit = units === "imperial" ? "in" : "mm";
  const toMass = (kg: number) => (units === "imperial" ? kgToLb(kg) : kg);
  const toLen = (m: number) => (units === "imperial" ? mToIn(m) : m * 1000);
  const csv: CsvCell[][] = [
    ["Component", `Mass (${massUnit})`, "Mass from", "% dry", `CG from nose (${lenUnit})`],
    ...rows.map((p): CsvCell[] => [
      p.source,
      round(toMass(p.mass), 4),
      provenanceOf(p),
      total.mass > 0 ? round((p.mass / total.mass) * 100, 1) : "",
      round(toLen(p.cg), 1),
    ]),
    ["Dry total", round(toMass(total.mass), 4), "", 100, round(toLen(total.cg), 1)],
  ];

  return (
    <Card as="details" pad={false} className="group">
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <span className="flex items-center gap-2">
          Mass &amp; balance · dry {d.q(d.mass(total.mass, units))}
          {edited && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              with your edits
            </span>
          )}
        </span>
        <span className="text-zinc-400 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
        {/* The rows arrive heaviest-first, which is the reading this panel is FOR, so that stays the
            initial sort — but a flyer checking an import against a build sheet wants the part order or
            the station order too, and could not have either. The dry total is a `tfoot`, so it stays
            put whatever the sort: a total that sorted into the middle of the parts it totals would be
            worse than no total. */}
        <DataTable
          rows={rows}
          rowKey={(p, i) => `${p.source}-${i}`}
          caption="Dry structural mass, part by part"
          empty="No structural mass was parsed from this design — import a design with components and every part's mass appears here."
          footer={{
            source: "Dry total",
            mass: d.q(d.mass(total.mass, units)),
            pct: "100%",
            cg: `CG ${d.q(d.lengthMm(total.cg, units))}`,
          }}
          columns={[
            {
              key: "source",
              label: "Component",
              rowHeader: true,
              sortValue: (p) => p.source,
              cell: (p) => <span className="font-sans font-normal text-zinc-700 dark:text-zinc-200">{p.source}</span>,
            },
            { key: "mass", label: "Mass", sortValue: (p) => p.mass, cell: (p) => d.q(d.mass(p.mass, units)) },
            {
              // **The third surface to answer "whose number is this", and the last one that did not.**
              // The parts table gained a *Mass from* column and the identify line gained the words;
              // this panel is the one a flyer opens to decide WHERE the weight is, and it showed the
              // same 108 stated and 60 tool-carried figures as bare numbers. `DESIGN.md` section 6
              // requires a reference value to name its source, and a breakdown is nothing but
              // reference values.
              //
              // A row with no `componentId` is the lumped mass of a stage-level override — it stands
              // for a whole assembly rather than one part, so there is no single provenance to give
              // and it says so with the same dash the parts table uses.
              key: "massFrom",
              label: "Mass from",
              sortValue: (p) => provenanceOf(p),
              cell: (p) => <span className="text-zinc-500 dark:text-zinc-400">{provenanceOf(p)}</span>,
              csv: (p) => provenanceOf(p),
            },
            {
              key: "pct",
              label: "% dry",
              sortValue: (p) => p.mass,
              cell: (p) => (
                <span className="text-zinc-500 dark:text-zinc-400">
                  {total.mass > 0 ? d.fmt((p.mass / total.mass) * 100, 0) : "—"}%
                </span>
              ),
            },
            { key: "cg", label: "CG from nose", sortValue: (p) => p.cg, cell: (p) => d.q(d.lengthMm(p.cg, units)) },
          ]}
        />
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {/* "are in the liftoff mass above" was an unconditional promise, and this panel takes no
              run so it cannot see when the promise breaks: a motor that did not resolve is left out
              of the build entirely, and the figure above is then titled "Dry mass" with no motor in
              it. Narrowed rather than made conditional — the clause is true in both states, and it
              is the reconciliation a flyer opens this panel to make. */}
          Dry structure only — the motor and nose ballast add their mass at launch and are not
          shown here; where a motor was matched, they are in the flight&apos;s liftoff mass above. A design what-if that changes
          the airframe is shown here — resizing a part moves its row, and adding a payload or a
          drogue adds one — unless the design overrides the mass of the assembly the part sits in.
          Where a component or a stage states the mass of its whole subassembly, that measured figure
          stands in for everything inside it (the internals aren&apos;t listed separately), and
          anything added inside it is covered by the same figure.
          These are the same per-part masses the simulator flies; a wrong row usually means a
          mistyped dimension or material in the design file.
        </p>
        {massHeldBy && (
          <Card as="p" tone="warn" className="mt-2 text-sm">
            A part you added or removed was inside {massHeldBy}, whose weight this design states
            outright — so the dry total above is unchanged. The stated figure stands for everything in
            there whether or not that part is, and the flight is flown at that figure. What the change
            does move is the balance: the design&apos;s own weight is now spread over a different set of
            parts, so the centre of gravity and the stability margin have changed.
          </Card>
        )}
        {massAbsorbed && (
          <Card as="p" tone="warn" className="mt-2 text-sm">
            The mass you added is inside an assembly whose weight this design states outright, so it
            does not change the total — the design&apos;s own figure stands for everything in there,
            and the flight above is flown at that figure. To fly the extra weight, use{" "}
            <em>Nose ballast</em>, which is added on top rather than inside.
          </Card>
        )}
        <div className="mt-2">
          <DownloadCsv rows={csv} name={rocket.name} suffix="mass-breakdown" />
          <CopyTable rows={csv} />
        </div>
      </div>
    </Card>
  );
}
