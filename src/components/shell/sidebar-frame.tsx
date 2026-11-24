"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useId, useState, type ReactNode } from "react";

/**
 * Yan menünün çerçevesi. Geniş ekranda kalıcı bir sütundur; dar ekranda üstte
 * "Menü" düğmesiyle açılan bir çekmeceye dönüşür. Çekmece, açıldığı sayfadan
 * ayrılınca kendiliğinden kapanır.
 */

interface SidebarFrameProps {
  /** Dar ekrandaki üst çubukta ve menünün başında görünen marka bağlantısı. */
  brand: ReactNode;
  children: ReactNode;
}

export function SidebarFrame({ brand, children }: SidebarFrameProps) {
  const pathname = usePathname();
  // Açık durum, açıldığı yolla birlikte tutulur: yol değişince menü kapanmış sayılır.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const menuId = useId();

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        {brand}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpenedAt(pathname)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong px-3 text-[0.875rem] font-semibold"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
          Menü
        </button>
      </div>

      {open ? <button type="button" aria-label="Menüyü kapat" onClick={() => setOpenedAt(null)} className="fixed inset-0 z-40 bg-ink/40 lg:hidden" /> : null}

      <aside
        id={menuId}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpenedAt(null);
        }}
        className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-r border-line bg-surface transition-[transform,visibility] duration-200 lg:visible lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-60 lg:max-w-none lg:shrink-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-4">
          {brand}
          <button
            type="button"
            onClick={() => setOpenedAt(null)}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[0.8125rem] font-medium text-ink-soft hover:bg-sunken hover:text-ink lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Kapat
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
