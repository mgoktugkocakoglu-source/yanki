import { CircleAlert, CircleCheck, CircleDashed, CircleMinus, Clock, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectButton } from "@/components/forms/collect-button";
import { PageContainer, PageHeading, Panel, Tag } from "@/components/ui";
import { RUN_STATUS_LABELS, SOURCE_TYPE_LABELS } from "@/domain/labels";
import type { CollectionRun, RunStatus } from "@/domain/types";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { getConnector, isConnectorAllowed, PLANNED_SOURCES } from "@/server/collectors/registry";
import type { ConnectorDescriptor } from "@/server/collectors/types";
import { config } from "@/server/config";
import { loadProjectContext, readString } from "@/server/context";
import { latestRunPerConnector, listRuns } from "@/server/repositories/runs";

export const metadata: Metadata = { title: "Kaynaklar" };

/**
 * Kapsam ekranı: hangi kaynak bağlı, en son ne zaman çalıştı, ne getirdi.
 * "Sıfır içerik" ile "kaynağa ulaşılamadı" burada açıkça ayrılır.
 */

const STATUS: Record<RunStatus, { icon: LucideIcon; color: string }> = {
  ok: { icon: CircleCheck, color: "var(--good)" },
  empty: { icon: CircleMinus, color: "var(--ink-muted)" },
  error: { icon: CircleAlert, color: "var(--critical)" },
  skipped: { icon: CircleDashed, color: "var(--warning)" },
};

function RunStatusLabel({ status }: { status: RunStatus }) {
  const { icon: Icon, color } = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 font-medium" style={{ color }}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="text-ink">{RUN_STATUS_LABELS[status]}</span>
    </span>
  );
}

interface ConnectorCardProps {
  descriptor: ConnectorDescriptor;
  run: CollectionRun | undefined;
  allowed: boolean;
  configured: boolean;
  now: number;
}

function ConnectorCard({ descriptor, run, allowed, configured, now }: ConnectorCardProps) {
  const { capabilities } = descriptor;
  return (
    <article className="rounded-lg border border-line bg-surface p-5">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-[1rem] font-semibold">{descriptor.name}</h3>
        <Tag>{SOURCE_TYPE_LABELS[descriptor.sourceType]}</Tag>
        {descriptor.access === "personal-only" ? (
          <span className="rounded border border-saffron/50 bg-saffron-wash px-1.5 py-0.5 text-[0.75rem] font-semibold text-saffron-ink">Yalnızca kişisel kullanım</span>
        ) : null}
      </header>
      <p className="mt-1 text-ink-soft">{descriptor.summary}</p>

      <div className="mt-3 rounded-md bg-sunken px-3 py-2.5 text-[0.875rem]">
        {!allowed ? (
          <p className="text-ink-soft">Bu kurulumda kapalı: kaynağın koşulları kurumsal kullanıma izin vermiyor.</p>
        ) : !configured ? (
          <p className="text-saffron-ink">
            Anahtar bekleniyor: <span className="reading">{descriptor.requiredSetting}</span> değerini .env.local dosyasına ekleyip sunucuyu yeniden başlatın.
          </p>
        ) : run ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <RunStatusLabel status={run.status} />
              <time className="reading text-[0.8125rem] text-ink-muted" title={formatDateTime(run.startedAt)}>
                {formatRelative(run.startedAt, now)}
              </time>
            </div>
            <p className="reading mt-1.5 text-[0.8125rem] text-ink-soft">
              {formatNumber(run.fetched)} aday · {formatNumber(run.matched)} eşleşme · {formatNumber(run.inserted)} yeni
            </p>
            {run.message ? <p className="mt-1.5 text-[0.8125rem] text-ink-soft">{run.message}</p> : null}
          </>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-ink-soft">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Henüz çalışmadı.
          </p>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.8125rem]">
        <dt className="text-ink-muted">Arama</dt>
        <dd>{capabilities.keywordSearch ? "Anahtar kelimeyle aranır" : "Akışın tamamı çekilir, yerelde süzülür"}</dd>
        <dt className="text-ink-muted">Geçmiş</dt>
        <dd>{capabilities.history}</dd>
        <dt className="text-ink-muted">Saklanan</dt>
        <dd>{capabilities.stores}</dd>
        <dt className="text-ink-muted">Etkileşim</dt>
        <dd>{capabilities.engagement ? "Beğeni, yanıt, paylaşım" : "Kaynak vermiyor"}</dd>
        <dt className="text-ink-muted">Koşullar</dt>
        <dd className="text-ink-soft">{descriptor.terms}</dd>
      </dl>
    </article>
  );
}

