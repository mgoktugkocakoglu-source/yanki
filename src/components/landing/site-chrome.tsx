import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { SOLUTION_GROUP_LABELS, SOLUTION_GROUPS, solutionHref, solutionsIn } from "@/domain/solutions";

/** Tanıtım sitesinin ortak çerçevesi: üst menü, alt bilgi ve yinelenen biçimler. */

export const CTA_PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-[0.9375rem] font-semibold text-[var(--on-brand)] transition-colors hover:bg-brand-strong";
export const CTA_SECONDARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-5 text-[0.9375rem] font-semibold text-ink transition-colors hover:border-ink-muted";
export const SECTION = "mx-auto max-w-[1200px] px-4 sm:px-8";
export const EYEBROW = "text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-brand-strong";
export const SECTION_TITLE = "mt-2 max-w-[26ch] text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.125rem]";

const NAV_ITEM = "rounded-md px-3 py-2 text-[0.9375rem] font-medium text-ink-soft hover:bg-sunken hover:text-ink";

/** Ana sayfanın bölümleri; diğer sayfalardan da çalışsın diye kökten başlar. */
const PAGE_LINKS = [
  { href: "/#urun", label: "Ürün" },
  { href: "/#nasil", label: "Nasıl çalışır" },
  { href: "/#kaynaklar", label: "Kaynaklar" },
  { href: "/#sss", label: "SSS" },
];

function SolutionsMenu() {
  return (
    <details className="group relative">
      <summary className={`${NAV_ITEM} flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden`}>
        Çözümler
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="absolute left-0 top-full z-50 mt-2 grid w-[40rem] grid-cols-2 gap-x-6 gap-y-1 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-preview)]">
        {SOLUTION_GROUPS.map((group) => (
          <div key={group}>
            <p className="px-2.5 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">{SOLUTION_GROUP_LABELS[group]}</p>
            <ul>
              {solutionsIn(group).map((solution) => (
                <li key={solution.slug}>
                  <Link href={solutionHref(solution.slug)} className="block rounded-lg px-2.5 py-2 hover:bg-sunken">
                    <span className="block text-[0.9375rem] font-semibold">{solution.name}</span>
                    <span className="block text-[0.8125rem] leading-snug text-ink-muted">{solution.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <Link href="/cozumler" className="col-span-2 mt-2 inline-flex items-center gap-1 border-t border-line px-2.5 pt-3 text-[0.875rem] font-semibold text-brand-strong hover:underline">
          Tüm çözümler
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </details>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className={`${SECTION} flex h-16 items-center gap-4 sm:gap-8`}>
        <Link href="/" aria-label="Yankı ana sayfa" className="rounded">
          <Logo />
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 lg:flex">
          <Link href={PAGE_LINKS[0].href} className={NAV_ITEM}>
            {PAGE_LINKS[0].label}
          </Link>
          <SolutionsMenu />
          {PAGE_LINKS.slice(1).map((link) => (
            <Link key={link.href} href={link.href} className={NAV_ITEM}>
              {link.label}
            </Link>
          ))}
        </nav>
        {/* Dar ekranda açılır menü yerine çözümler dizinine giden tek bağlantı. */}
        <Link href="/cozumler" className={`${NAV_ITEM} ml-auto lg:hidden`}>
          Çözümler
        </Link>
        <Link href="/panel" className={`${CTA_PRIMARY} h-10 px-4 lg:ml-auto`}>
          <span className="sm:hidden">Demo</span>
          <span className="hidden sm:inline">Demoyu incele</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">{title}</p>
      <ul className="mt-3 flex flex-col gap-2 text-[0.9375rem]">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-ink-soft hover:text-ink hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className={`${SECTION} grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <Logo />
          <p className="mt-3 max-w-[30ch] text-[0.875rem] text-ink-soft">Gündem tarama, medya izleme ve sosyal dinleme platformu.</p>
        </div>
        {SOLUTION_GROUPS.map((group) => (
          <FooterColumn key={group} title={SOLUTION_GROUP_LABELS[group]} links={solutionsIn(group).map((solution) => ({ href: solutionHref(solution.slug), label: solution.name }))} />
        ))}
        <FooterColumn
          title="Ürün"
          links={[
            ...PAGE_LINKS,
            { href: "/panel", label: "Demo paneli" },
            { href: "/projeler/yeni", label: "Yeni proje" },
          ]}
        />
      </div>
      <p className={`${SECTION} border-t border-line py-5 text-[0.8125rem] text-ink-muted`}>Panelde gösterilen içerikler bağlı kaynaklardan toplanmış gerçek haber ve paylaşımlardır.</p>
    </footer>
  );
}

/** Tanıtım sayfalarının dış kabuğu: atlama bağlantısı, üst menü, içerik, alt bilgi. */
export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface">
      <a href="#icerik" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        İçeriğe geç
      </a>
      <SiteHeader />
      <main id="icerik">{children}</main>
      <SiteFooter />
    </div>
  );
}
