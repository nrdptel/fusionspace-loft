import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Button, DropZone } from "@/components/ui";

/** The file target, rendered — `DESIGN.md` §5.
 *
 *  Same shape as `lib/toast.test.tsx` and for the same reason: `vitest` runs in `node` here, so this
 *  layer can assert what the primitive RENDERS and nothing about what it does when a file crosses it.
 *  The drag states, the refusal and the picker are driven in `e2e/import.spec.ts`, against a real
 *  browser and a real `DataTransfer`. Splitting it that way is deliberate — the half that can be
 *  wrong quietly is the treatment, and the half that can only be wrong loudly is the behaviour.
 *
 *  Classes are read per element and compared as SETS, which is the correction `lib/toast.test.tsx`
 *  records: reading the whole document as one string makes `toContain("border")` pass on
 *  `border-dashed` and `dark:bg-zinc-900` pass on `dark:bg-zinc-900/50`. */
describe("DropZone — DESIGN.md §5", () => {
  const render = (props: Partial<React.ComponentProps<typeof DropZone>> = {}) =>
    renderToStaticMarkup(
      <DropZone
        className="mx-auto max-w-3xl sm:p-8"
        accept=".ork,.rkt"
        onFile={() => {}}
        pickLabel="Choose a file"
        inputLabel="Choose an OpenRocket .ork or RockSim .rkt file"
        footer={<p>No file?</p>}
        actions={<Button>Start a new design</Button>}
        {...props}
      >
        <p>Import a design</p>
      </DropZone>,
    );

  const classSets = (html: string) =>
    [...html.matchAll(/class="([^"]*)"/g)].map((m) => new Set(m[1].split(/\s+/).filter(Boolean)));

  const html = render();
  const card = classSets(html)[0];

  it("renders the Card treatment rather than spelling one", () => {
    // The point of the primitive. `components/ui.tsx` holds the only `rounded-xl border` string in
    // the tree, and `lib/design-system.test.ts` asserts that count is exactly 1 — this says the drop
    // zone is one of the things reaching it rather than one of the things left out.
    expect(card).toContain("rounded-xl");
    expect(card).toContain("border");
    // `p-4` is `Card`'s own pad. If the zone started spelling its padding, the milestone's claim
    // that nothing about the container is written here stops being true.
    expect(card).toContain("p-4");
  });

  it("carries ONE border width, and it is the hairline", () => {
    // §2, added 2026-08-18: a container's edge is a hairline whatever the container is for. The
    // hand-rolled version wrote `border-2` over `Card`'s own `border`, which only ever won by source
    // order — `.border` at byte 16,788 of the built stylesheet against `.border-2` at 16,910, equal
    // specificity. This is the assertion that stops it coming back, and it fails the moment it does.
    expect(card, "§2 declares one container border width").not.toContain("border-2");
    // **`/^border-\d/` was the first draft and it does not mean what its message says**: it matches
    // the bare token and misses `sm:border-2`, `dark:border-2` and `border-b-2`, so a responsive or
    // directional reintroduction walked straight past the assertion advertised as the thing that
    // stops one. Caught by the pre-push review. A side rule is legitimate under §2 (the nav spine's
    // underline) and is excluded by NAME rather than by the pattern failing to see it.
    const widths = [...card].filter((c) => /(^|:)border(-[trblxy])?-\d/.test(c));
    expect(widths, "no second width, in any variant or on any side").toEqual([]);
  });

  it("is §2's `muted` tone at rest — sunken and dashed, on the control border", () => {
    // "A slot with nothing in it yet" is exactly what a drop zone is when nothing is over it, and
    // §2's control border is the one for "anything the flyer acts on". Both come from the tone, so
    // this is asserting the tone was chosen rather than a colour written.
    expect(card).toContain("border-dashed");
    expect(card).toContain("border-zinc-300");
    expect(card).toContain("bg-zinc-50");
    // …and NOT the accent tone, which is the drag state. Without this the two states could be the
    // same string and every assertion above would still pass.
    expect(card, "the resting zone is not the armed one").not.toContain("border-indigo-500/30");
  });

  it("owns the picker and the input, and the two agree about what they take", () => {
    // A drop zone with no click-to-pick is broken on every touch device, so the control is the
    // primitive's rather than the call site's. `accept` is one string driving both the dialog and
    // the refusal — the defect this replaced was exactly the two disagreeing.
    expect(html).toContain('accept=".ork,.rkt"');
    expect(html).toContain('type="file"');
    expect(html).toContain('aria-label="Choose an OpenRocket .ork or RockSim .rkt file"');
    expect(html).toContain("Choose a file");
    // `sr-only` rather than `display:none`, so the input is still in the accessibility tree and
    // `setInputFiles` can reach it — which is how the whole suite drives an import.
    //
    // **And `tabIndex={-1}`, which is the correction the pre-push review forced.** A first draft
    // asserted `sr-only` under a comment claiming the input was "reachable by a screen reader AND by
    // the keyboard", which certified a WCAG 2.4.7 defect as the design: `sr-only` clips the element
    // to 1x1, so the focus ring `app/globals.css` gives it has nowhere to draw, and Tab landed
    // between two visible buttons on a control nothing on screen indicated. The labelled, visible
    // button beside it opens the same picker, so the phantom stop is removed rather than styled.
    const input = html.match(/<input[^>]*>/)?.[0] ?? "";
    expect(input).toContain("sr-only");
    expect(input, "an sr-only input must not also be a tab stop").toContain('tabindex="-1"');
  });

  it("renders the call site's copy, its extra control and its note", () => {
    expect(html).toContain("Import a design");
    expect(html).toContain("Start a new design");
    expect(html).toContain("No file?");
  });

  it("says it is working, and takes the picker out of service while it is", () => {
    const busy = render({ busy: true });
    expect(busy).toContain("Working…");
    expect(busy).not.toContain(">Choose a file<");
    // **`toContain("disabled")` CANNOT FAIL here, and the first draft of this file used it.**
    // `buttonClass` emits `disabled:cursor-not-allowed disabled:opacity-50` on every button in the
    // app whatever its state, so that substring is in the resting page too — deleting
    // `disabled={busy}` from the picker left the assertion green. Caught by the pre-push review, and
    // it is the repo's named failure mode arriving inside the test written to prevent it. The
    // ATTRIBUTE is what renders only when the control is really out of service.
    expect(busy, "the picker cannot be pressed twice into the same parse").toContain('disabled=""');
    expect(render(), "…and it is not disabled at rest").not.toContain('disabled=""');
    // The DROP is guarded on the same flag inside the primitive's one intake path — a disabled
    // button stops the picker and stops nothing landing on the zone. **That guard has no assertion
    // here and is not claimed to**: this layer cannot dispatch a drag, and the e2e layer cannot hold
    // a parse open long enough to drop into it.
  });

  it("renders the caller's refusal in the zone, not a judgement of its own", () => {
    // **The primitive owns WHERE, the caller owns WHAT — and the first version had that backwards.**
    // It refused a file whose NAME did not match `accept`, which is wrong for this app: Loft's
    // importer sniffs bytes, so a renamed `.ork` imports fine and a name gate refuses it with a false
    // sentence. It also replaced the importer's own message — which says which box a flight log
    // belongs in — with one that only says no, and broke three e2e cases. Caught by the pre-push
    // review, reproduced, and reverted to this shape.
    const refused = render({ refusal: "That does not look like a rocket design file." });
    expect(refused).toContain("That does not look like a rocket design file.");
    expect(refused, "a refusal is §2's danger tone, through ErrorState").toContain("border-red-500/30");
  });

  it("shows no refusal until there is something to refuse, but keeps the region that will carry it", () => {
    // The error state is a state, not a permanent strip. `ErrorState` renders §2's `danger` tone, so
    // its emptiness is testable by the tone rather than by the text.
    expect(html, "nothing has been refused yet").not.toContain("border-red-500/30");
    // …and the live region itself IS there from the start. A `role="alert"` inserted together with
    // its text is a change half of assistive technology never observes, so the container is
    // unconditional and only its contents are not. Asserting both directions in one case is what
    // makes this falsifiable: hiding the region fails the second, filling it fails the first.
    expect(html, "the region that carries a refusal must exist before the refusal does").toContain(
      'role="alert"',
    );
  });
});
