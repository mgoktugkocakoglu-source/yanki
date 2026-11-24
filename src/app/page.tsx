import { ArrowRight, BellRing, Database, FileDown, Filter, Radio, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AnomalyCard } from "@/components/anomaly-card";
import { Briefing } from "@/components/briefing";
import { RankedBars, ToneBar } from "@/components/charts/bars";
import { VolumeChart } from "@/components/charts/volume-chart";
import { FeatureTabs, type FeatureTab } from "@/components/landing/feature-tabs";
import { loadShowcase, PreviewCard, PreviewFrame, PreviewSkeleton } from "@/components/landing/showcase";
import { CTA_PRIMARY, CTA_SECONDARY, EYEBROW, SECTION, SECTION_TITLE, SiteFrame } from "@/components/landing/site-chrome";
import { Highlighted } from "@/components/mentions/highlight";
import { MentionCard } from "@/components/mentions/mention-card";
import { ToneLegend } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { mentionsHref, projectHref } from "@/lib/links";
import { tryParseQuery } from "@/lib/query";
import { isConnectorUsable, listConnectors, PLANNED_SOURCES } from "@/server/collectors/registry";
import { requestStart } from "@/server/context";

export const metadata: Metadata = {
  title: "Yankı — Gündem tarama ve sosyal dinleme",
  description: "Gündemde ne konuşulduğunu tek yerden izleyin, nedenini anlayın, zamanında harekete geçin.",
};

/*
 * Tanıtım sayfası. Buradaki her önizleme panelin kendi bileşenleriyle ve demo
 * çalışma alanının verisiyle çizilir; ekran görüntüsü ya da elle yazılmış
 * sayı yoktur. Müşteri logosu, kullanıcı sayısı, başarı oranı gibi
 * doğrulanamayan kanıtlar bilerek yer almaz.
 */

