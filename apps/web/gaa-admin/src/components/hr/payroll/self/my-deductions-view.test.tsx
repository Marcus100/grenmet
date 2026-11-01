import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MyDeductionsView } from "./my-deductions-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const CONFIRMED_ON = /You confirmed this on/;
const AMOUNT_OR_CURRENCY = /XCD|EC\$/;

const server = setupServer();
beforeAll(() => {
  configureApiClient({ baseURL: "http://localhost" });
  server.listen({ onUnhandledRequest: "error" });
});
afterAll(() => server.close());

const ROW = {
  id: "d1",
  deduction_code: "UNION",
  deduction_name: "Union dues",
  effective_from: "2026-01-01",
  effective_to: null,
  authorisation_reference: "AUTH-1",
  employee_confirmed_at: null,
};

function renderView(
  canReadSelf: boolean,
  data: Parameters<typeof MyDeductionsView>[0]["data"]
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MyDeductionsView
        canReadSelf={canReadSelf}
        data={data}
        securityUrl="https://auth.example/security"
      />
    </QueryClientProvider>
  );
}

describe("MyDeductionsView states", () => {
  it("shows no access without the self-service permission", () => {
    renderView(false, { state: "forbidden" });
    expect(screen.getByText("No access to your deductions")).toBeTruthy();
  });

  it("shows an empty state when nothing is set up", () => {
    renderView(true, { state: "ready", data: { data: [] } });
    expect(screen.getByText("No deductions are set up for you.")).toBeTruthy();
  });

  it("asks the employee to confirm an unconfirmed deduction", () => {
    renderView(true, { state: "ready", data: { data: [ROW] } });
    expect(screen.getByText("Union dues")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "I confirm this deduction" })
    ).toBeTruthy();
  });

  it("shows the confirmation date once confirmed, with no amounts", () => {
    renderView(true, {
      state: "ready",
      data: {
        data: [{ ...ROW, employee_confirmed_at: "2026-02-01T09:00:00Z" }],
      },
    });
    expect(
      screen.queryByRole("button", { name: "I confirm this deduction" })
    ).toBeNull();
    expect(screen.getByText(CONFIRMED_ON)).toBeTruthy();
    expect(screen.queryByText(AMOUNT_OR_CURRENCY)).toBeNull();
  });

  it("shows the two-step verification state when the list needs a fresh sign-in", () => {
    renderView(true, { state: "mfa" });
    expect(screen.getByText("Two-step verification is needed")).toBeTruthy();
  });
});
