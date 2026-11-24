import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PreviewSkeleton, resolveTargetHref, SolutionPreview } from "@/components/landing/showcase";
import { CTA_PRIMARY, CTA_SECONDARY, EYEBROW, SECTION, SiteFrame } from "@/components/landing/site-chrome";
import { getSolution, SOLUTION_GROUP_LABELS, solutionHref, SOLUTIONS, solutionsIn, type Solution } from "@/domain/solutions";

/** Çözüm sayfası. İçerik `domain/solutions.ts` kaydından, önizleme demo verisinden gelir. */

export function generateStaticParams() {
  return SOLUTIONS.map((solution) => ({ slug: solution.slug }));
}

export async function generateMetadata({ params }: PageProps<"/cozumler/[slug]">): Promise<Metadata> {
  const solution = getSolution((await params).slug);
  return solution ? { title: solution.name, description: solution.summary } : {};
}

/** "Demoda aç" düğmesi: hedef, demo projesinin kimliği okunduktan sonra belli olur. */
async function DemoLink({ solution }: { solution: Solution }) {
  const href = await resolveTargetHref(solution.demo, solution.target);
  return (
    <Link href={href} className={CTA_PRIMARY}>
      {solution.targetLabel}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export default async function SolutionPage({ params }: PageProps<"/cozumler/[slug]">) {
  const solution = getSolution((await params).slug);
  if (!solution) notFound();
  const others = solutionsIn(solution.group).filter((entry) => entry.slug !== solution.slug);

  return (
    <SiteFrame>
      <section className="bg-[radial-gradient(60rem_24rem_at_50%_-8rem,var(--brand-wash),transparent)]">
        <div className={`${SECTION} grid items-start gap-10 pb-16 pt-12 sm:pt-16 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]`}>
          <div>
            <p className={EYEBROW}>
              <Link href="/cozumler" className="hover:underline">
                Çözümler
              </Link>
              <span aria-hidden="true"> · </span>
              {SOLUTION_GROUP_LABELS[solution.group]}
            </p>
            <p className="mt-4 text-[0.9375rem] font-semibold text-ink-soft">{solution.name}</p>
            <h1 className="mt-1 text-[2rem] font-semibold leading-[1.12] tracking-[-0.03em] sm:text-[2.625rem]">{solution.headline}</h1>
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-soft">{solution.lead}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Suspense fallback={<span className={`${CTA_PRIMARY} opacity-60`}>{solution.targetLabel}</span>}>
                <DemoLink solution={solution} />
              </Suspense>
              <Link href="/cozumler" className={CTA_SECONDARY}>
                Tüm çözümler
              </Link>
            </div>
            <p className="mt-4 text-[0.8125rem] text-ink-muted">Sağdaki örnek ekran görüntüsü değildir; demo projesinin şu anki verisiyle çizilir.</p>
          </div>
          <div className="min-w-0">
            <Suspense fallback={<PreviewSkeleton />}>
              <SolutionPreview demo={solution.demo} kind={solution.preview} />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-paper py-14 sm:py-16">
        <div className={SECTION}>
          <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em]">Yankı bunu nasıl yapar</h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {solution.steps.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-line bg-surface p-6">
                <span className="reading flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[0.875rem] font-semibold text-[var(--on-brand)]" aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-[1.0625rem] font-semibold">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className={SECTION}>
          <h2 className="text-[1.25rem] font-semibold tracking-[-0.015em]">Diğer çözümler</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.slice(0, 3).map((entry) => (
              <li key={entry.slug}>
                <Link href={solutionHref(entry.slug)} className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-brand">
                  <span className="font-semibold">{entry.name}</span>
                  <span className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">{entry.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </SiteFrame>
  );
}
