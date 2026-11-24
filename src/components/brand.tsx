/**
 * Marka işaretleri. Logo, mavi bir kare içinde beyaz "Y" ve kollarının
 * arasındaki safran noktadır: yayın yapan bir anten. İçeriklerdeki erişim
 * göstergesi (EchoGlyph) ise kaynak noktası ve sönümlenen halkalardır.
 * Logonun dosya hâlleri `public/marka/` altındadır.
 */

interface LogoProps {
  className?: string;
}

/** Kare içinde "Y" anteni ve safran sinyal noktası. */
export function LogoMark({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true" fill="none">
      <rect width="28" height="28" rx="8" fill="var(--brand)" />
      <path d="M8 10.2 14 17.2 20 10.2M14 17.2V22.4" stroke="var(--on-brand)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14" cy="7.3" r="2.2" fill="var(--saffron)" />
    </svg>
  );
}

export function Logo({ className }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark className="h-7 w-7" />
      <span className="text-[1.25rem] font-bold leading-none tracking-[-0.03em] text-ink">Yankı</span>
    </span>
  );
}

export type EchoTone = "positive" | "negative" | "neutral" | "brand";

const TONE_COLOR: Record<EchoTone, string> = {
  positive: "var(--positive)",
  negative: "var(--negative)",
  neutral: "var(--neutral)",
  brand: "var(--brand)",
};

interface EchoGlyphProps {
  /** 0–4: yankının ne kadar uzağa taşındığı. */
  level: number;
  tone?: EchoTone;
  className?: string;
}

const ARCS = ["M8 6.4a5.1 5.1 0 0 1 0 7.2", "M11.2 4.3a8 8 0 0 1 0 11.4", "M14.4 2.4a10.8 10.8 0 0 1 0 15.2", "M17.6 0.8a13.4 13.4 0 0 1 0 18.4"];

/**
 * Yankı işareti: içeriğin erişim basamağını halka sayısıyla gösterir.
 * Dolu halkalar ulaşılan basamak, soluk halkalar ulaşılmayandır; renk tek
 * başına bilgi taşımaz, yanında her zaman sayı ya da etiket bulunur.
 */
export function EchoGlyph({ level, tone = "brand", className }: EchoGlyphProps) {
  const color = TONE_COLOR[tone];
  return (
    <svg viewBox="0 0 22 20" className={className} aria-hidden="true" fill="none">
      <circle cx="3.6" cy="10" r="2.4" fill={color} />
      {ARCS.map((path, index) => (
        <path key={path} d={path} stroke={index < level ? color : "var(--line-strong)"} strokeWidth="1.7" strokeLinecap="round" />
      ))}
    </svg>
  );
}

const REACH_STEPS = [1_000, 10_000, 50_000, 250_000];

/** Erişim tabanını 0–4 basamağa indirir: <1 B, 1–10 B, 10–50 B, 50–250 B, 250 B+. */
export function reachLevel(reach: number | null): number {
  if (reach === null) return 0;
  return REACH_STEPS.filter((step) => reach >= step).length;
}
