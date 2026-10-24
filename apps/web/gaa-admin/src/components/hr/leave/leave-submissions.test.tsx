import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { LeaveSubmissions } from "./leave-submissions";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/audit/record-history", () => ({
  RecordHistoryButton: () => <button type="button">History</button>,
}));

const request = (overrides: Record<string, unknown>) => ({
  id: "r1",
  user_id: "u1",
  department_id: "dept_met",
  leave_type: "VACATION",
  start_date: "2026-07-01",
  end_date: "2026-07-02",
  days_requested: "1.0",
  submitted_at: "2026-06-20T10:00:00Z",
  ...overrides,
});

let rows: Record<string, unknown>[] = [];
const server = setupServer(
  http.get("http://localhost/api/v1/hr/leave-requests/me", () =>
    HttpResponse.json({ data: rows, count: rows.length })
  )
);
beforeAll(() => {
  configureApiClient({ baseURL: "http://localhost" });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <LeaveSubmissions />
    </QueryClientProvider>
  );
}

it("shows a returned request with its reason and lets the author edit but not delete it", async () => {
  rows = [
    request({
      status: "RETURNED",
      workflow_status: "RETURNED",
      returned_reason: "Dates clash with the roster",
    }),
  ];
  show();
  expect(await screen.findByText("Returned")).toBeInTheDocument();
  expect(screen.getByText("Dates clash with the roster")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Edit/ })).toHaveAttribute(
    "href",
    "/hr/leave?draft=r1"
  );
  expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
});

it("keeps a rejected request final: no edit, no reason", async () => {
  rows = [request({ status: "REJECTED", workflow_status: "REJECTED" })];
  show();
  expect(await screen.findByText("Rejected")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Edit/ })).toBeNull();
});

it("lets the author edit and delete a draft", async () => {
  rows = [request({ status: "DRAFT", submitted_at: null })];
  show();
  expect(await screen.findByText("Draft")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Edit/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Delete/ })).toBeInTheDocument();
});