/** Kahraman bölümündeki pano: panelin Genel Bakış ekranının küçük bir kesiti. */
async function HeroPreview() {
  const showcase = await loadShowcase();
  if (!showcase) return null;
  const { project, overview, queries, topicNames, now } = showcase;
  const listHref = projectHref(project.id, "bahsetmeler");

  return (
    <PreviewFrame title={project.name}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          {overview.highlights.slice(0, 2).map((mention) => (
            <MentionCard key={mention.id} mention={mention} queries={queries} topicNames={topicNames} now={now} editable={false} />
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <PreviewCard title="Zaman içinde bahsedilmeler" aside={<ToneLegend />}>
            <VolumeChart
              points={overview.series}
              bucket={overview.bucket}
              markers={overview.anomalies.map((anomaly) => ({ bucketStart: anomaly.bucketStart, level: anomaly.level }))}
              mentionsHref={listHref}
              height={180}
            />
          </PreviewCard>
          <PreviewCard title="Dönemin özeti" aside="ölçümlerden hesaplanır">
            <Briefing sentences={overview.briefing} projectId={project.id} rangeKey={overview.rangeKey} selectedRange={overview.range} />
          </PreviewCard>
        </div>
      </div>
    </PreviewFrame>
  );
}

/** Sekmeli vitrin: her sekme panelin gerçek bir bileşenini gösterir. */
async function Showcase() {
  const showcase = await loadShowcase();
  if (!showcase) return null;
  const { project, overview, queries, topicNames, now } = showcase;
  const listHref = projectHref(project.id, "bahsetmeler");
  const lead = overview.explained[0];
  const topicRows = overview.topics
    .filter((topic) => topic.total > 0)
    .slice(0, 5)
    .map((topic) => ({ key: topic.id, label: topic.name, total: topic.total, positive: topic.positive, negative: topic.negative, neutral: topic.neutral }));

  const tabs: FeatureTab[] = [
    {
      key: "dinleme",
      label: "Dinleme",
      title: "Aradığınızı tam olarak tarif edin",
      description: "Arama dili VE, VEYA, DEĞİL ve YAKIN işleçlerini, tırnaklı ifadeleri ve alan süzgeçlerini destekler; Türkçe çekim eklerini kendisi tanır.",
      points: ["“seçim” yazdığınızda “seçimler”, “seçimde”, “seçimin” de eşleşir", "Kaynak, ton, niyet ve konu süzgeçleri aynı satırda", "Eşleşen kelime her içerikte işaretlenir"],
      panel: (
        <PreviewFrame title={project.name}>
          <div className="flex flex-col gap-3">
            <PreviewCard title="Proje sorgusu">
              <p className="reading break-words text-[0.8125rem] leading-relaxed text-ink-soft">{project.query}</p>
            </PreviewCard>
            {overview.highlights.slice(2, 3).map((mention) => (
              <MentionCard key={mention.id} mention={mention} queries={queries} topicNames={topicNames} now={now} editable={false} />
            ))}
          </div>
        </PreviewFrame>
      ),
    },
    {
      key: "anomali",
      label: "Kriz ve anomali",
      title: "Sıçramayı nedeniyle birlikte görün",
      description: "Hacim ya da olumsuz içerik payı olağan düzeyin dışına çıktığında Yankı bunu işaretler ve hangi konu, kaynak ve başlığın öne çıktığını gösterir.",
      points: ["Eşik, projenin kendi geçmişinden hesaplanır", "Kapsamın eksik olduğu günler yanlış alarm üretmez", "Açıklama bir ilişki gösterir; nedensellik iddia etmez"],
      panel: (
        <PreviewFrame title={project.name}>
          {lead ? (
            <AnomalyCard anomaly={lead} mentionsHref={listHref} />
          ) : (
            <p className="rounded-xl border border-line bg-surface p-4 text-ink-soft">Demo projesinde bu dönem olağan dışı bir hareket yok.</p>
          )}
        </PreviewFrame>
      ),
    },
    {
      key: "ton",
      label: "Ton ve rakipler",
      title: "Ne konuşuluyor, nasıl konuşuluyor",
      description: "Her içerik olumlu, olumsuz ya da nötr olarak etiketlenir; konulara ve rakip projelere göre karşılaştırılır.",
      points: ["Ton, renkle birlikte işaret ve yazıyla gösterilir", "Yanlış etiketi tek tıkla düzeltirsiniz; düzeltilen içerik işaretli kalır", "Rakipler ekranı projeleri aynı ölçekte yan yana koyar"],
      panel: (
        <PreviewFrame title={project.name}>
          <div className="flex flex-col gap-3">
            <PreviewCard title="Duygu dağılımı">
              <ToneBar values={overview.summary} mentionsHref={mentionsHref(project.id, { rangeKey: overview.rangeKey })} />
            </PreviewCard>
            <PreviewCard title="Konular">
              <RankedBars rows={topicRows} splitByTone caption="Konulara göre bahsedilme sayısı ve ton" labelHeader="Konu" />
            </PreviewCard>
          </div>
        </PreviewFrame>
      ),
    },
    {
      key: "ozet",
      label: "Özet ve dışa aktarma",
      title: "Dönemi dört cümlede okuyun",
      description: "Dönem özeti ekrandaki ölçümlerden kurulur; her sayı kendi kanıtına bağlanır. Listeyi olduğu gibi CSV olarak indirebilirsiniz.",
      points: ["Dönemin özeti ölçümlerden hesaplanır; dil modeli çıktısı değildir", "Her sayıya tıklayınca onu oluşturan içerikler açılır", "Süzülmüş liste CSV olarak dışa aktarılır"],
      panel: (
        <PreviewFrame title={project.name}>
          <PreviewCard title="Dönemin özeti" aside="ölçümlerden hesaplanır">
            <Briefing sentences={overview.briefing} projectId={project.id} rangeKey={overview.rangeKey} selectedRange={overview.range} />
          </PreviewCard>
        </PreviewFrame>
      ),
    },
  ];

  return <FeatureTabs tabs={tabs} />;
}

function BentoCard({ icon, title, children, demo, className }: { icon: ReactNode; title: string; children: ReactNode; demo: ReactNode; className?: string }) {
  return (
    <article className={`flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] ${className ?? ""}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-wash text-brand-strong" aria-hidden="true">
        {icon}
      </span>
      <h3 className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mt-1.5 text-ink-soft">{children}</p>
      <div className="mt-5 flex-1 rounded-xl border border-line bg-paper p-4">{demo}</div>
    </article>
  );
}

const INFLECTION_SAMPLE = "Seçimler yaklaşırken seçimde öne çıkan başlıklar ve seçimin olası sonuçları tartışılıyor.";

function InflectionDemo() {
  const parsed = tryParseQuery("seçim");
  return (
    <div>
      <p className="text-[0.75rem] text-ink-muted">
        Sorgu: <span className="reading text-ink">seçim</span>
      </p>
      <p className="mt-2 leading-relaxed">
        <Highlighted text={INFLECTION_SAMPLE} queries={parsed.ok ? [parsed.ast] : []} />
      </p>
    </div>
  );
}

/** Kaynak kapsamı: bağlayıcı kaydının doğrudan yansıması. */
async function SourceCoverage() {
  await requestStart();
  const connectors = listConnectors();
  return (
    <ul className="flex flex-col gap-2 text-[0.875rem]">
      {connectors.map((connector) => {
        const usable = isConnectorUsable(connector);
        return (
          <li key={connector.descriptor.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-medium">{connector.descriptor.name}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.75rem] font-semibold ${usable ? "bg-positive-wash text-positive-ink" : "bg-sunken text-ink-soft"}`}>
              {usable ? "✓ bağlı" : connector.descriptor.requiredSetting ? "anahtar bekliyor" : "bu kurulumda kapalı"}
            </span>
          </li>
        );
      })}
      <li className="mt-1 border-t border-line pt-2 text-[0.8125rem] text-ink-muted">
        {PLANNED_SOURCES.map((source) => source.name).join(", ")}: planlanan; koşulları Kaynaklar ekranında yazılı.
      </li>
    </ul>
  );
}

