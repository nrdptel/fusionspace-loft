import SiteHeader from "@/components/SiteHeader";
import LoftApp from "@/components/LoftApp";
import InstallHint from "@/components/InstallHint";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    // A simulation workspace is not prose: a diagram, four plots, a cross-check table and a
    // sweep all want width, and 1024 px left 47% of a 1920 px display empty. The column grows
    // past the reading measure only on a large screen; the prose blocks inside it keep their own
    // narrower caps, so the import screen still reads at a comfortable line length.
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10 xl:max-w-7xl 2xl:max-w-[100rem]">
      <SiteHeader />
      <LoftApp />
      <InstallHint />
      <Footer />
    </main>
  );
}
