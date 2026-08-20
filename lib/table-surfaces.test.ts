import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Every table in this app remembers the sort a flyer put it in, and remembers it the same way.
 *
 *  **The rule.** `components/DataTable.tsx` is the one table — `DESIGN.md` §5 says "every table is
 *  this one" — and its sort is a controlled pair the caller owns. `usePersistedSort` is the only
 *  correct way to own it, because the correct version has four parts a call site keeps getting
 *  wrong: key and direction in ONE stored value so the pair cannot come back inconsistent; an
 *  allowlist derived from the columns that can ACTUALLY sort; a third state for the caller's own
 *  order; and a storage key that varies when the admissible column set does.
 *
 *  **Why a census and not a review.** Six of the seven tables forgot their sort, and the seventh —
 *  `components/MotorSweep.tsx` — spelled the mechanism out by hand and got the allowlist wrong: it
 *  derived the list from every column, admitted a key whose column has no `sortValue`, and a stored
 *  value of that shape reached `col.sortValue!(a)` behind a non-null assertion and took the workspace
 *  down on render. One correct hand-written copy out of one is not a rate to build six more on.
 *
 *  **What is counted, and why THAT.** The hosts are DISCOVERED — every `<DataTable` in
 *  `components/` — rather than listed, so a table added later joins this census whether or not anyone
 *  remembers this file exists. That is `lib/design-system.test.ts`'s lesson and P14's: an enumerated
 *  check cannot see the divergence it was written for.
 *
 *  **What this cannot see, said plainly.** It reads source text, not behaviour: it proves each host
 *  routes its sort through the hook, not that the hook is given the right columns or the right key.
 *  The columns are proved by the compiler (`sort` and `onSortChange` are required props) and by
 *  `lib/table-sort.test.ts`; the round trip is proved by `e2e/smoke.spec.ts`. */

const DIR = "components";
const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));

/** The opening `<DataTable` tag's attribute text, per host. Read to the first `>` that closes the tag
 *  at depth zero, so an arrow function inside a prop cannot truncate the list — the exact blindness
 *  `lib/envelope-surfaces.test.ts` records having shipped once, where membership depended on the
 *  ORDER the props happened to be written in. */
function tagsIn(src: string): string[] {
  const out: string[] = [];
  let at = src.indexOf("<DataTable");
  while (at !== -1) {
    let depth = 0;
    let k = at;
    for (; k < src.length; k++) {
      const c = src[k];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push(src.slice(at, k));
    at = src.indexOf("<DataTable", k);
  }
  return out;
}

describe("every table remembers its sort, and remembers it one way", () => {
  const hosts = files
    .map((f) => ({ file: f, src: readFileSync(join(DIR, f), "utf8") }))
    .filter((h) => h.file !== "DataTable.tsx" && h.src.includes("<DataTable"))
    .flatMap((h) => tagsIn(h.src).map((tag) => ({ file: h.file, src: h.src, tag })));

  it("finds every table in the app", () => {
    // CONTROL: a census over an empty set passes every assertion below perfectly. The count is stated
    // so that a table deleted by accident, or a scan that stopped matching, is a failure rather than
    // a silence. Raise it deliberately when a table is added.
    expect(hosts.length, `hosts found: ${hosts.map((h) => h.file).join(", ")}`).toBe(7);
  });

  it("routes every one of them through usePersistedSort", () => {
    const wrong: string[] = [];
    for (const h of hosts) {
      const sortProp = /\bsort=\{([A-Za-z0-9_.]+)\}/.exec(h.tag);
      if (!sortProp) {
        wrong.push(`${h.file}: no sort={…} on the tag at all`);
        continue;
      }
      const name = sortProp[1];
      // The binding has to come from the hook, in this same file. A `useState` pair passed under the
      // same names satisfies the compiler and forgets on every reload, which is the defect.
      const bound = new RegExp(`const\\s*\\[\\s*${name}\\s*,\\s*[A-Za-z0-9_]+\\s*\\]\\s*=\\s*usePersistedSort\\(`).test(h.src);
      if (!bound) wrong.push(`${h.file}: sort={${name}} is not bound by usePersistedSort`);
    }
    expect(wrong, "a table whose sort dies with the tab").toEqual([]);
  });

  it("leaves no table holding a sort in a bare useState", () => {
    // The other direction, because the check above only reads what the TAG says. A host that kept a
    // `useState` beside the hook has two sort models and will eventually render from the wrong one.
    const stale = hosts
      .filter((h) => /const\s*\[\s*[A-Za-z0-9_]*[Ss]ort[A-Za-z0-9_]*\s*,[^\]]*\]\s*=\s*useState/.test(h.src))
      .map((h) => h.file);
    expect([...new Set(stale)], "a DataTable host still holding a sort in component state").toEqual([]);
  });

  it("gives every table its own storage key, and no two the same", () => {
    // Two tables sharing a key is a one-way door of the kind `RocketDiagram`'s zoom already recorded:
    // a sort set on the surface that HAS the control comes back to the surface that does not.
    const keys = files
      .flatMap((f) => [...readFileSync(join(DIR, f), "utf8").matchAll(/usePersistedSort\(\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1]));
    expect(keys.length, "every host calls the hook exactly once").toBe(7);
    expect(new Set(keys).size, `keys: ${keys.join(", ")}`).toBe(7);
    // Under the `loft.pref.` namespace `lib/session.ts` owns, in the `<surface>.<thing>` convention
    // its other eleven call sites use.
    expect(keys.filter((k) => !/^[a-z][A-Za-z]*(\.[a-zA-Z${}]+)+$/.test(k)), "off-convention key").toEqual([]);
  });
});
