import { BarChart3, Bell, Building2, FileText, FolderKanban, GitCompareArrows, LayoutDashboard, LogOut, MessageSquareText, MonitorPlay, Newspaper, Radio, ScrollText, Search, Settings, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ROLE_LABELS, type Permission, type UserRole } from "@/domain/permissions";
import type { Project, Workspace } from "@/domain/types";
import { selectWorkspaceAction } from "@/server/actions/workspace";
import { logoutAction } from "@/server/actions/auth";
import { Logo } from "../brand";
import { ProjectSwitcher, RangePicker, SideNav, WorkspaceSwitcher, type NavItem } from "./nav-controls";
import { SidebarFrame } from "./sidebar-frame";

/**
 * Uygulama kabuğu: solda kalıcı menü, üstte bağlam çubuğu, ortada içerik.
 * Menü iki gruptur: açık projenin bölümleri ve çalışma alanının bölümleri.
 * Dar ekranda menü, üstteki düğmeyle açılan bir çekmeceye dönüşür.
 */

interface AppShellProps {
  workspace: Workspace;
  workspaces: Workspace[];
  projects: Project[];
  /** Açık olan proje; çalışma alanı sayfalarında null. */
  project: Project | null;
  /** Oturumdaki kullanıcı; giriş zorunlu değilse null. */
  viewer: { name: string; email: string; role: UserRole; credits: number; permissions: readonly Permission[] } | null;
  children: ReactNode;
}

const ICON = "h-[1.125rem] w-[1.125rem]";

function projectItems(project: Project): NavItem[] {
  const base = `/proje/${project.id}`;
  return [
    { href: base, label: "Genel Bakış", exact: true, icon: <LayoutDashboard className={ICON} /> },
    { href: `${base}/bahsetmeler`, label: "Bahsedilmeler", icon: <MessageSquareText className={ICON} /> },
    { href: `${base}/analiz`, label: "Analizler", icon: <BarChart3 className={ICON} /> },
    { href: `${base}/uyarilar`, label: "Uyarılar", icon: <Bell className={ICON} /> },
    { href: `${base}/iddialar`, label: "İddialar", icon: <ShieldAlert className={ICON} /> },
    { href: `${base}/rapor`, label: "Rapor", icon: <FileText className={ICON} /> },
    { href: `${base}/kaynaklar`, label: "Kaynaklar", icon: <Radio className={ICON} /> },
  ];
}

const WORKSPACE_ITEMS: NavItem[] = [
  { href: "/ara", label: "Arama", icon: <Search className={ICON} /> },
  { href: "/karsilastirma", label: "Rakipler", icon: <GitCompareArrows className={ICON} /> },
  { href: "/projeler", label: "Projeler", icon: <FolderKanban className={ICON} /> },
];

const AUDIT_ITEM: NavItem = { href: "/denetim", label: "Denetim izi", icon: <ScrollText className={ICON} /> };
const SYSTEM_ITEM: NavItem = { href: "/sistem", label: "Sistem yönetimi", icon: <ShieldCheck className={ICON} /> };
const NEWS_ITEM: NavItem = { href: "/sistem/haber-arsivi", label: "Haber arşivi", icon: <Newspaper className={ICON} /> };
const ORG_ITEM: NavItem = { href: "/yonetim", label: "Kurum yönetimi", icon: <Building2 className={ICON} /> };

/** Yönetim grubu role göre kurulur; kullanıcıda boştur. Erişimi asıl denetleyen sayfaların kendisidir. */
function managementItems(viewer: AppShellProps["viewer"]): NavItem[] {
  if (viewer === null || viewer.role === "sysadmin") return [SYSTEM_ITEM, NEWS_ITEM, AUDIT_ITEM];
  if (viewer.role === "admin") return viewer.permissions.includes("audit.view") ? [ORG_ITEM, AUDIT_ITEM] : [ORG_ITEM];
  return [];
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 px-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">{children}</p>;
}

export function AppShell({ workspace, workspaces, projects, project, viewer, children }: AppShellProps) {
  // Çalışma alanı sayfalarında proje bölümleri ilk projeye götürür.
  const navProject = project ?? projects[0] ?? null;
  const management = managementItems(viewer);

  return (
    <div className="min-h-screen lg:flex">
      <SidebarFrame
        brand={
          <Link href="/panel" aria-label="Yankı paneli" className="rounded">
            <Logo />
          </Link>
        }
      >
        <Suspense fallback={<div className="h-24" />}>
          <div className="grid gap-2 px-3 pt-3">
            <WorkspaceSwitcher workspaces={workspaces} currentId={workspace.id} action={selectWorkspaceAction} />
            <ProjectSwitcher projects={projects} currentId={project?.id ?? null} />
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-3 pt-5">
            {navProject ? (
              <div>
                <GroupLabel>Proje</GroupLabel>
                <SideNav items={projectItems(navProject)} label="Proje bölümleri" />
              </div>
            ) : null}
            <div>
              <GroupLabel>Çalışma alanı</GroupLabel>
              <SideNav items={WORKSPACE_ITEMS} label="Çalışma alanı bölümleri" />
            </div>
            {management.length > 0 ? (
              <div>
                <GroupLabel>Yönetim</GroupLabel>
                <SideNav items={management} label="Yönetim bölümleri" />
              </div>
            ) : null}
          </div>
        </Suspense>

        {navProject ? (
          <div className="border-t border-line p-3">
            <Suspense fallback={null}>
              <SideNav items={[{ href: `/proje/${navProject.id}/ayarlar`, label: "Ayarlar", icon: <Settings className={ICON} /> }]} label="Proje ayarları" />
            </Suspense>
            <Link
              href={`/komuta/${navProject.id}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.875rem] font-medium text-ink-soft hover:bg-sunken hover:text-ink"
            >
              <MonitorPlay className={`${ICON} text-ink-muted`} aria-hidden="true" />
              Komuta merkezi
            </Link>
          </div>
        ) : null}
        {viewer ? (
          <div className="border-t border-line p-3">
            <Link href="/hesabim" className="block rounded-lg px-2.5 py-1.5 hover:bg-sunken" title={`${viewer.email} · Hesabım`}>
              <span className="block truncate text-[0.875rem] font-medium">{viewer.name}</span>
              <span className="block text-[0.75rem] text-ink-muted">
                {ROLE_LABELS[viewer.role]}
                {viewer.role === "sysadmin" ? null : (
                  <>
                    {" · "}
                    <span className="reading font-medium text-ink-soft">{viewer.credits}</span> kredi
                  </>
                )}
              </span>
            </Link>
            <form action={logoutAction} className="mt-1">
              <button type="submit" className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.875rem] font-medium text-ink-soft hover:bg-sunken hover:text-ink">
                <LogOut className={`${ICON} text-ink-muted`} aria-hidden="true" />
                Çıkış yap
              </button>
            </form>
          </div>
        ) : null}
      </SidebarFrame>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface/90 px-4 py-2 backdrop-blur sm:px-8">
          <p className="min-w-0 truncate text-[0.9375rem] font-semibold">{project?.name ?? workspace.name}</p>
          <div className="ml-auto">
            <Suspense fallback={null}>
              <RangePicker />
            </Suspense>
          </div>
        </header>
        <main id="icerik">{children}</main>
      </div>
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-line bg-surface px-4 py-3 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r lg:py-4">
        <Logo />
        <div className="skeleton mt-5 hidden h-9 lg:block" />
        <div className="skeleton mt-2 hidden h-9 lg:block" />
      </aside>
      <div className="flex-1">
        <div className="h-14 border-b border-line bg-surface" />
      </div>
    </div>
  );
}
