import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Toast, Button } from "@/components/ui";

/** The floating message surface, rendered — because nothing else in the suite can see it.
 *
 *  **The one surface in the app with no test of any kind, and the reason is structural.** Its only
 *  caller, `components/ServiceWorker.tsx`, returns `null` unless `process.env.NODE_ENV` is
 *  `"production"` AND a service worker is already controlling the page AND a newer one has reached
 *  `installed`. The e2e suite serves a static export through `serve`, so it never registers one — a
 *  grep for `shadow-lg`, `rounded-xl` or `dashed` across `e2e/` returns nothing, and the toast has
 *  shipped untested for as long as it has existed.
 *
 *  So the primitive is tested where it CAN be: rendered directly. `DESIGN.md` §5 declares four things
 *  about it and each is asserted below, because a primitive that only some of its callers get right
 *  is the vocabulary failing rather than a call site failing. */
describe("Toast — DESIGN.md §5", () => {
  const html = renderToStaticMarkup(
    <Toast onDismiss={() => {}} action={<Button variant="primary">Refresh</Button>}>
      A new version of Loft is available.
    </Toast>,
  );

  /** The card's own class attribute, and the wrapper's, read separately.
   *
   *  **Reading the whole document as one string is what the first draft of this file did, and three
   *  of its assertions were wrong for it.** `toContain("dark:bg-zinc-900")` passes on
   *  `dark:bg-zinc-900/50`, so the toast could switch to the SUNKEN surface level with the test
   *  green; and `rounded-xl` / `border-zinc-200` are `Card`'s tone rather than anything about
   *  `Toast`, so a legitimate change to `Card`'s default would fail a file named for the toast.
   *  Caught by the pre-push review. Classes are read per element and compared as SETS. */
  const classAttrs = [...html.matchAll(/class="([^"]*)"/g)].map(
    (m) => new Set(m[1].split(/\s+/).filter(Boolean)),
  );
  const wrapper = classAttrs[0];
  const card = classAttrs[1];

  it("positions itself, which is the half of the wrapper the extraction moved", () => {
    // These are the classes the "the rendered output does not change" claim actually rests on, and
    // the first draft asserted none of them — deleting `z-50 flex justify-center` left it green.
    for (const c of ["fixed", "inset-x-0", "bottom-0", "z-50", "flex", "justify-center", "px-4"]) {
      expect(wrapper, `the toast wrapper lost ${c}`).toContain(c);
    }
  });

  it("lets clicks through everywhere except the card itself", () => {
    // The wrapper is full-width so the card can centre in it. Without this it swallows every click
    // in a ~76 px strip across the bottom of the viewport, on the surfaces behind it, for as long as
    // the toast is up — while §2 says a floating surface tells the flyer what is behind it is still
    // theirs.
    expect(wrapper, "a full-width toast wrapper must not eat clicks").toContain("pointer-events-none");
    expect(card, "…and the card itself must still take them").toContain("pointer-events-auto");
  });

  it("renders the Card treatment rather than spelling one, at §2's floating elevation", () => {
    // The treatment comes from `Card`, so `components/ui.tsx` still holds the only
    // `rounded-xl border` string in the tree. Asserted as an exact SET membership rather than a
    // substring, so the sunken variant (`dark:bg-zinc-900/50`) cannot satisfy the raised one.
    expect(card).toContain("rounded-xl");
    expect(card).toContain("border");
    expect(card, "a toast is a RAISED surface, not a sunken one").toContain("dark:bg-zinc-900");
    expect(card, "…and `dark:bg-zinc-900/50` is a different level").not.toContain("dark:bg-zinc-900/50");
    // §2's `floating`. `shadow-sm` is the thumb value and would be the wrong one here.
    expect(card).toContain("shadow-lg");
    expect(card).not.toContain("shadow-sm");
    // `pad={false}`: the toast owns its own tighter padding.
    expect(card).not.toContain("p-4");
    expect(card).toContain("py-3");
  });

  it("is announced politely and never steals focus", () => {
    // `status`, not `alert`. A toast is by definition something a flyer may ignore; anything they
    // must act on belongs in the flow as an `ErrorState`, where it cannot be dismissed unread.
    //
    // Asserted by reading the role's VALUE rather than by `not.toContain('role="alert"')`, which was
    // the first draft and could not fail on its own — any edit producing `alert` failed the positive
    // assertion first, so the negative one never carried a control of its own.
    const roles = [...html.matchAll(/role="([^"]*)"/g)].map((m) => m[1]);
    expect(roles).toContain("status");
    expect(roles, "a toast is never an alert").not.toContain("alert");
  });

  it("clears the device's own bottom inset, not just a scale step", () => {
    // A toast pinned to `bottom-0` on a phone sits under the home indicator. The inset is added to
    // a scale step rather than replacing it, and it is the one arbitrary spacing value §9 exempts —
    // by expression, which is why moving it into the primitive kept that count green.
    expect(html).toContain("env(safe-area-inset-bottom)");
  });

  it("gives the dismiss a real touch target and an accessible name", () => {
    // Hand-rolled at the call site this was a one-glyph control at roughly 24x28 px, floating over
    // the app beside a much larger button. The glyph itself is `aria-hidden`, so without the label
    // the control announces as nothing at all. Both directions, because the height minimum is met by
    // the button's own padding and the WIDTH is the one that was missing.
    expect(html).toContain('aria-label="Dismiss"');
    const dismiss = classAttrs[classAttrs.length - 1];
    expect(dismiss).toContain("pointer-coarse:min-w-11");
    expect(dismiss).toContain("pointer-coarse:min-h-11");
  });

  it("shows the message and its one action", () => {
    expect(html).toContain("A new version of Loft is available.");
    expect(html).toContain("Refresh");
  });

  it("renders no dismiss when it is not given one", () => {
    // §5 has no undismissable floating surface, but a caller that dismisses itself passes no
    // handler — and rendering a dead ✕ would be a control that does nothing.
    const bare = renderToStaticMarkup(<Toast>Saved.</Toast>);
    expect(bare).not.toContain('aria-label="Dismiss"');
    expect(bare).toContain("Saved.");
  });
});
