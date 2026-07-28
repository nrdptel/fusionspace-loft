import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Sentences can lose a space at BUILD time and nowhere else.
 *
 *  A JSX text node that begins with a space and contains an HTML entity anywhere in it comes out of
 *  the production build with that leading space stripped. `{casingMm} mm casing …&ldquo;` shipped as
 *  "38mm casing" on every design that renders a motor sweep, while the badge 40 px above it — same
 *  component, no entity in its text node — kept the space and read "38 mm".
 *
 *  Nothing else in the gate can see this. The source is correct, so `tsc` and `eslint` are happy;
 *  vitest never renders these components; and a Playwright assertion on visible text only covers the
 *  one sentence it names. These checks read the built chunks directly, which is where the defect
 *  lives, so a newly-glued sentence fails the gate instead of shipping.
 */
test.describe("built output", () => {
  const chunkDir = "out/_next/static/chunks";

  function chunkText(): string {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js")) files.push(p);
      }
    };
    walk(chunkDir);
    // A denominator: if this ever reads nothing, the assertions below would pass vacuously.
    expect(files.length, "no built chunks found — was `npm run build` run?").toBeGreaterThan(5);
    return files.map((f) => readFileSync(f, "utf8")).join("\n");
  }

  test("no sentence lost the space before it in the production bundle", () => {
    const js = chunkText();
    // Each pair is (what the glued build output looks like, what the flyer should read). Every one
    // of these was found glued in a real build; they are the regression set, not hypotheticals.
    const glued: [RegExp, string][] = [
      [/of the same ",\w+,"mm casing/, "the motor sweep's casing sentence"],
      [/,\w+,"comparison is hidden/, "the what-if help's stored-comparison sentence"],
      [/"Delay"\}\),"is the ejection delay/, "the motor sweep's Delay footnote"],
      [/,\w+,"results describe a different/, "the withheld-comparison notice"],
    ];
    const found = glued.filter(([re]) => re.test(js)).map(([, what]) => what);
    expect(found, `these sentences lost a space at build time: ${found.join("; ")}`).toEqual([]);
  });

  test("the sweep still states its casing with a space, in the bundle a browser downloads", () => {
    const js = chunkText();
    // The positive form, so the test fails if the sentence is deleted rather than merely re-glued.
    // The separator is a real U+00A0 in the bundle (the source writes `&nbsp;`), not a plain space.
    expect(js).toMatch(/of the same ",\w+,"[\s\u00a0]mm casing/);
  });
});
