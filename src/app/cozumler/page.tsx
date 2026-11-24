import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CTA_PRIMARY, EYEBROW, SECTION, SiteFrame } from "@/components/landing/site-chrome";
import { SOLUTION_GROUP_LABELS, SOLUTION_GROUPS, solutionHref, solutionsIn } from "@/domain/solutions";

export const metadata: Metadata = {
  title: "Çözümler",
  description: "Yankı'nın kullanım alanına ve kurum türüne göre çözümleri.",
};

/** Çözümler dizini. Yalnızca panelde çalışan karşılığı olan çözümler listelenir. */
export default function SolutionsIndexPage() {
  return (
    <SiteFrame>
      <section className="bg-[radial-gradient(60rem_24rem_at_50%_-8rem,var(--brand-wash),transparent)]">
        <div className={`${SECTION} pb-10 pt-14 sm:pt-20`}>
          <p className={EYEBROW}>Çözümler</p>
          <h1 className="mt-2 max-w-[20ch] text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[3rem]">Aynı panel, farklı sorular.</h1>
          <p className="mt-4 max-w-[60ch] text-[1.0625rem] leading-relaxed text-ink-soft">
            Aşağıdaki her çözüm, panelde bugün çalışan bir ekrana karşılık gelir. Her sayfada o ekranın demo verisiyle çizilmiş canlı bir örneği yer alır.
          </p>
        </div>
      </section>

      {SOLUTION_GROUPS.map((group) => (
        <section key={group} className="pb-14">
          <div className={SECTION}>
            <h2 className="text-[1.25rem] font-semibold tracking-[-0.015em]">{SOLUTION_GROUP_LABELS[group]}</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {solutionsIn(group).map((solution) => (
                <li key={solution.slug}>
                  <Link
                    href={solutionHref(solution.slug)}
                    className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] transition-colors hover:border-brand"
                  >
                    <span className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{solution.name}</span>
                    <span className="mt-1.5 flex-1 leading-relaxed text-ink-soft">{solution.summary}</span>
                    <span className="mt-4 inline-flex items-center gap-1 text-[0.875rem] font-semibold text-brand-strong">
                      İncele
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="pb-20">
        <div className={SECTION}>
          <div className="rounded-3xl border border-line bg-brand-wash px-6 py-10 text-center sm:px-12">
            <h2 className="mx-auto max-w-[26ch] text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[1.875rem]">Hepsini tek demoda deneyin.</h2>
            <p className="mx-auto mt-3 max-w-[52ch] text-ink-soft">Demo, kurgusal veriyle çalışan panelin kendisidir; kayıt gerekmez.</p>
            <Link href="/panel" className={`${CTA_PRIMARY} mt-6`}>
              Demoyu incele
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </SiteFrame>
  );
}
