import type {
  PaymentBalancePublic,
  PaymentLedgerEntryPublic,
  PaymentReconciliationPublic,
} from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BalancesPanel,
  LedgerPanel,
  PayoutConfirm,
  PayoutForm,
  ReconciliationPanel,
  SectionError,
  SectionLoading,
  TestModeBanner,
} from "@/components/payment-panels";

vi.mock("@/app/(console)/payments/actions", () => ({
  recordPayoutAction: () => Promise.resolve(undefined as never),
}));

const TEST_MODE = /test mode only and no live card rail is enabled/;
const NO_BALANCES = /No organisation has a ledger balance/;
const NO_LEDGER = /No ledger entries match/;
const TOO_MUCH = /more than the balance owed/;
const PERMANENT = /permanent/;

const balance: PaymentBalancePublic = {
  organisation_id: "org_1",
  currency: "XCD",
  owed_minor: 125_050,
};
const entry: PaymentLedgerEntryPublic = {
  id: "e1",
  organisation_id: "org_1",
  intent_id: null,
  kind: "payout",
  amount_minor: -5000,
  currency: "XCD",
  provider: "manual",
  reference: "TT-1",
  note: null,
  created_at: "2026-10-18T12:00:00Z",
};
const report: PaymentReconciliationPublic = {
  start_date: "2026-10-01",
  end_date: "2026-10-31",
  generated_at: "2026-11-01T00:00:00Z",
  rows: [
    {
      organisation_id: "org_1",
      currency: "XCD",
      opening_minor: 1000,
      charges_minor: 20_000,
      refunds_minor: -500,
      fees_minor: -100,
      adjustments_minor: 0,
      payouts_minor: -5000,
      closing_minor: 15_400,
      intents_succeeded: 4,
      unmatched_intents: 1,
    },
  ],
};

describe("TestModeBanner", () => {
  it("states Stripe is test mode only", () => {
    render(<TestModeBanner />);
    expect(screen.getByRole("note").textContent).toMatch(TEST_MODE);
  });
});

describe("BalancesPanel", () => {
  it("shows balances as XCD with two decimals", () => {
    render(<BalancesPanel rows={[balance]} />);
    expect(screen.getByText("XCD 1,250.50")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "org_1" }).getAttribute("href")
    ).toBe("/organisations/org_1");
  });

  it("says so when empty", () => {
    render(<BalancesPanel rows={[]} />);
    expect(screen.getByRole("status").textContent).toMatch(NO_BALANCES);
  });
});

describe("LedgerPanel", () => {
  const base = {
    count: 30,
    kind: undefined,
    lastPage: 2,
    organisationId: undefined,
    page: 1,
    previousHref: undefined,
  };

  it("lists entries with signed amounts and paging links", () => {
    render(
      <LedgerPanel {...base} nextHref="/payments?page=2" rows={[entry]} />
    );
    expect(screen.getByText("XCD -50.00")).toBeTruthy();
    expect(screen.getByText("TT-1")).toBeTruthy();
    expect(screen.getByText("30 total, page 1 of 2")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Next" }).getAttribute("href")
    ).toBe("/payments?page=2");
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
  });

  it("says so when empty", () => {
    render(<LedgerPanel {...base} nextHref={undefined} rows={[]} />);
    expect(screen.getByRole("status").textContent).toMatch(NO_LEDGER);
  });
});

describe("ReconciliationPanel", () => {
  const period = { start: "2026-10-01", end: "2026-10-31" };

  it("shows the table and the CSV link", () => {
    render(
      <ReconciliationPanel
        csvHref="/payments/reconciliation.csv?start_date=2026-10-01"
        organisationId={undefined}
        period={period}
        rejected={false}
        report={report}
      />
    );
    const row = screen.getAllByRole("row")[1] as HTMLElement;
    expect(within(row).getByText("XCD 154.00")).toBeTruthy();
    expect(within(row).getByText("XCD 200.00")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")
    ).toContain("/payments/reconciliation.csv");
  });

  it("explains a rejected range and offers no download", () => {
    render(
      <ReconciliationPanel
        csvHref={undefined}
        organisationId={undefined}
        period={undefined}
        rejected
        report={undefined}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain("valid start");
    expect(screen.queryByRole("link", { name: "Download CSV" })).toBeNull();
  });
});

describe("payout steps", () => {
  it("step one is a GET form, so nothing is recorded yet", () => {
    const { container } = render(<PayoutForm />);
    const form = container.querySelector("form") as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("get");
    expect(screen.getByRole("button", { name: "Review payout" })).toBeTruthy();
  });

  it("step two shows XCD amounts and a confirm button with minor-unit-safe values", () => {
    const { container } = render(
      <PayoutConfirm
        owedMinor={125_050}
        payout={{
          organisationId: "org_1",
          amountMinor: 1250,
          reference: "TT-1",
          note: null,
        }}
        requestId="5b1d0f6c-0c0a-4c53-9a51-6a2ee2b3c001"
      />
    );
    expect(screen.getByText("XCD 12.50")).toBeTruthy();
    expect(screen.getByText("XCD 1,250.50")).toBeTruthy();
    expect(container.textContent).toMatch(PERMANENT);
    expect(
      container.querySelector<HTMLInputElement>('input[name="amount"]')?.value
    ).toBe("12.50");
    expect(
      screen.getByRole("button", { name: "Confirm and record payout" })
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns when the payout is above the balance owed", () => {
    render(
      <PayoutConfirm
        owedMinor={100}
        payout={{
          organisationId: "org_1",
          amountMinor: 1250,
          reference: "TT-1",
          note: "x",
        }}
        requestId="5b1d0f6c-0c0a-4c53-9a51-6a2ee2b3c001"
      />
    );
    expect(screen.getByRole("alert").textContent).toMatch(TOO_MUCH);
  });
});

describe("section states", () => {
  it("shows loading and error", () => {
    const { unmount } = render(<SectionLoading id="x" title="Ledger" />);
    expect(screen.getByText("Loading ledger")).toBeTruthy();
    unmount();
    render(<SectionError id="x" title="Ledger" />);
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be loaded"
    );
  });
});
