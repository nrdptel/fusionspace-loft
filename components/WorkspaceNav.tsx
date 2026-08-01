"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_BAR, navItemClass } from "@/lib/ui-tokens";
import { WORKSPACES, WORKSPACE_META, workspaceFromPath, workspacePath } from "@/lib/workspaces";

/** The one navigation spine over the loaded design, present on every workspace route.
 *
 *  Links, not tabs, and that is the whole point of the change rather than a detail of it. These
 *  switch between distinct JOBS, which `DESIGN.md` §7 makes distinct routes and §5 explicitly rules
 *  out `Tabs` for. A link is also the only version a flyer can middle-click, bookmark, or reach with
 *  the browser's own Back button, and the only one whose target a static export precaches so a
 *  workspace opens offline on its own.
 *
 *  The bar's look is unchanged — `NAV_BAR` and `navItemClass` are the same treatment the tablist
 *  renders, sticky on a phone and 44 px on a coarse pointer — because the treatment was already
 *  right. What moved is the semantics: `aria-current="page"` is how a navigation says "this is where
 *  you are", where a tablist says `aria-selected`.
 *
 *  Rendered only when a design is loaded; with nothing to look at, the workspaces have nothing to
 *  show and the flyer belongs on the import screen. */
export default function WorkspaceNav() {
  const active = workspaceFromPath(usePathname());
  return (
    <nav aria-label="Workspace" className={NAV_BAR}>
      {WORKSPACES.map((w) => {
        const current = w === active;
        return (
          <Link
            key={w}
            href={workspacePath(w)}
            // `aria-current` and nothing else. An `aria-selected` here would claim the tab pattern
            // without its tablist, and a screen reader announcing "selected" on a link is a promise
            // that arrow keys move between them.
            aria-current={current ? "page" : undefined}
            className={navItemClass(current)}
          >
            {WORKSPACE_META[w].label}
          </Link>
        );
      })}
    </nav>
  );
}
