import { Button } from "@grenmet/ui/components/ui/button";
import { FileText, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { SeverityBadge } from "@/components/severity-badge";
import {
  capPublicUrl,
  formatDateTime,
  getAlertByIdentifier,
  primaryInfo,
} from "@/lib/cap-api";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ identifier: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { identifier } = await params;
  const alert = await getAlertByIdentifier(decodeURIComponent(identifier));
  const info = primaryInfo(alert);
  return {
    title: info?.headline ?? alert.identifier,
  };
}

export default async function AlertDetailPage({ params }: Props) {
  const { identifier } = await params;
  const alert = await getAlertByIdentifier(decodeURIComponent(identifier));
  const info = primaryInfo(alert);

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 border-gm-border border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {info ? <SeverityBadge severity={info.severity} /> : null}
            <span className="text-gm-body-sm text-gm-text-muted leading-gm-body-sm">
              {alert.msg_type}
            </span>
            <span className="text-gm-body-sm text-gm-text-muted leading-gm-body-sm">
              {alert.lifecycle_state}
            </span>
          </div>
          <h1 className="text-gm-heading-md text-gm-text-primary leading-gm-heading-md">
            {info?.headline ?? alert.identifier}
          </h1>
          <p className="mt-2 break-words text-gm-body-sm text-gm-text-muted leading-gm-body-sm">
            {alert.identifier}
          </p>
        </div>
        {alert.xml_url ? (
          <Button asChild variant="outline">
            <a href={capPublicUrl(alert.xml_url)}>
              <FileText aria-hidden="true" />
              XML
            </a>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-2 text-gm-heading-sm text-gm-text-primary leading-gm-heading-sm">
              Description
            </h2>
            <p className="whitespace-pre-line text-gm-body-base text-gm-text-secondary leading-gm-body-base">
              {info?.description ?? alert.note ?? "CAP alert"}
            </p>
          </section>
          {info?.instruction ? (
            <section className="border-gm-border border-l-4 border-l-gm-risk-red bg-gm-surface px-4 py-3">
              <h2 className="mb-2 text-gm-heading-sm text-gm-text-primary leading-gm-heading-sm">
                Instruction
              </h2>
              <p className="whitespace-pre-line text-gm-body-base text-gm-text-secondary leading-gm-body-base">
                {info.instruction}
              </p>
            </section>
          ) : null}
          <section>
            <h2 className="mb-2 text-gm-heading-sm text-gm-text-primary leading-gm-heading-sm">
              Areas
            </h2>
            <div className="grid gap-2">
              {(info?.areas ?? []).map((area) => (
                <div
                  className="flex items-start gap-2 border border-gm-border bg-white p-3"
                  key={area.id}
                >
                  <MapPin
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-gm-navy"
                  />
                  <span className="text-gm-body text-gm-text-secondary leading-gm-body">
                    {area.area_desc}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <Detail label="Sent" value={formatDateTime(alert.sent)} />
          <Detail
            label="Effective"
            value={formatDateTime(info?.effective ?? null)}
          />
          <Detail label="Onset" value={formatDateTime(info?.onset ?? null)} />
          <Detail
            label="Expires"
            value={formatDateTime(info?.expires ?? null)}
          />
          <Detail label="Urgency" value={info?.urgency ?? "Unknown"} />
          <Detail label="Certainty" value={info?.certainty ?? "Unknown"} />
          <Detail label="Sender" value={alert.sender} />
        </aside>
      </div>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gm-border bg-white p-3 shadow-gm-card">
      <div className="text-gm-label text-gm-text-muted uppercase leading-gm-label">
        {label}
      </div>
      <div className="mt-1 break-words text-gm-body text-gm-text-primary leading-gm-body">
        {value}
      </div>
    </div>
  );
}
