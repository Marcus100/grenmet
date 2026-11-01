import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PayrollAccess } from "../payroll-access";
import { PayrollLoading } from "../payroll-states";
import { type PayRatesData, PayRatesView } from "./pay-rates-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const BASE = "http://localhost";
const MFA_TEXT = /Two-step verification is needed for this/;
const AMOUNT_TEXT = /2,500\.00/;
const API = `${BASE}/api/v1/hr/payroll`;
const SECURITY = "https://auth.example/security";
const MFA_DETAIL =
  "Sign in again with your authenticator or recovery code before using privileged staff tools";

const ALL: PayrollAccess = {
  canReadAmounts: true,
  canManageRates: true,
  canConfirmTables: false,
  canPrepare: false,
  canApprove: false,
  canExport: false,
  canReadSelf: false,
};
const READ_ONLY: PayrollAccess = { ...ALL, canManageRates: false };
const NONE: PayrollAccess = {
  ...ALL,
  canReadAmounts: false,
  canManageRates: false,
};

const BASIC = {
  id: "b1",
  user_id: "u1",
  employee_name: "Synthetic Person",
  organisation_id: "gaa",
  pay_basis: "SALARIED",
  amount_minor: 250_000,
  standard_monthly_hours: "173.33",
  currency: "XCD",
  effective_from: "2026-01-01",
  effective_to: null,
  reason: null,
};
const PROFILE = {
  user_id: "u1",
  employee_name: "Synthetic Person",
  employee_number: "EMP-1",
  department_id: "ops",
  calendar_id: null,
  shift_worker: null,
  effective_shift_worker: false,
  payroll_reference: null,
};
const ITEM = {
  id: "i1",
  organisation_id: "gaa",
  code: "CALL_OUT",
  name: "Call-out",
  kind: "PAY",
  unit: "COUNT",
  method: "MANUAL",
  params: {},
  effective_from: "2026-01-01",
  effective_to: null,
  rule_state: "PROVISIONAL",
  source_reference: null,
  is_active: true,
  accepts_manual_lines: true,
};

function ready<T>(data: T) {
  return { state: "ready" as const, data };
}

function data(overrides: Partial<PayRatesData> = {}): PayRatesData {
  return {
    basicPay: ready({ data: [BASIC] }),
    rates: ready({ data: [] }),
    items: ready({ data: [ITEM] }),
    profiles: ready({ data: [PROFILE] }),
    ...overrides,
  } as PayRatesData;
}

function renderView(access: PayrollAccess, payRates: PayRatesData) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <PayRatesView
        access={access}
        data={payRates}
        organisationId="gaa"
        securityUrl={SECURITY}
      />
    </QueryClientProvider>
  );
}

const server = setupServer();

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  server.resetHandlers();
});
afterEach(() => {
  vi.clearAllMocks();
});
afterAll(() => server.close());

describe("PayRatesView states", () => {
  it("shows the loading message", () => {
    render(<PayrollLoading what="Pay rates" />);
    expect(screen.getByRole("status").textContent).toContain(
      "Loading pay rates"
    );
  });

  it("shows no access and never money when the person lacks the permission", () => {
    renderView(NONE, data());
    expect(
      screen.getByText("No access to pay rates and basic pay")
    ).toBeTruthy();
    expect(screen.queryByText(AMOUNT_TEXT)).toBeNull();
  });

  it("shows an empty state when there is no basic pay", () => {
    renderView(ALL, data({ basicPay: ready({ data: [] }) }));
    expect(screen.getByText("No basic pay recorded yet.")).toBeTruthy();
  });

  it("shows the MFA-required state for a read that needs a fresh sign-in", () => {
    renderView(ALL, data({ basicPay: { state: "mfa" } }));
    expect(screen.getByText("Two-step verification is needed")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open account security" })
        .getAttribute("href")
    ).toBe(SECURITY);
  });

  it("shows saved basic pay in XCD and the provisional rate badge", () => {
    renderView(
      ALL,
      data({
        rates: ready({
          data: [
            {
              id: "r1",
              pay_item_id: "i1",
              organisation_id: "gaa",
              rate_kind: "HOURLY_MULTIPLIER",
              multiplier: "1.5",
              amount_minor: null,
              guaranteed_hours: null,
              guaranteed_multiplier: null,
              currency: "XCD",
              effective_from: "2026-01-01",
              effective_to: null,
              rule_state: "PROVISIONAL",
              source_reference: null,
            },
          ],
        }),
      })
    );
    expect(screen.getByText(AMOUNT_TEXT)).toBeTruthy();
    expect(screen.getByText("1.5 times the hourly rate")).toBeTruthy();
    expect(screen.getAllByText("PROVISIONAL").length).toBeGreaterThan(0);
  });

  it("hides the entry form from a reader without rates.manage", () => {
    renderView(READ_ONLY, data());
    expect(screen.queryByRole("button", { name: "Save basic pay" })).toBeNull();
  });

  it("asks for two-step verification when the save is refused for it", async () => {
    server.use(
      http.post(`${API}/basic-pay`, () =>
        HttpResponse.json({ detail: MFA_DETAIL }, { status: 403 })
      )
    );
    const { container } = renderView(ALL, data());
    const field = (selector: string) =>
      container.querySelector(selector) as HTMLInputElement;
    fireEvent.change(field("#basic-pay-employee"), { target: { value: "u1" } });
    fireEvent.change(field("#basic-pay-amount"), { target: { value: "2500" } });
    fireEvent.change(field("#basic-pay-hours"), {
      target: { value: "173.33" },
    });
    fireEvent.change(field("#basic-pay-from"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save basic pay" }));
    await waitFor(() => expect(screen.getByText(MFA_TEXT)).toBeTruthy());
  });
});
