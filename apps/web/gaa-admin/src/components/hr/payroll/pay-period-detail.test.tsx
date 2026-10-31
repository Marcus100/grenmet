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
import { PayPeriodDetail } from "./pay-period-detail";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const BASE = "http://localhost";
const PATTERN_0 = /Overtime bands are not computed yet/;
const PATTERN_1 = /someone else must approve it/;
const CALL_OUT_OPTION = /Call-out/;
const API = `${BASE}/api/v1/hr/payroll`;
const PERIOD_ID = "p1";

function period(status: string) {
  return {
    id: PERIOD_ID,
    calendar_id: "c1",
    calendar_name: "Monthly (provisional)",
    organisation_id: "gaa",
    start_date: "2026-09-01",
    end_date: "2026-09-30",
    status,
    workflow_instance_id: null,
    review_status: null,
    computed_at: "2026-10-01T12:00:00Z",
    submitted_at: null,
    approved_at: null,
    exported_at: null,
    export_count: 0,
    closed_at: null,
  };
}

let detail: Record<string, unknown>;
let posted: { url: string; body: unknown }[] = [];
let approveStatus = 200;

const LINE = {
  id: "l1",
  run_kind: "REGULAR",
  line_kind: "COMPUTED",
  user_id: "u1",
  employee_name: "Synthetic Person",
  employee_number: "EMP-0001",
  payroll_reference: null,
  department_id: "ops",
  pay_item_id: "i1",
  pay_item_code: "SHIFT_PREMIUM",
  pay_item_name: "Shift premium hours (21:00 to 06:00)",
  unit: "HOURS",
  rule_state: "PROVISIONAL",
  quantity: "7.00",
  work_date: "2026-09-11",
  source_type: "attendance",
  source_id: "a1",
  reason: null,
  adjusts_period_id: null,
  adjusts_line_id: null,
  created_at: "2026-10-01T12:00:00Z",
};

const server = setupServer(
  http.get(`${API}/periods/:id`, () => HttpResponse.json(detail)),
  http.get(`${API}/periods/:id/lines`, () =>
    HttpResponse.json({ data: [LINE], count: 1 })
  ),
  http.get(`${API}/items`, () =>
    HttpResponse.json({
      data: [
        {
          id: "callout",
          organisation_id: "gaa",
          code: "CALL_OUT",
          name: "Call-out",
          kind: "CALL_OUT",
          unit: "COUNT",
          method: "MANUAL",
          params: {},
          effective_from: "2024-04-01",
          effective_to: null,
          rule_state: "PROVISIONAL",
          source_reference: "Memorandum",
          is_active: true,
          accepts_manual_lines: true,
        },
      ],
      overtime_bands_available: false,
    })
  ),
  http.get(`${API}/profiles`, () =>
    HttpResponse.json({
      data: [
        {
          user_id: "u1",
          employee_name: "Synthetic Person",
          employee_number: "EMP-0001",
          department_id: "ops",
          calendar_id: null,
          shift_worker: null,
          effective_shift_worker: false,
          payroll_reference: null,
        },
      ],
      count: 1,
    })
  ),
  http.post(`${API}/periods/:id/approval`, async ({ request }) => {
    posted.push({ url: request.url, body: await request.json() });
    if (approveStatus === 403) {
      return HttpResponse.json(
        {
          detail:
            "Sign in again with your authenticator or recovery code before using privileged staff tools",
        },
        { status: 403 }
      );
    }
    return HttpResponse.json(detail);
  }),
  http.post(`${API}/periods/:id/lines`, async ({ request }) => {
    posted.push({ url: request.url, body: await request.json() });
    return HttpResponse.json(LINE, { status: 201 });
  }),
  http.post(`${API}/periods/:id/export.csv`, ({ request }) => {
    posted.push({ url: request.url, body: null });
    return new HttpResponse("period_start,quantity\r\n", {
      headers: { "Content-Type": "text/csv" },
    });
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  posted = [];
  approveStatus = 200;
  detail = {
    period: period("OPEN"),
    totals: [
      {
        pay_item_id: "i1",
        code: "SHIFT_PREMIUM",
        name: "Shift premium hours (21:00 to 06:00)",
        unit: "HOURS",
        rule_state: "PROVISIONAL",
        run_kind: "REGULAR",
        quantity: "7.00",
        line_count: 1,
      },
    ],
    employee_count: 1,
    line_count: 1,
    allowed_actions: ["compute", "add_line", "submit"],
    prepared_by_caller: false,
    overtime_bands_available: false,
  };
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PayPeriodDetail periodId={PERIOD_ID} />
    </QueryClientProvider>
  );
}

describe("PayPeriodDetail", () => {
  it("shows quantities with provisional labels and keeps empty sections visible", async () => {
    renderDetail();
    const regular = await screen.findByRole("region", { name: "This period" });
    expect(regular).toHaveTextContent("7.00 h");
    expect(regular).toHaveTextContent("Provisional");
    expect(
      screen.getByRole("region", { name: "Corrections to earlier periods" })
    ).toHaveTextContent("No corrections to earlier periods.");
    expect(screen.getByText(PATTERN_0)).toBeVisible();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("tells the preparer someone else must approve", async () => {
    detail = {
      ...detail,
      period: period("IN_REVIEW"),
      allowed_actions: [],
      prepared_by_caller: true,
    };
    renderDetail();
    expect(await screen.findByText(PATTERN_1)).toBeInTheDocument();
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("shows the two-step verification refusal when approving", async () => {
    approveStatus = 403;
    detail = {
      ...detail,
      period: period("IN_REVIEW"),
      allowed_actions: ["approve", "return"],
    };
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign in again with your authenticator"
    );
    expect(posted).toHaveLength(1);
  });

  it("requires a reason before adding a line by hand", async () => {
    renderDetail();
    const form = await screen.findByRole("region", {
      name: "Add a line by hand",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: CALL_OUT_OPTION })
      ).toBeVisible()
    );
    fireEvent.change(screen.getByLabelText("Employee"), {
      target: { value: "u1" },
    });
    fireEvent.change(screen.getByLabelText("Pay item"), {
      target: { value: "callout" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give a reason");
    expect(posted).toEqual([]);
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Recalled after shift" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]?.body).toMatchObject({
      user_id: "u1",
      pay_item_id: "callout",
      quantity: "1",
      reason: "Recalled after shift",
    });
    expect(form).toBeInTheDocument();
  });

  it("exports the CSV of an approved period", async () => {
    detail = {
      ...detail,
      period: period("APPROVED"),
      allowed_actions: ["export"],
    };
    renderDetail();
    expect(
      screen.queryByRole("region", { name: "Add a line by hand" })
    ).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]?.url).toContain("/periods/p1/export.csv");
  });
});
