"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { DEFAULT_RANGE, isRangeKey, RANGE_PRESETS, type RangeKey } from "@/lib/time";

/** Üst şeritteki etkileşimli denetimler: sekmeler, dönem seçici, proje ve çalışma alanı değiştirici. */

export interface NavItem {
  href: string;
  label: string;
  /** Yan menüde etiketin önünde gösterilen simge. */
  icon?: ReactNode;
  /** Yol tam eşleşmeli mi (genel bakış) yoksa alt yolları da kapsar mı? */
  exact?: boolean;
}

function withRange(href: string, range: string | null): string {
  return range && range !== DEFAULT_RANGE ? `${href}?d=${range}` : href;
}

export function NavTabs({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const range = useSearchParams().get("d");

  return (
    <nav aria-label={label} className="flex items-stretch gap-0.5">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={withRange(item.href, range)}
            aria-current={active ? "page" : undefined}
            className={`relative whitespace-nowrap px-3 py-2.5 text-[0.875rem] font-medium transition-colors ${
              active ? "text-brand-strong" : "text-ink-soft hover:text-ink"
            }`}
          >
            {item.label}
            {active ? <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" aria-hidden="true" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Yan menü: geniş ekranda dikey liste, dar ekranda yatay kaydırılan şerit. */
export function SideNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const range = useSearchParams().get("d");

  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={withRange(item.href, range)}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[0.875rem] font-medium transition-colors ${
              active ? "bg-brand-wash text-brand-strong" : "text-ink-soft hover:bg-sunken hover:text-ink"
            }`}
          >
            <span className={`shrink-0 ${active ? "text-brand" : "text-ink-muted"}`} aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

const RANGE_KEYS = Object.keys(RANGE_PRESETS) as RangeKey[];

/** Dönem seçici: seçim adres çubuğunda tutulur, bağlantı paylaşılabilir kalır. */
export function RangePicker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("d");
  const selected: RangeKey = isRangeKey(current) ? current : DEFAULT_RANGE;

  const hrefFor = (key: RangeKey) => {
    const params = new URLSearchParams(searchParams);
    params.set("d", key);
    // Dönem değişince sayfalama ve kova seçimi anlamını yitirir.
    params.delete("sayfa");
    params.delete("bas");
    params.delete("bit");
    return `${pathname}?${params}`;
  };

  return (
    <div role="group" aria-label="Dönem" className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
      {RANGE_KEYS.map((key) => (
        <Link
          key={key}
          href={hrefFor(key)}
          aria-current={key === selected ? "true" : undefined}
          title={RANGE_PRESETS[key].label}
          className={`rounded px-2.5 py-1 text-[0.8125rem] font-medium transition-colors ${
            key === selected ? "bg-surface text-brand-strong shadow-[0_0_0_1px_var(--line)]" : "text-ink-soft hover:text-ink"
          }`}
        >
          {RANGE_PRESETS[key].shortLabel}
        </Link>
      ))}
    </div>
  );
}

const SELECT_CLASS =
  "h-9 w-full cursor-pointer truncate rounded-lg border border-line bg-surface py-0 pl-2.5 pr-7 text-[0.875rem] font-medium text-ink hover:border-line-strong";

interface Option {
  id: string;
  name: string;
}

/** Proje değiştirici: açık olan sekmeyi koruyarak diğer projeye geçer. */
export function ProjectSwitcher({ projects, currentId }: { projects: Option[]; currentId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const go = (id: string) => {
    const base = `/proje/${id}`;
    const inProject = currentId !== null && pathname.startsWith(`/proje/${currentId}`);
    const target = inProject ? pathname.replace(`/proje/${currentId}`, base) : base;
    startTransition(() => router.push(withRange(target, searchParams.get("d"))));
  };

  if (projects.length === 0) return <span className="text-[0.875rem] text-ink-muted">Henüz proje yok</span>;

  return (
    <label className="block">
      <span className="sr-only">Proje</span>
      <select
        className={`${SELECT_CLASS} ${pending ? "opacity-60" : ""}`}
        value={currentId ?? ""}
        onChange={(event) => go(event.target.value)}
      >
        {currentId === null ? <option value="">Proje seçin</option> : null}
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Çalışma alanı değiştirici: seçim sunucuda çereze yazılır. */
export function WorkspaceSwitcher({
  workspaces,
  currentId,
  action,
}: {
  workspaces: Option[];
  currentId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action}>
      <label className="block">
        <span className="sr-only">Çalışma alanı</span>
        <select
          name="workspaceId"
          className={SELECT_CLASS}
          defaultValue={currentId}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
