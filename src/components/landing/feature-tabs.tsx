"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * Tanıtım sayfasındaki sekmeli özellik vitrini. Sekme içerikleri sunucuda
 * çizilir ve hazır gelir; bu bileşen yalnızca hangisinin göründüğünü yönetir.
 */

export interface FeatureTab {
  key: string;
  label: string;
  title: string;
  description: string;
  points: string[];
  /** Sağ tarafta gösterilen, gerçek bileşenlerden kurulu örnek. */
  panel: ReactNode;
}

export function FeatureTabs({ tabs }: { tabs: FeatureTab[] }) {
  const [active, setActive] = useState(0);
  const baseId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (active + step + tabs.length) % tabs.length;
    setActive(next);
    document.getElementById(`${baseId}-sekme-${next}`)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Ürün özellikleri" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={`${baseId}-sekme-${index}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls={`${baseId}-pano-${index}`}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={onKeyDown}
            className={`h-10 flex-1 whitespace-nowrap rounded-lg px-4 text-[0.875rem] font-semibold transition-colors ${
              index === active ? "bg-brand text-[var(--on-brand)]" : "text-ink-soft hover:bg-sunken hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.key}
          id={`${baseId}-pano-${index}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-sekme-${index}`}
          hidden={index !== active}
          className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
        >
          <div>
            <h3 className="text-[1.375rem] font-semibold leading-snug tracking-[-0.02em]">{tab.title}</h3>
            <p className="mt-3 text-[1rem] leading-relaxed text-ink-soft">{tab.description}</p>
            <ul className="mt-5 flex flex-col gap-2.5">
              {tab.points.map((point) => (
                <li key={point} className="flex gap-2.5 text-ink-soft">
                  <span aria-hidden="true" className="mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">{tab.panel}</div>
        </div>
      ))}
    </div>
  );
}
