import { TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { fetchPublicAlert, severityLevel } from "@/lib/cap";
import { cn } from "@/lib/utils";
import { toWarningDetail, warningHref } from "@/lib/warning-detail";
import {
  WARNING_LEVEL_LABEL,
  WARNING_LEVEL_SURFACE,
} from "@/lib/warning-level";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ updatedFrom?: string }>;
}

async function load(params: Props["params"]) {
  const { identifier } = await params;
  return fetchPublicAlert(decodeURIComponent(identifier));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await load(params);
  const detail = result.status === "ok" ? toWarningDetail(result.alert) : null;
  return detail
    ? { description: detail.headline, title: detail.event }
    : { title: "Warning" };
}

/**
 * One warning in the shape of the GMS content contract
 * (docs/operations/warning-ibf-framework.md §6): what is expected, what to do,
 * where, when, how likely — the Met Office / NWS "what, where, when, impacts"
 * structure, read from the public CAP feed.
 */
export default async function WarningPage({ params, searchParams }: Props) {
  const result = await load(params);

  if (result.status === "not-found") {
    notFound();
  }
  if (result.status === "unavailable") {
    return (
      <>
        <PageHeader title="Warning" />
        <p className="rounded border border-gm-risk-amber bg-gm-surface p-4 text-body text-gm-text-secondary leading-body lg:p-5">
          This warning cannot be retrieved right now. This does not mean it has
          ended — check{" "}
          <Link className="text-gm-blue-ink underline" href="/warnings">
            warnings in effect
          </Link>{" "}
          or contact the Grenada Meteorological Service directly.
        </p>
      </>
    );
  }

  if (result.alert.replaced_by_identifier) {
    const from = encodeURIComponent(result.alert.identifier);
    redirect(
      `${warningHref(result.alert.replaced_by_identifier)}?updatedFrom=${from}`
    );
  }

  const detail = toWarningDetail(result.alert);
  if (!detail) {
    notFound();
  }

  const level = detail.ended ? "unknown" : severityLevel(detail.severity);
  const { updatedFrom } = await searchParams;
  const previous = updatedFrom ? await fetchPublicAlert(updatedFrom) : null;
  const previousDetail =
    previous?.status === "ok" &&
    previous.alert.replaced_by_identifier === result.alert.identifier
      ? toWarningDetail(previous.alert)
      : null;

  return (
    <>
      <PageHeader description={detail.headline} title={detail.event} />

      {previousDetail && (
        <p className="mb-6 rounded border border-gm-border bg-gm-surface p-4 text-body text-gm-text-secondary leading-body lg:p-5">
          Updated from {previousDetail.event}
          {previousDetail.issued ? `, issued ${previousDetail.issued}` : ""}.
        </p>
      )}

      {detail.status !== "Actual" && (
        <p
          className="mb-6 rounded border-2 border-gm-risk-red bg-gm-risk-yellow p-4 font-bold text-body-base text-gm-text-primary leading-body-base lg:p-5"
          role="alert"
        >
          Exercise — this message is marked {detail.status} and is part of a
          test, not a live warning. Take no protective action on its basis.
        </p>
      )}

      <div
        className={cn(
          "mb-8 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-4 py-3 lg:px-5",
          WARNING_LEVEL_SURFACE[level]
        )}
      >
        <span className="flex items-center gap-2.5 font-bold text-body-base leading-body-base">
          <TriangleAlertIcon aria-hidden="true" className="size-5 shrink-0" />
          {detail.ended
            ? `${detail.ended === "cancelled" ? "Cancelled" : "Ended"} — no longer in effect`
            : WARNING_LEVEL_LABEL[level]}
        </span>
        {!detail.ended && (
          <span className="text-body-sm leading-body-sm">
            {detail.severity} severity · {detail.certainty}
          </span>
        )}
      </div>

      {detail.cancellationReason && (
        <p className="mb-6 rounded border border-gm-border bg-gm-surface p-4 text-body-base text-gm-text-primary leading-body-base lg:p-5">
          Reason: {detail.cancellationReason}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-12">
        <div>
          <PageSection heading="What to expect">
            <p className="max-w-prose whitespace-pre-line text-pretty text-body-base text-gm-text-primary leading-body-base">
              {detail.whatToExpect}
            </p>
          </PageSection>
          <PageSection heading="What to do">
            <p className="max-w-prose whitespace-pre-line text-pretty text-body-base text-gm-text-primary leading-body-base">
              {detail.instruction ??
                "No specific actions were issued with this warning. Follow updates from the Grenada Meteorological Service and advice from NaDMA."}
            </p>
          </PageSection>
        </div>

        <aside>
          <dl className="grid gap-4 rounded border border-gm-border bg-gm-surface p-4 lg:p-5">
            {[
              [
                "Where",
                detail.areas.length > 0
                  ? detail.areas.join(", ")
                  : "Not stated",
              ],
              ["Starts", detail.starts ?? "In effect now"],
              ["Until", detail.expires ?? "Until further notice"],
              ["How likely", detail.certainty],
              ["Issued", detail.issued],
              ["Issued by", detail.sender],
            ].map(([term, value]) =>
              value ? (
                <div key={term}>
                  <dt className="font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wide">
                    {term}
                  </dt>
                  <dd className="text-body-base text-gm-text-primary leading-body-base">
                    {value}
                  </dd>
                </div>
              ) : null
            )}
          </dl>
          <ul className="mt-4 flex flex-col gap-2 text-body text-gm-blue-ink leading-body">
            <li>
              <Link className="underline" href="/warnings">
                All warnings in effect
              </Link>
            </li>
            <li>
              <Link className="underline" href="/warnings/levels">
                How warning levels work
              </Link>
            </li>
          </ul>
        </aside>
      </div>
    </>
  );
}
