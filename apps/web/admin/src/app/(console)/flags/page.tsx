import type { Metadata } from "next";
import { Suspense } from "react";
import {
  FlagsLoading,
  NewFlag,
  PropagationWarning,
} from "@/components/flag-panels";
import { FlagsSection } from "@/components/flags-section";
import { NoticeBanner } from "@/components/invoice-panels";
import { StaffOnly } from "@/components/staff-only";
import { flagNoticeFor } from "@/lib/flag-form";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Feature flags" };
export const dynamic = "force-dynamic";

export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireGate("/flags");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;
  const { notice: rawNotice } = await searchParams;
  const code = Array.isArray(rawNotice) ? rawNotice[0] : rawNotice;

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl">Feature flags</h1>
        <p className="text-muted-foreground">
          Runtime switches with a recorded success metric. Needs the
          feature_flags.manage permission.
        </p>
      </div>
      <NoticeBanner notice={flagNoticeFor(code)} />
      <PropagationWarning />
      <NewFlag />
      <Suspense fallback={<FlagsLoading />}>
        <FlagsSection accessToken={gate.accessToken} />
      </Suspense>
    </>
  );
}
