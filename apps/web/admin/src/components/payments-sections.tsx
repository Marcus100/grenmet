import { isAuthApiError } from "@barrelsgd/auth";
import {
  BalancesPanel,
  LedgerPanel,
  PayoutConfirm,
  PayoutForm,
  ReconciliationPanel,
  SectionError,
} from "@/components/payment-panels";
import type { PayoutInput, Period } from "@/lib/payment-form";
import {
  getReconciliation,
  LEDGER_PAGE_SIZE,
  listBalances,
  listLedger,
} from "@/lib/payments-api";
import { reportError } from "@/lib/report-error";

// Each section streams behind its own Suspense boundary with its own error
// state, so one failing call never takes the page down.

const BAD_REQUEST = 400;
const UNPROCESSABLE = 422;

export async function BalancesSection({
  accessToken,
}: {
  accessToken: string;
}) {
  try {
    const { data } = await listBalances(accessToken);
    return <BalancesPanel rows={data} />;
  } catch (error) {
    reportError(error, "admin-payments");
    return <SectionError id="balances-heading" title="Balances owed" />;
  }
}

export async function LedgerSection({
  accessToken,
  kind,
  organisationId,
  page,
}: {
  accessToken: string;
  kind: string | undefined;
  organisationId: string | undefined;
  page: number;
}) {
  try {
    const list = await listLedger(accessToken, { page, organisationId, kind });
    const lastPage = Math.max(1, Math.ceil(list.count / LEDGER_PAGE_SIZE));
    const linkTo = (target: number) => {
      const next = new URLSearchParams();
      if (organisationId) next.set("ledger_organisation_id", organisationId);
      if (kind) next.set("kind", kind);
      next.set("page", String(target));
      return `/payments?${next}#ledger-heading`;
    };
    return (
      <LedgerPanel
        count={list.count}
        kind={kind}
        lastPage={lastPage}
        nextHref={page < lastPage ? linkTo(page + 1) : undefined}
        organisationId={organisationId}
        page={page}
        previousHref={page > 1 ? linkTo(page - 1) : undefined}
        rows={list.data}
      />
    );
  } catch (error) {
    reportError(error, "admin-payments");
    return <SectionError id="ledger-heading" title="Ledger" />;
  }
}

export async function ReconciliationSection({
  accessToken,
  organisationId,
  period,
  requested,
}: {
  accessToken: string;
  organisationId: string | undefined;
  period: Period | undefined;
  /** The staff typed a range; `period` is undefined when it was not valid. */
  requested: boolean;
}) {
  if (!period) {
    return (
      <ReconciliationPanel
        csvHref={undefined}
        organisationId={organisationId}
        period={undefined}
        rejected={requested}
        report={undefined}
      />
    );
  }
  const query = new URLSearchParams({
    start_date: period.start,
    end_date: period.end,
  });
  if (organisationId) query.set("organisation_id", organisationId);
  try {
    const report = await getReconciliation(accessToken, {
      startDate: period.start,
      endDate: period.end,
      organisationId,
    });
    return (
      <ReconciliationPanel
        csvHref={`/payments/reconciliation.csv?${query}`}
        organisationId={organisationId}
        period={period}
        rejected={false}
        report={report}
      />
    );
  } catch (error) {
    if (
      isAuthApiError(error) &&
      (error.status === BAD_REQUEST || error.status === UNPROCESSABLE)
    ) {
      return (
        <ReconciliationPanel
          csvHref={undefined}
          organisationId={organisationId}
          period={period}
          rejected
          report={undefined}
        />
      );
    }
    reportError(error, "admin-payments");
    return <SectionError id="reconciliation-heading" title="Reconciliation" />;
  }
}

/** The payout form, or the confirmation step once a valid proposal is in the URL. */
export async function PayoutSection({
  accessToken,
  proposal,
}: {
  accessToken: string;
  proposal: PayoutInput | undefined;
}) {
  if (!proposal) return <PayoutForm />;
  let owedMinor: number | undefined;
  try {
    const { data } = await listBalances(accessToken);
    owedMinor = data.find(
      (row) =>
        row.organisation_id === proposal.organisationId &&
        row.currency === "XCD"
    )?.owed_minor;
  } catch (error) {
    // The confirmation still works; the API enforces the limit regardless.
    reportError(error, "admin-payments");
  }
  return (
    <PayoutConfirm
      owedMinor={owedMinor}
      payout={proposal}
      requestId={crypto.randomUUID()}
    />
  );
}
