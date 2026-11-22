import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsolePager } from "@/components/console-pager";
import { CaseTable, StatusTabs } from "@/components/moderation-panels";
import { StaffOnly } from "@/components/staff-only";
import { listVerificationCases } from "@/lib/moderation-api";
import {
  MODERATION_PAGE_SIZE,
  parseModerationStatus,
} from "@/lib/moderation-form";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function pageNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000
    ? parsed
    : 1;
}

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const gate = await requireGate("/moderation");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  const params = await searchParams;
  const status = parseModerationStatus(one(params.status));
  const page = pageNumber(one(params.page));
  const list = await listVerificationCases(gate.accessToken, status, page);
  const lastPage = Math.max(1, Math.ceil(list.count / MODERATION_PAGE_SIZE));
  if (page > lastPage) {
    redirect(`/moderation?status=${status}&page=${lastPage}`);
  }
  const linkTo = (target: number) =>
    `/moderation?status=${status}&page=${target}` as const;

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Organiser moderation
        </h1>
        <p className="text-muted-foreground">
          Organisers asking to be verified for Barrels Events, oldest request
          first. Approval lets an organiser publish; rejection emails the
          organiser's owners the reason.
        </p>
      </div>

      <StatusTabs current={status} />
      <CaseTable rows={list.data} status={status} />

      {list.count > 0 ? (
        <ConsolePager
          count={list.count}
          label="Moderation pages"
          lastPage={lastPage}
          nextHref={page < lastPage ? linkTo(page + 1) : undefined}
          page={page}
          previousHref={page > 1 ? linkTo(page - 1) : undefined}
        />
      ) : null}
    </>
  );
}
