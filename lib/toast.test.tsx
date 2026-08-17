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

  it("renders the Card treatment rather than spelling one, and floats at §2's one elevation", () => {
    // The whole point of the extraction: the treatment comes from `Card`, so `components/ui.tsx`
    // still holds the only `rounded-xl border` string in the tree. If `Toast` ever hand-rolls its
    // own, `lib/design-system.test.ts`'s outside-the-primitives count catches it — but that check
    // reads SOURCE, and this one reads what the browser is actually handed.
    expect(html).toContain("rounded-xl");
    expect(html).toContain("border-zinc-200");
    expect(html).toContain("dark:bg-zinc-900");
    // §2's `floating`, and there is exactly one value.
    expect(html).toContain("shadow-lg");
  });

  it("is announced politely and never steals focus", () => {
    // `status`, not `alert`. A toast is by definition something a flyer may ignore; anything they
    // must act on belongs in the flow as an `ErrorState`, where it cannot be dismissed unread.
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
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
    // the control announces as nothing at all.
    expect(html).toContain('aria-label="Dismiss"');
    expect(html).toContain("pointer-coarse:min-w-11");
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
