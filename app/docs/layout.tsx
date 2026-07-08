import SiteHeader from "@/components/SiteHeader";
import DocsNav from "@/components/DocsNav";
import Footer from "@/components/Footer";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-10">
      <SiteHeader compact />
      <div className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Documentation</h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          How Loft computes what it shows, where the model is weak, and how its accuracy is
          measured. The repository is open — the math here is meant to be checked, not trusted.
        </p>
        <div className="mt-4">
          <DocsNav />
        </div>
      </div>
      <article className="prose-loft mt-8">{children}</article>
      <Footer />
    </main>
  );
}