const FLOW_STEPS = [
  { icon: Radio, title: "Topla", text: "Bağlı kaynaklar belirlediğiniz aralıkla taranır." },
  { icon: Filter, title: "Eşleştir", text: "İçerik proje sorgusundan geçer; yinelenenler birleştirilir." },
  { icon: ScanSearch, title: "Çözümle", text: "Ton, duygu, niyet ve konu etiketlenir." },
  { icon: BellRing, title: "Uyar", text: "Olağan dışı hareket, nedeniyle birlikte işaretlenir." },
];

const STEPS = [
  { step: "1", title: "İzle", text: "Bir konu, kurum ya da marka için anahtar kelimelerinizi yazın. Yankı bağlı kaynakları düzenli tarar ve eşleşenleri tek listede toplar." },
  { step: "2", title: "Anla", text: "Hacim, ton, konular ve en çok yayılan hikâyeler aynı ekranda. Bir sıçrama olduğunda hangi konu ve kaynağın öne çıktığını görürsünüz." },
  { step: "3", title: "Harekete geç", text: "Uyarıyı açın, ilgili içeriklere inin, yanlış etiketi düzeltin, listeyi dışa aktarın. Proje ve sorgu değişiklikleri ile dışa aktarmalar denetim izine yazılır." },
];

const FAQ = [
  {
    question: "Demodaki veriler gerçek mi?",
    answer:
      "Hayır. Demo çalışma alanlarındaki kurumlar, kişiler ve içerikler kurgusaldır ve her ekranda “Demo” etiketiyle işaretlidir. Gerçek veri, canlı çalışma alanında bağlı kaynaklardan toplanır.",
  },
  {
    question: "X, YouTube ve TikTok'tan veri çekiyor mu?",
    answer:
      "X ve YouTube bağlayıcıları hazırdır; çalışmaları için kendi API anahtarınızı tanımlamanız gerekir (X ücretlidir). TikTok, Instagram ve Reddit için ticari kullanıma açık bir arama erişimi olmadığından bu kaynaklar “planlanan” olarak listelenir. Yankı, kullanım koşullarını çiğneyen kazıma yapmaz.",
  },
  {
    question: "Duygu analizi nasıl yapılıyor?",
    answer:
      "Türkçe için hazırlanmış sözlük ve kural tabanlı bir çözümleyiciyle. Varsayılan olarak dil modeli kullanılmaz; bu yüzden sonuç açıklanabilir ve içerik kurum dışına çıkmaz. Dil modeliyle özet ve sınıflandırma isteğe bağlıdır, anahtar girilmeden kapalıdır ve yalnızca siz başlattığınızda çalışır. Yanlış bulduğunuz etiketi düzeltebilirsiniz.",
  },
  {
    question: "Verilerim nerede duruyor?",
    answer: "Kurulumun yapıldığı makinede, tek bir veritabanı dosyasında. Uygulama yalnızca içerik topladığı kaynaklara istek gönderir.",
  },
  {
    question: "Kişileri izlemek için kullanılabilir mi?",
    answer: "Hayır. Yankı kamuya açık içeriği konu, kurum ve marka düzeyinde çözümler; kişi dosyası çıkarmaz, hesapları platformlar arasında eşleştirmez.",
  },
];

