import { isAuthApiError } from "@barrelsgd/auth";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApiKeysLoading } from "@/components/api-key-panels";
import { ApiKeysSection } from "@/components/api-keys-section";
import { MemberAddSection, MemberRowActions } from "@/components/member-admin";
import {
  AppEntitlements,
  OrganisationActions,
} from "@/components/organisation-actions";
import { HistoryPanel, MembersPanel } from "@/components/organisation-panels";
import { SitesLoading } from "@/components/site-panels";
import { SitesSection } from "@/components/sites-section";
import { StaffOnly } from "@/components/staff-only";
import {
  getOrganisation,
  getOrganisationHistory,
  listOrganisationMembers,
} from "@/lib/api";
import { apiKeyNoticeFor } from "@/lib/api-key-form";
import { getAuthConfig } from "@/lib/auth-config";
import { memberNoticeFor } from "@/lib/member-form";
import { noticeFor } from "@/lib/organisation-form";
import { siteNoticeFor } from "@/lib/site-form";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Organisation" };
export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function OrganisationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { notice: rawNotice } = await searchParams;
  const gate = await requireGate(`/organisations/${encodeURIComponent(id)}`);
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  let organisation: Awaited<ReturnType<typeof getOrganisation>>;
  try {
    organisation = await getOrganisation(gate.accessToken, id);
  } catch (error) {
    if (isAuthApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const [members, history] = await Promise.all([
    listOrganisationMembers(gate.accessToken, id),
    getOrganisationHistory(gate.accessToken, id),
  ]);
  const noticeCode = Array.isArray(rawNotice) ? rawNotice[0] : rawNotice;
  const notice =
    noticeFor(noticeCode) ??
    siteNoticeFor(noticeCode) ??
    apiKeyNoticeFor(noticeCode);
  const memberNotice = memberNoticeFor(noticeCode);

  return (
    <>
      <Link className="text-sm underline" href="/organisations">
        All organisations
      </Link>
      {notice ? (
        <p
          className="rounded-md border px-3 py-2 text-sm"
          role={notice.tone === "problem" ? "alert" : "status"}
        >
          {notice.tone === "problem" ? "Problem: " : "Done: "}
          {notice.text}
        </p>
      ) : null}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{organisation.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              organisation.status === "active"
                ? "light-success"
                : "light-warning"
            }
          >
            {organisation.status === "active" ? "Active" : "Suspended"}
          </Badge>
          <Badge
            variant={organisation.verified_at ? "light-success" : "outline"}
          >
            {organisation.verified_at ? "Verified" : "Not verified"}
          </Badge>
          <span className="text-muted-foreground text-sm capitalize">
            {organisation.kind}
          </span>
        </div>
      </div>

      <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Identifier</dt>
        <dd className="font-mono">{organisation.id}</dd>
        <dt className="text-muted-foreground">Slug</dt>
        <dd className="font-mono">{organisation.slug}</dd>
        <dt className="text-muted-foreground">Active members</dt>
        <dd>{organisation.active_member_count}</dd>
        <dt className="text-muted-foreground">Verified</dt>
        <dd>
          {organisation.verified_at
            ? formatDate(organisation.verified_at)
            : "Not verified"}
        </dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd>{formatDate(organisation.created_at)}</dd>
        <dt className="text-muted-foreground">Updated</dt>
        <dd>{formatDate(organisation.updated_at)}</dd>
      </dl>

      <OrganisationActions organisation={organisation} />
      <AppEntitlements organisation={organisation} />
      <Suspense fallback={<SitesLoading />}>
        <SitesSection accessToken={gate.accessToken} organisationId={id} />
      </Suspense>
      <Suspense fallback={<ApiKeysLoading />}>
        <ApiKeysSection accessToken={gate.accessToken} organisationId={id} />
      </Suspense>
      <MembersPanel
        addForm={
          <MemberAddSection organisationId={id} selfEmail={gate.email} />
        }
        count={members.count}
        notice={
          memberNotice
            ? {
                ...memberNotice,
                href:
                  noticeCode === "member-mfa"
                    ? new URL(
                        "/security",
                        getAuthConfig().authAppUrl
                      ).toString()
                    : undefined,
              }
            : undefined
        }
        rowActions={(row) => (
          <MemberRowActions member={row} organisationId={id} />
        )}
        rows={members.data}
      />
      <HistoryPanel count={history.count} rows={history.data} />
    </>
  );
}
