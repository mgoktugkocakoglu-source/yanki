import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

/*
 * Yazı tipleri derleme sırasında indirilir ve uygulamayla birlikte sunulur;
 * çalışırken dış sunucuya istek gitmez (kurum içi kurulum için önemlidir).
 */
const sans = Inter({
  variable: "--font-sans-face",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Yankı", template: "%s · Yankı" },
  description: "Gündem tarama, medya izleme ve sosyal dinleme platformu.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${sans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper text-ink">
        <a
          href="#icerik"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop"
        >
          İçeriğe geç
        </a>
        {children}
      </body>
    </html>
  );
}
