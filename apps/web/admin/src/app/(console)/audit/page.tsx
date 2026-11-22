import type { Metadata } from "next";
import { Suspense } from "react";
import {
  AuditFilterForm,
  AuditLoading,
  AuditProblems,
} from "@/components/audit-panels";
import { AuditSection } from "@/components/audit-section";
import { StaffOnly } from "@/components/staff-only";
import { parseAuditFilters, parseCursor } from "@/lib/audit-form";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Audit" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const gate = await requireGate("/audit");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  const params = await searchParams;
  const raw: Record<string, string | undefined> = {
    actor_id: one(params.actor_id),
    action: one(params.action),
    entity_type: one(params.entity_type),
    organisation_id: one(params.organisation_id),
    from: one(params.from),
    to: one(params.to),
  };
  const parsed = parseAuditFilters(raw);
  const cursor = parseCursor(one(params.cursor));

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground">
          Every recorded change, newest first. Dates are Grenada days and both
          ends are included. Sensitive values stay masked here.
        </p>
      </div>

      <AuditFilterForm values={raw} />

      {parsed.ok ? (
        <Suspense fallback={<AuditLoading />}>
          <AuditSection
            accessToken={gate.accessToken}
            cursor={cursor}
            filters={parsed.value}
          />
        </Suspense>
      ) : (
        <AuditProblems problems={parsed.problems} />
      )}
    </>
  );
}