export default async function SourcesPage({ params, searchParams }: PageProps<"/proje/[id]/kaynaklar">) {
  const { id } = await params;
  const context = await loadProjectContext(id);
  if (!context) notFound();

  const { project, workspace, now } = context;
  const query = await searchParams;
  const isNew = readString(query, "yeni") === "1";
  const wasSaved = readString(query, "kaydedildi") === "1";
  const isLive = workspace.kind === "live";

  const latest = new Map((await latestRunPerConnector(project.id)).map((run) => [run.connectorId, run]));
  const runs = await listRuns(project.id, 15);
  const connectors = project.connectorIds.map((connectorId) => getConnector(connectorId)).filter((connector) => connector !== undefined);

  return (
    <PageContainer>
      <PageHeading
        title="Kaynaklar"
        lead={
          isLive
            ? `Bu projenin bağlı kaynakları${config.collectionIntervalMinutes > 0 ? ` ${config.collectionIntervalMinutes} dakikada bir` : ""} taranır. Her kaynağın ne getirebildiği ve hangi koşulla kullanılabildiği aşağıda yazılıdır.`
            : "Bu projede kaynak taranmıyor. Canlı bir projede aşağıdaki bağlayıcılar kullanılır."
        }
        actions={isLive ? <CollectButton projectId={project.id} /> : null}
      />

      {isNew || wasSaved ? (
        <p className="mb-5 rounded-md border border-positive/40 bg-positive-wash px-4 py-3 text-positive-ink" role="status">
          {isNew ? "Proje oluşturuldu." : "Değişiklikler kaydedildi."} İlk tarama arka planda başladı; birkaç saniye sonra sayfayı yenileyin ya da “Şimdi tara” ile sonucu hemen görün.
        </p>
      ) : null}

      {isLive ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {connectors.map((connector) => (
            <ConnectorCard
              key={connector.descriptor.id}
              descriptor={connector.descriptor}
              run={latest.get(connector.descriptor.id)}
              allowed={isConnectorAllowed(connector)}
              configured={connector.isConfigured()}
              now={now}
            />
          ))}
        </div>
      ) : null}

      <Panel
        title="Henüz bağlı olmayan kaynaklar"
        hint="Bu kaynaklar veri getiriyormuş gibi gösterilmez; her birinin bağlanması için gereken koşul yanında yazılıdır."
        className="mt-5"
      >
        <table className="w-full border-collapse text-left text-[0.875rem]">
          <thead>
            <tr className="text-[0.75rem] text-ink-muted">
              <th scope="col" className="pb-2 pr-4 font-medium">
                Kaynak
              </th>
              <th scope="col" className="pb-2 font-medium">
                Bağlanması için gereken
              </th>
            </tr>
          </thead>
          <tbody>
            {PLANNED_SOURCES.map((source) => (
              <tr key={source.name} className="border-t border-line align-top">
                <th scope="row" className="whitespace-nowrap py-2 pr-4 font-medium">
                  {source.name}
                </th>
                <td className="py-2 text-ink-soft">{source.requirement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {isLive ? (
        <Panel title="Son taramalar" className="mt-5">
          {runs.length === 0 ? (
            <p className="text-ink-muted">Henüz tarama yapılmadı.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-[0.875rem]">
                <thead>
                  <tr className="text-[0.75rem] text-ink-muted">
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Zaman
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Kaynak
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Sonuç
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">
                      Aday
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">
                      Eşleşme
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Yeni
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-t border-line">
                      <td className="reading whitespace-nowrap py-2 pr-4 text-ink-soft">{formatDateTime(run.startedAt)}</td>
                      <td className="py-2 pr-4">{getConnector(run.connectorId)?.descriptor.name ?? run.connectorId}</td>
                      <td className="py-2 pr-4">
                        <RunStatusLabel status={run.status} />
                      </td>
                      <td className="reading py-2 pr-4 text-right">{formatNumber(run.fetched)}</td>
                      <td className="reading py-2 pr-4 text-right">{formatNumber(run.matched)}</td>
                      <td className="reading py-2 text-right">{formatNumber(run.inserted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}
    </PageContainer>
  );
}
