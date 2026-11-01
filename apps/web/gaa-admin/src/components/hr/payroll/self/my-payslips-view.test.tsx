import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MyPayslipsView } from "./my-payslips-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SECURITY = "https://auth.example/security";
const SIGN_IN = /Two-step verification is needed/;
const EMPTY = /No payslips have been issued to you yet/;
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

describe("MyPayslipsView states", () => {
  it("shows no access without the self-service permission", () => {
    render(
      <MyPayslipsView
        canReadSelf={false}
        data={{ state: "forbidden" }}
        securityUrl={SECURITY}
      />
    );
    expect(screen.getByText("No access to your payslips")).toBeTruthy();
  });

  it("asks for two-step verification to see payslips", () => {
    render(
      <MyPayslipsView
        canReadSelf
        data={{ state: "mfa" }}
        securityUrl={SECURITY}
      />
    );
    expect(screen.getByText(SIGN_IN)).toBeTruthy();
  });

  it("shows the empty state before any payslip is issued", () => {
    render(
      <MyPayslipsView
        canReadSelf
        data={{ state: "ready", data: { data: [] } }}
        securityUrl={SECURITY}
      />
    );
    expect(screen.getByText(EMPTY)).toBeTruthy();
  });

  it("lists issued payslips with download", () => {
    render(
      <MyPayslipsView
        canReadSelf
        data={{ state: "ready", data: { data: [SLIP] } }}
        securityUrl={SECURITY}
      />
    );
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
  });
});