export default function LandingPage() {
  return (
    <SiteFrame>
        {/* Kahraman */}
        <section className="bg-[radial-gradient(60rem_28rem_at_50%_-8rem,var(--brand-wash),transparent)]">
          <div className={`${SECTION} pb-16 pt-14 sm:pt-20`}>
            <div className="mx-auto max-w-[46rem] text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[0.8125rem] font-semibold text-ink-soft">
                <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                Gündem tarama ve sosyal dinleme platformu
              </p>
              <h1 className="mt-5 text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[3.5rem]">Gündemde ne konuşuluyor, tek yerden anlayın.</h1>
              <p className="mx-auto mt-5 max-w-[38rem] text-[1.0625rem] leading-relaxed text-ink-soft sm:text-[1.125rem]">
                Yankı; haberleri, sosyal ağları ve video platformlarını anahtar kelimelerinizle tarar, konuşmanın tonunu ve konusunu çıkarır, olağan dışı bir hareket olduğunda nedenini gösterir.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/panel" className={CTA_PRIMARY}>
                  Demoyu incele
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a href="#nasil" className={CTA_SECONDARY}>
                  Nasıl çalışır?
                </a>
              </div>
              <p className="mt-4 text-[0.8125rem] text-ink-muted">Kayıt gerekmez. Arama gerçek kaynakları tarar; örnek belediye alanı kurgusaldır.</p>
            </div>

            <div className="mt-12">
              <Suspense fallback={<PreviewSkeleton tall />}>
                <HeroPreview />
              </Suspense>
            </div>
          </div>
        </section>

        {/* İzle → Anla → Harekete geç */}
        <section id="nasil" className="scroll-mt-20 border-y border-line bg-paper py-16 sm:py-20">
          <div className={SECTION}>
            <p className={EYEBROW}>Nasıl çalışır</p>
            <h2 className={SECTION_TITLE}>İzle, anla, harekete geç.</h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map((item) => (
                <li key={item.step} className="rounded-2xl border border-line bg-surface p-6">
                  <span className="reading flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[0.875rem] font-semibold text-[var(--on-brand)]" aria-hidden="true">
                    {item.step}
                  </span>
                  <h3 className="mt-4 text-[1.125rem] font-semibold">{item.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-soft">{item.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Sekmeli vitrin */}
        <section id="urun" className="scroll-mt-20 py-16 sm:py-20">
          <div className={SECTION}>
            <p className={EYEBROW}>Ürün</p>
            <h2 className={SECTION_TITLE}>Panelin kendisinden dört kesit.</h2>
            <p className="mt-3 max-w-[60ch] text-[1rem] text-ink-soft">Aşağıdaki örnekler ekran görüntüsü değildir; demo projesinin şu anki verisiyle, panelde kullanılan bileşenlerle çizilir.</p>
            <div className="mt-8">
              <Suspense fallback={<PreviewSkeleton />}>
                <Showcase />
              </Suspense>
            </div>
          </div>
        </section>

        {/* Bento */}
        <section id="kaynaklar" className="scroll-mt-20 border-y border-line bg-paper py-16 sm:py-20">
          <div className={SECTION}>
            <p className={EYEBROW}>Temeller</p>
            <h2 className={SECTION_TITLE}>Güvenebileceğiniz bir ölçüm için.</h2>
            <div className="mt-10 grid gap-5 lg:grid-cols-6">
              <BentoCard className="lg:col-span-3" icon={<ScanSearch className="h-5 w-5" />} title="Türkçeyi bilen eşleşme" demo={<InflectionDemo />}>
                Çekim ekleri ve ünsüz yumuşaması tanınır; “Hatay” yazısı “hata” diye eşleşmez.
              </BentoCard>
              <BentoCard
                className="lg:col-span-3"
                icon={<Radio className="h-5 w-5" />}
                title="Kapsam açıkça yazılır"
                demo={
                  <Suspense fallback={<div className="skeleton h-32 rounded-lg" aria-hidden="true" />}>
                    <SourceCoverage />
                  </Suspense>
                }
              >
                Hangi kaynağın bağlı olduğu, hangisinin neyi beklediği gizlenmez. Erişimi olmayan kaynak canlıymış gibi gösterilmez.
              </BentoCard>
              <BentoCard
                className="lg:col-span-2"
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Her sayının tanımı var"
                demo={
                  <p className="text-[0.8125rem] leading-relaxed">
                    <span className="font-semibold">Net ton</span>
                    <span className="reading mt-1 block text-ink-soft">(olumlu − olumsuz) ÷ (olumlu + olumsuz) × 100</span>
                  </p>
                }
              >
                Bileşik ölçümlerin formülü ekranda durur. Kaynak bir ölçümü vermiyorsa alan boş kalır; tahmin, tahmin olarak etiketlenir.
              </BentoCard>
              <BentoCard
                className="lg:col-span-2"
                icon={<Database className="h-5 w-5" />}
                title="Kurum içinde çalışır"
                demo={<p className="reading text-[0.8125rem] leading-relaxed text-ink-soft">tek uygulama · tek veritabanı dosyası · dış bağımlılık yok</p>}
              >
                Veri kurulumun yapıldığı makinede kalır. Yazı tipleri dahil hiçbir şey çalışırken dış sunucudan yüklenmez.
              </BentoCard>
              <BentoCard
                className="lg:col-span-2"
                icon={<FileDown className="h-5 w-5" />}
                title="Denetlenebilir kayıt"
                demo={<p className="reading text-[0.8125rem] leading-relaxed text-ink-soft">proje oluşturuldu · sorgu güncellendi · proje silindi · dışa aktarıldı</p>}
              >
                Proje oluşturma, sorgu değişikliği, silme ve dışa aktarma denetim izine yazılır.
              </BentoCard>
            </div>
          </div>
        </section>

        {/* Koyu bölüm: işleyiş hattı */}
        <section className="bg-deep py-16 text-[var(--on-brand)] sm:py-20">
          <div className={SECTION}>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] opacity-70">Kriz kalkanı</p>
            <h2 className="mt-2 max-w-[24ch] text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.125rem]">İçerik kaynaktan uyarıya dört adımda ulaşır.</h2>
            <p className="mt-3 max-w-[60ch] text-[1rem] opacity-75">Hat aynı kurallarla hem toplarken hem ararken çalışır; ekranda gördüğünüz sayı ile listedeki içerik her zaman aynı süzgeçten geçer.</p>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FLOW_STEPS.map((step, index) => (
                <li key={step.title} className="relative rounded-2xl border border-[var(--on-brand)]/15 bg-[var(--on-brand)]/5 p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand" aria-hidden="true">
                      <step.icon className="h-5 w-5" />
                    </span>
                    <span className="reading text-[0.8125rem] opacity-60">
                      {index + 1} / {FLOW_STEPS.length}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[1.0625rem] font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-[0.9375rem] leading-relaxed opacity-75">{step.text}</p>
                </li>
              ))}
            </ol>
            <dl className="mt-10 grid gap-6 border-t border-[var(--on-brand)]/15 pt-8 sm:grid-cols-3">
              <div>
                <dt className="text-[0.875rem] opacity-70">Bağlayıcısı yazılmış kaynak</dt>
                <dd className="reading mt-1 text-[2rem] font-semibold tracking-[-0.02em]">{formatNumber(listConnectors().length)}</dd>
              </div>
              <div>
                <dt className="text-[0.875rem] opacity-70">Koşulu açıkça listelenen planlı kaynak</dt>
                <dd className="reading mt-1 text-[2rem] font-semibold tracking-[-0.02em]">{formatNumber(PLANNED_SOURCES.length)}</dd>
              </div>
              <div>
                <dt className="text-[0.875rem] opacity-70">Uydurulan ölçüm</dt>
                <dd className="reading mt-1 text-[2rem] font-semibold tracking-[-0.02em]">0</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* SSS */}
        <section id="sss" className="scroll-mt-20 py-16 sm:py-20">
          <div className={`${SECTION} grid gap-10 lg:grid-cols-[20rem_minmax(0,1fr)]`}>
            <div>
              <p className={EYEBROW}>SSS</p>
              <h2 className={SECTION_TITLE}>Sık sorulanlar</h2>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {FAQ.map((item) => (
                <details key={item.question} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded text-[1rem] font-semibold [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span aria-hidden="true" className="reading text-[1.25rem] leading-none text-ink-muted transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[68ch] leading-relaxed text-ink-soft">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Kapanış */}
        <section className="pb-20">
          <div className={SECTION}>
            <div className="rounded-3xl border border-line bg-brand-wash px-6 py-12 text-center sm:px-12">
              <h2 className="mx-auto max-w-[24ch] text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.125rem]">Paneli kendi gözünüzle görün.</h2>
              <p className="mx-auto mt-3 max-w-[52ch] text-[1rem] text-ink-soft">Bir konu yazın, bağlı kaynaklardan gerçek içerikler gelsin. Panelin tüm ekranlarını dolu görmek için kurgusal bir belediye örneği de hazır.</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link href="/panel" className={CTA_PRIMARY}>
                  Demoyu incele
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/projeler/yeni" className={CTA_SECONDARY}>
                  Kendi projeni kur
                </Link>
              </div>
            </div>
          </div>
        </section>
    </SiteFrame>
  );
}
