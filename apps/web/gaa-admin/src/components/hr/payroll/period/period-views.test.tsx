import {
  configureApiClient,
  type PaySummaryPublic,
} from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  PayPeriodIssueView,
  PROVISIONAL_BANNER,
} from "./pay-period-issue-view";
import { PeriodPayslipList } from "./payslip-list";
import { PeriodExports } from "./period-exports";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const BASE = "http://localhost";
const API = `${BASE}/api/v1/hr/payroll`;
const SECURITY = "https://auth.example/security";
const MFA_DETAIL =
  "Sign in again with your authenticator or recovery code before using privileged staff tools";
const MFA_TEXT = /Two-step verification is needed/;
const NO_SLIPS = /No payslips yet/;
const APPROVED_ON = /Approved for issue on/;
const NO_LINES = /No pay lines to summarise yet/;
const WHO_FIX = /Who can fix it:/;
const NOT_APPROVED = /not approved yet/;
const PROVISIONAL_TABLE = /PAYE table is still provisional/;

const TAX_LINE = {
  category: "INCOME_TAX",
  code: "PAYE",
  name: "PAYE",
  base_minor: 100_000,
  employee_minor: 10_000,
  employer_minor: 0,
  rule_state: "CONFIRMED",
} as const;

function summary(overrides: Partial<PaySummaryPublic> = {}): PaySummaryPublic {
  return {
    period_id: "p1",
    currency: "XCD",
    provisional_figures: false,
    label: null,
    blocking_tables: [],
    issue_approved_at: null,
    employees: [
      {
        user_id: "u1",
        employee_name: "Synthetic Person",
        gross_minor: 300_000,
        unpriced_line_count: 0,
        deductions: [TAX_LINE],
        employee_deductions_minor: 10_000,
        employer_contributions_minor: 0,
        net_minor: 290_000,
        shortfall_minor: 0,
      },
    ],
    ...overrides,
  };
}

const server = setupServer();
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => server.resetHandlers());
afterAll(() => server.close());

function issue(
  overrides: Partial<Parameters<typeof PayPeriodIssueView>[0]> = {}
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PayPeriodIssueView
        canApprove
        canReadAmounts
        periodId="p1"
        preparedByCaller={false}
        securityUrl={SECURITY}
        status="APPROVED"
        summary={summary()}
        {...overrides}
      />
    </QueryClientProvider>
  );
}

describe("PayPeriodIssueView", () => {
  it("shows the provisional banner and names the tables while a table is provisional", () => {
    issue({
      summary: summary({
        provisional_figures: true,
        blocking_tables: ["PAYE"],
      }),
    });
    expect(screen.getByText(PROVISIONAL_BANNER)).toBeTruthy();
    expect(screen.getByText(PROVISIONAL_TABLE)).toBeTruthy();
  });

  it("shows the empty state when the period has no employees", () => {
    issue({ summary: summary({ employees: [] }) });
    expect(screen.getByText(NO_LINES)).toBeTruthy();
  });

  it("lists blockers in plain language with who can fix them", () => {
    issue({ status: "OPEN", summary: summary() });
    expect(screen.getByText(NOT_APPROVED)).toBeTruthy();
    expect(screen.getAllByText(WHO_FIX).length).toBeGreaterThan(0);
  });

  it("disables approval while blockers remain", () => {
    issue({
      summary: summary({
        blocking_tables: ["PAYE"],
        provisional_figures: true,
      }),
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Approve for issue",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("shows the approved date once issued, with no approve action", () => {
    issue({ summary: summary({ issue_approved_at: "2026-10-30T10:00:00Z" }) });
    expect(screen.getByText(APPROVED_ON)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Approve for issue" })
    ).toBeNull();
  });

  it("asks for two-step verification when approval is refused for it", async () => {
    server.use(
      http.post(`${API}/periods/:id/issue-approval`, () =>
        HttpResponse.json({ detail: MFA_DETAIL }, { status: 403 })
      )
    );
    issue({ summary: summary() });
    fireEvent.click(screen.getByRole("button", { name: "Approve for issue" }));
    await waitFor(() => expect(screen.getByText(MFA_TEXT)).toBeTruthy());
  });
});

describe("PeriodPayslipList", () => {
  const SLIP = {
    id: "s1",
    period_id: "p1",
    user_id: "u1",
    period_start: "2026-10-01",
    period_end: "2026-10-31",
    employee_name: "Synthetic Person",
    net_minor: 290_000,
    currency: "XCD",
    sha256: "abc",
    issued_at: "2026-10-31T10:00:00Z",
  };

  it("shows the sign-in state for payslips that need a fresh sign-in", () => {
    render(
      <PeriodPayslipList payslips={{ state: "mfa" }} securityUrl={SECURITY} />
    );
    expect(screen.getByText("Two-step verification is needed")).toBeTruthy();
  });

  it("shows the empty state before any payslips are issued", () => {
    render(
      <PeriodPayslipList
        payslips={{ state: "ready", data: { data: [] } }}
        securityUrl={SECURITY}
      />
    );
    expect(screen.getByText(NO_SLIPS)).toBeTruthy();
  });

  it("lists each payslip with a download action", () => {
    render(
      <PeriodPayslipList
        payslips={{ state: "ready", data: { data: [SLIP] } }}
        securityUrl={SECURITY}
      />
    );
    expect(screen.getByText("Synthetic Person")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
  });

  it("shows no access when the payslips are forbidden", () => {
    render(
      <PeriodPayslipList
        payslips={{ state: "forbidden" }}
        securityUrl={SECURITY}
      />
    );
    expect(
      screen.getByText("No access to payslips for this period")
    ).toBeTruthy();
  });
});

describe("PeriodExports", () => {
  it("asks for two-step verification when the bank file is refused for it", async () => {
    server.use(
      http.post(`${API}/periods/:id/bank-transfer.csv`, () =>
        HttpResponse.json({ detail: MFA_DETAIL }, { status: 403 })
      )
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PeriodExports
          periodId="p1"
          periodStart="2026-10-01"
          securityUrl={SECURITY}
        />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Download bank file" }));
    await waitFor(() => expect(screen.getByText(MFA_TEXT)).toBeTruthy());
  });
});
