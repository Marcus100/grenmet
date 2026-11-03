import type { Metadata } from "next";
import { Suspense } from "react";
import { NoticeBanner } from "@/components/invoice-panels";
import { SectionLoading, TestModeBanner } from "@/components/payment-panels";
import {
  BalancesSection,
  LedgerSection,
  PayoutSection,
  ReconciliationSection,
} from "@/components/payments-sections";
import { StaffOnly } from "@/components/staff-only";
import {
  parseLedgerKind,
  parseOrganisationFilter,
  parsePage,
  parsePayout,
  parsePeriod,
  paymentNoticeFor,
} from "@/lib/payment-form";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const gate = await requireGate("/payments");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  const params = await searchParams;
  const ledgerOrganisation = parseOrganisationFilter(
    one(params.ledger_organisation_id)
  );
  const kind = parseLedgerKind(one(params.kind));
  const page = parsePage(one(params.page));
  const from = one(params.from);
  const to = one(params.to);
  const reconOrganisation = parseOrganisationFilter(
    one(params.recon_organisation_id)
  );
  const period = parsePeriod(from, to);
  const payout = parsePayout({
    organisation_id: one(params.payout_organisation_id),
    amount: one(params.payout_amount),
    reference: one(params.payout_reference),
    note: one(params.payout_note),
  });
  const proposed = Boolean(
    one(params.payout_organisation_id) || one(params.payout_amount)
  );

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-muted-foreground">
          What each organisation is owed, the append-only ledger, period
          reconciliation and payouts.
        </p>
      </div>
      <TestModeBanner />
      <NoticeBanner notice={paymentNoticeFor(one(params.notice))} />
      {proposed && !payout.ok ? (
        <p className="rounded-md border px-3 py-2 text-sm" role="alert">
          Problem: that payout is not valid. Check the organisation id, an
          amount above zero with at most two decimals, and a reference.
        </p>
      ) : null}
      <Suspense
        fallback={
          <SectionLoading id="balances-heading" title="Balances owed" />
        }
      >
        <BalancesSection accessToken={gate.accessToken} />
      </Suspense>
      <Suspense
        fallback={
          <SectionLoading id="payout-heading" title="Record a payout" />
        }
      >
        <PayoutSection
          accessToken={gate.accessToken}
          proposal={payout.ok ? payout.value : undefined}
        />
      </Suspense>
      <Suspense
        fallback={<SectionLoading id="ledger-heading" title="Ledger" />}
      >
        <LedgerSection
          accessToken={gate.accessToken}
          kind={kind}
          organisationId={ledgerOrganisation}
          page={page}
        />
      </Suspense>
      <Suspense
        fallback={
          <SectionLoading id="reconciliation-heading" title="Reconciliation" />
        }
      >
        <ReconciliationSection
          accessToken={gate.accessToken}
          organisationId={reconOrganisation}
          period={period.ok ? period.value : undefined}
          requested={Boolean(from || to)}
        />
      </Suspense>
    </>
  );
}
