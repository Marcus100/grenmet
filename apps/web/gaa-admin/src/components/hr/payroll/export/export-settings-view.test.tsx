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
import type { PayrollLoad } from "../load-payroll";
import type { PayrollAccess } from "../payroll-access";
import { ExportSettingsView } from "./export-settings-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const BASE = "http://localhost";
const API = `${BASE}/api/v1/hr/payroll`;
const SECURITY = "https://auth.example/security";
const MFA_DETAIL =
  "Sign in again with your authenticator or recovery code before using privileged staff tools";
const NO_ACCESS_TEXT = "No access to bank and gl export settings";
const MFA_TEXT = /Two-step verification is needed/;
const NOT_SET_TEXT = /Not set/;
const EMPTY_GL = {
  GROSS_PAY_EXPENSE: "",
  EMPLOYER_CONTRIBUTION_EXPENSE: "",
  NET_PAY_PAYABLE: "",
  INCOME_TAX_PAYABLE: "",
  SOCIAL_INSURANCE_PAYABLE: "",
  OTHER_DEDUCTIONS_PAYABLE: "",
};
const SETTINGS = {
  organisation_id: "gaa",
  bank_columns: ["employee_name", "net_amount"],
  gl_accounts: EMPTY_GL,
  available_bank_columns: [
    "employee_number",
    "payroll_reference",
    "employee_name",
    "bank_account",
    "net_amount",
    "net_minor",
    "currency",
    "reference",
  ],
};
const ALL: PayrollAccess = {
  canReadAmounts: true,
  canManageRates: true,
  canConfirmTables: false,
  canPrepare: false,
  canApprove: false,
  canExport: true,
  canReadSelf: false,
};
const READ_ONLY: PayrollAccess = { ...ALL, canManageRates: false };
const NONE: PayrollAccess = {
  ...ALL,
  canExport: false,
  canManageRates: false,
};

const ready = (
  data: typeof SETTINGS = SETTINGS
): PayrollLoad<typeof SETTINGS> => ({ state: "ready", data });

function renderView(
  access: PayrollAccess,
  settings: PayrollLoad<typeof SETTINGS> = ready()
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ExportSettingsView
        access={access}
        organisationId="gaa"
        securityUrl={SECURITY}
        settings={settings}
      />
    </QueryClientProvider>
  );
}

const server = setupServer();
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("ExportSettingsView access", () => {
  it("shows no access when the person cannot read or change the settings", () => {
    renderView(NONE);
    expect(screen.getByText(NO_ACCESS_TEXT)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Save export settings" })
    ).toBeNull();
  });

  it("asks for two-step verification when the settings cannot load", () => {
    renderView(ALL, { state: "mfa" });
    expect(screen.getByText(MFA_TEXT)).toBeTruthy();
  });

  it("shows the current settings read-only to someone who can export but not change them", () => {
    renderView(READ_ONLY);
    expect(screen.getByText("Employee name")).toBeTruthy();
    expect(screen.getAllByText(NOT_SET_TEXT).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Save export settings" })
    ).toBeNull();
  });
});

describe("ExportSettingsView form", () => {
  it("lists every bank column with its plain name and the chosen ones checked", () => {
    renderView(ALL);
    expect(
      screen.getByRole("checkbox", { name: "Payment reference" })
    ).toBeTruthy();
    expect(
      screen
        .getByRole("checkbox", { name: "Employee name" })
        .getAttribute("aria-checked")
    ).toBe("true");
    expect(
      screen
        .getByRole("checkbox", { name: "Payment reference" })
        .getAttribute("aria-checked")
    ).toBe("false");
  });

  it("refuses to save with no bank columns and sends nothing", async () => {
    let requests = 0;
    server.use(
      http.put(`${API}/export-settings`, () => {
        requests += 1;
        return HttpResponse.json(SETTINGS);
      })
    );
    renderView(ALL);
    fireEvent.click(screen.getByRole("checkbox", { name: "Employee name" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Net amount" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save export settings" })
    );
    expect(
      await screen.findByText("Choose at least one bank file column.")
    ).toBeTruthy();
    expect(requests).toBe(0);
  });

  it("saves columns in the file order and the GL codes", async () => {
    let sent: unknown = null;
    server.use(
      http.put(`${API}/export-settings`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(SETTINGS);
      })
    );
    renderView(ALL);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Payment reference" })
    );
    fireEvent.change(screen.getByLabelText("Net pay payable"), {
      target: { value: "2100-NET" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save export settings" })
    );
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({
      organisation_id: "gaa",
      bank_columns: ["employee_name", "net_amount", "reference"],
      gl_accounts: { ...EMPTY_GL, NET_PAY_PAYABLE: "2100-NET" },
    });
  });

  it("asks for two-step verification when the save is refused for it", async () => {
    server.use(
      http.put(`${API}/export-settings`, () =>
        HttpResponse.json({ detail: MFA_DETAIL }, { status: 403 })
      )
    );
    renderView(ALL);
    fireEvent.click(
      screen.getByRole("button", { name: "Save export settings" })
    );
    expect(await screen.findByText(MFA_TEXT)).toBeTruthy();
  });
});
