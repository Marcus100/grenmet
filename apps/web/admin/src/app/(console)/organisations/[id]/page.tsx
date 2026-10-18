import { isAuthApiError } from "@barrelsgd/auth";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffOnly } from "@/components/staff-only";
import { getOrganisation } from "@/lib/api";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Organisation" };
export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function OrganisationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gate = await requireGate(`/organisations/${encodeURIComponent(id)}`);
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  let organisation: Awaited<ReturnType<typeof getOrganisation>>;
  try {
    organisation = await getOrganisation(gate.accessToken, id);
  } catch (error) {
    if (isAuthApiError(error) && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <Link className="text-sm underline" href="/organisations">
        All organisations
      </Link>
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl">{organisation.name}</h1>
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
        <dt className="text-muted-foreground">Created</dt>
        <dd>{formatDate(organisation.created_at)}</dd>
        <dt className="text-muted-foreground">Updated</dt>
        <dd>{formatDate(organisation.updated_at)}</dd>
      </dl>

      <section className="space-y-2">
        <h2 className="font-medium">Apps</h2>
        {organisation.apps.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No app entitlements recorded.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {organisation.apps.map((app) => (
              <li key={app.app_key}>
                <span className="font-mono">{app.app_key}</span>
                {" - "}
                {app.enabled ? "enabled" : "disabled"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1 rounded-lg border border-dashed p-4">
        <h2 className="font-medium">Verification and entitlements</h2>
        <p className="text-muted-foreground text-sm">
          {organisation.verified_at
            ? `Verified on ${formatDate(organisation.verified_at)}.`
            : "Not verified."}{" "}
          Reviewing verification and changing app entitlements arrive in the
          next slice (C2). This page is read only.
        </p>
      </section>
    </>
  );
}
