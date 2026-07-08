import SiteHeader from "@/components/SiteHeader";
import LoftApp from "@/components/LoftApp";
import InstallHint from "@/components/InstallHint";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <SiteHeader />
      <LoftApp />
      <InstallHint />
      <Footer />
    </main>
  );
}
