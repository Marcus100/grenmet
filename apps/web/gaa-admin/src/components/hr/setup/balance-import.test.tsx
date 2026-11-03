import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BalanceImport } from "./balance-import";

const BASE = "http://localhost";
const URL = `${BASE}/api/v1/hr/setup/staff/balances/import`;
const CHECK = { name: "Check file" };
const POST = { name: "Post balances" };
const POSTED = /Posted\./u;
const UNKNOWN_TYPE = /Unknown leave type/u;

const ok = (applied: boolean) => ({
  applied,
  total: 1,
  valid: 1,
  invalid: 0,
  rows: [
    {
      row: 2,
      employee_number: "E001",
      leave_type: "VACATION",
      balance: "20.00",
      status: "OK",
      message: null,
    },
  ],
});

let sent: Record<string, unknown>[] = [];
const server = setupServer(
  http.post(URL, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    sent.push(body);
    return HttpResponse.json(ok(body.apply === true));
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  sent = [];
});
afterAll(() => server.close());

function renderImport() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BalanceImport organisationId="gaa" />
    </QueryClientProvider>
  );
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("Source of the figures"), {
    target: { value: "HrPlus leave report" },
  });
  fireEvent.change(screen.getByLabelText("Balances as of"), {
    target: { value: "2026-10-16" },
  });
  fireEvent.change(screen.getByLabelText("Or paste the rows"), {
    target: {
      value: "employee_number,leave_type,balance\nE001,VACATION,20\n",
    },
  });
}

describe("BalanceImport", () => {
  it("keeps both buttons disabled until the form is complete", () => {
    renderImport();
    expect(screen.getByRole("button", CHECK)).toBeDisabled();
    expect(screen.getByRole("button", POST)).toBeDisabled();
  });

  it("checks first, then posts only after a clean check", async () => {
    renderImport();
    fillForm();
    expect(screen.getByRole("button", POST)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", CHECK));
    expect(await screen.findByRole("status")).toHaveTextContent("1 of 1 rows");
    expect(sent[0]).toMatchObject({ apply: false, organisation_id: "gaa" });

    fireEvent.click(screen.getByRole("button", POST));
    await waitFor(() => expect(sent[1]).toMatchObject({ apply: true }));
    expect(await screen.findByText(POSTED)).toBeInTheDocument();
  });

  it("blocks posting while rows have problems", async () => {
    server.use(
      http.post(URL, () =>
        HttpResponse.json({
          applied: false,
          total: 1,
          valid: 0,
          invalid: 1,
          rows: [
            {
              row: 2,
              employee_number: "E001",
              leave_type: "SICKK",
              balance: null,
              status: "ERROR",
              message: "Unknown leave type; use an exact leave type code",
            },
          ],
        })
      )
    );
    renderImport();
    fillForm();
    fireEvent.click(screen.getByRole("button", CHECK));
    expect(await screen.findByText(UNKNOWN_TYPE)).toBeInTheDocument();
    expect(screen.getByRole("button", POST)).toBeDisabled();
  });
});
