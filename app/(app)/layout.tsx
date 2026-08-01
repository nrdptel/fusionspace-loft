import SiteHeader from "@/components/SiteHeader";
import LoftApp from "@/components/LoftApp";
import InstallHint from "@/components/InstallHint";
import Footer from "@/components/Footer";

/** The shell every workspace shares: the header, the loaded design and its chrome, the navigation
 *  spine, and the footer.
 *
 *  **The design lives HERE, above the routes, and that is the load-bearing decision.** A Next layout
 *  is not remounted when the flyer moves between the routes under it, so the imported design, its
 *  edits, its undo stack, a running Monte-Carlo and a RocketPy cross-check all survive a navigation
 *  — which is what P2's *done when* means by "the design and its results survive moving between
 *  them". Putting the workspaces' content in the page files instead would unmount a 300-flight
 *  dispersion every time someone glanced at the diagram, and none of those results is persisted
 *  anywhere to restore it from.
 *
 *  So each route's `page.tsx` carries that route's identity — its title, its description, its entry
 *  in the static export — and the shell renders the workspace the address names. The split is real
 *  in every way a flyer can observe (five addresses, five titles, Back and Forward, bookmarks, one
 *  precached document each) and deliberately not real in the one way that would cost them work. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // A simulation workspace is not prose: a diagram, four plots, a cross-check table and a
    // sweep all want width, and 1024 px left 47% of a 1920 px display empty. The column grows
    // past the reading measure only on a large screen; the prose blocks inside it keep their own
    // narrower caps, so the import screen still reads at a comfortable line length.
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-12 xl:max-w-7xl 2xl:max-w-[100rem]">
      <SiteHeader />
      <LoftApp>{children}</LoftApp>
      <InstallHint />
      <Footer />
    </main>
  );
}
