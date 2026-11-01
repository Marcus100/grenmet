import { configureApiClient } from "@barrelsgd/api-client";
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
import type { PayrollAccess } from "../payroll-access";
import { type TablesData, TablesView } from "./tables-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const BASE = "http://localhost";
const API = `${BASE}/api/v1/hr/payroll`;
const SECURITY = "https://auth.example/security";
const MFA_DETAIL =
  "Sign in again with your authenticator or recovery code before using privileged staff tools";
const NO_ACCESS_TEXT = "No access to tax tables and deductions";
const MFA_TEXT = /Two-step verification is needed/;
const ALL: PayrollAccess = {
  canReadAmounts: true,
  canManageRates: true,
  canConfirmTables: true,
  canPrepare: false,
  canApprove: false,
  canExport: false,
  canReadSelf: false,
};
const NONE: PayrollAccess = {
  ...ALL,
  canReadAmounts: false,
  canManageRates: false,
};
const EMPTY_TABLES = {
  tax_tables: [],
  social_insurance: [],
  deduction_types: [],
};
const TAX = {
  id: "t1",
  organisation_id: "gaa",
  code: "PAYE",
  name: "PAYE income tax",
  method: "ANNUALISED",
  annual_allowance_minor: 3_600_000,
  deduct_social_insurance: false,
  effective_from: "2026-01-01",
  effective_to: null,
  source_note: null,
  rule_state: "PROVISIONAL",
  created_by_user_id: "creator",
  confirmed_by_user_id: null,
  confirmed_at: null,
  confirmation_note: null,
  bands: [
    { id: "b1", sort_order: 1, width_minor: 2_400_000, rate: "0.1000" },
    { id: "b2", sort_order: 2, width_minor: null, rate: "0.2800" },
  ],
};

function data(overrides: Partial<TablesData> = {}): TablesData {
  return {
    tables: { state: "ready", data: { ...EMPTY_TABLES, tax_tables: [TAX] } },
    enrolments: { state: "ready", data: { data: [] } },
    people: new Map([["creator", "Synthetic Creator"]]),
    ...overrides,
  } as TablesData;
}

function renderView(access: PayrollAccess, view: TablesData) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TablesView
        access={access}
        data={view}
        employees={[]}
        organisationId="gaa"
        securityUrl={SECURITY}
      />
    </QueryClientProvider>
  );
}

const CREATED_BY = /Created by Synthetic Creator, not confirmed/;
const BANDS = /Bands: 10%, 28%/;

const server = setupServer();
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("TablesView states", () => {
  it("shows no access and no tables when the person cannot read amounts", () => {
    renderView(NONE, data());
    expect(screen.getByText(NO_ACCESS_TEXT)).toBeTruthy();
    expect(screen.queryByText("PAYE income tax")).toBeNull();
  });

  it("shows the MFA-required state when the read needs a fresh sign-in", () => {
    renderView(ALL, data({ tables: { state: "mfa" } }));
    expect(screen.getByText("Two-step verification is needed")).toBeTruthy();
  });

  it("shows empty states for tables with nothing saved", () => {
    renderView(ALL, data({ tables: { state: "ready", data: EMPTY_TABLES } }));
    expect(screen.getAllByText("Nothing saved yet.").length).toBeGreaterThan(0);
  });

  it("shows a saved table as PROVISIONAL with who created it and the bands", () => {
    renderView(ALL, data());
    expect(screen.getByText("PAYE income tax")).toBeTruthy();
    expect(screen.getByText("PROVISIONAL")).toBeTruthy();
    expect(screen.getByText(CREATED_BY)).toBeTruthy();
    expect(screen.getByText(BANDS)).toBeTruthy();
  });

  it("offers confirm only with the confirm permission", () => {
    renderView({ ...ALL, canConfirmTables: false }, data());
    expect(
      screen.queryByRole("button", { name: "Confirm or reopen" })
    ).toBeNull();
  });

  it("asks for two-step verification when a confirmation is refused for it", async () => {
    server.use(
      http.put(`${API}/statutory-tables/tax/:tableId/state`, () =>
        HttpResponse.json({ detail: MFA_DETAIL }, { status: 403 })
      )
    );
    const { container } = renderView(ALL, data());
    fireEvent.click(screen.getByRole("button", { name: "Confirm or reopen" }));
    fireEvent.change(
      container.querySelector("input[id^=note-]") as HTMLInputElement,
      {
        target: { value: "GAA payslip, March" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText(MFA_TEXT)).toBeTruthy());
  });
});
