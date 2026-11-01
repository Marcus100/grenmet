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
import { PayrollWorkspace } from "./payroll-workspace";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => "/hr/payroll",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

const BASE = "http://localhost";
const PATTERN_0 = /No pay calendar yet/;
const PATTERN_1 = /Quantities only/;
const PROFILE_CALENDAR = "Pay calendar: Synthetic Person";
const PROFILE_REASON = "Override reason: Synthetic Person";
const API = `${BASE}/api/v1/hr/payroll`;

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/organisations`, () =>
    HttpResponse.json([{ id: "new_org", code: "NEW", name: "Synthetic Org" }])
  ),
  http.get(`${API}/calendars`, () => HttpResponse.json({ data: [] })),
  http.get(`${API}/periods`, () => HttpResponse.json({ data: [], count: 0 })),
  http.get(`${API}/items`, () =>
    HttpResponse.json({ data: [], overtime_bands_available: false })
  ),
  http.get(`${API}/department-settings`, () =>
    HttpResponse.json({
      data: [
        {
          department_id: "acc",
          department_name: "Accounts",
          shift_worker_default: false,
        },
      ],
    })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  search = "";
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PayrollWorkspace />
    </QueryClientProvider>
  );
}

describe("PayrollWorkspace", () => {
  it("shows an empty period list and the calendar set-up for a new organisation", async () => {
    renderWorkspace();
    expect(await screen.findByText(PATTERN_0)).toBeVisible();
    expect(await screen.findByText("No pay periods yet.")).toBeVisible();
    expect(
      screen.getByRole("option", { name: "Accounts" })
    ).toBeInTheDocument();
    expect(screen.getByText(PATTERN_1)).toBeVisible();
  });

  it("keeps an empty pay item catalogue visible", async () => {
    search = "tab=items";
    renderWorkspace();
    expect(
      await screen.findByText("No pay items for this organisation yet.")
    ).toBeVisible();
  });

  it("explains a missing payroll permission", async () => {
    search = "tab=items";
    server.use(
      http.get(`${API}/items`, () =>
        HttpResponse.json({ detail: "Pay period not found" }, { status: 404 })
      )
    );
    renderWorkspace();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have payroll access"
    );
  });
});

const PROFILE = {
  user_id: "u1",
  employee_name: "Synthetic Person",
  employee_number: "E1",
  department_id: "acc",
  calendar_id: null,
  shift_worker: null,
  effective_shift_worker: false,
  payroll_reference: null,
};
const CALENDARS = [
  {
    id: "c-month",
    organisation_id: "new_org",
    name: "Monthly calendar",
    frequency: "MONTHLY",
    approval_department_id: "acc",
    is_default: false,
    anchor_date: null,
    rule_state: "PROVISIONAL",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "c-fort",
    organisation_id: "new_org",
    name: "Fortnightly calendar",
    frequency: "FORTNIGHTLY",
    approval_department_id: "acc",
    is_default: true,
    anchor_date: "2026-10-31",
    rule_state: "PROVISIONAL",
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("PayrollWorkspace pay profiles", () => {
  it("offers pay calendars and asks for a reason only on a longer-than-fortnightly calendar", async () => {
    search = "tab=profiles";
    server.use(
      http.get(`${API}/profiles`, () =>
        HttpResponse.json({ data: [PROFILE], count: 1 })
      ),
      http.get(`${API}/calendars`, () => HttpResponse.json({ data: CALENDARS }))
    );
    renderWorkspace();
    const calendar = await screen.findByRole("combobox", {
      name: PROFILE_CALENDAR,
    });
    expect(
      screen.getByRole("option", { name: "Fortnightly calendar" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: PROFILE_REASON })).toBeNull();
    fireEvent.change(calendar, { target: { value: "c-month" } });
    expect(
      screen.getByRole("textbox", { name: PROFILE_REASON })
    ).toBeInTheDocument();
    fireEvent.change(calendar, { target: { value: "c-fort" } });
    expect(screen.queryByRole("textbox", { name: PROFILE_REASON })).toBeNull();
  });

  it("saves the chosen calendar and the override reason", async () => {
    search = "tab=profiles";
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API}/profiles`, () =>
        HttpResponse.json({ data: [PROFILE], count: 1 })
      ),
      http.get(`${API}/calendars`, () =>
        HttpResponse.json({ data: CALENDARS })
      ),
      http.put(`${API}/profiles/u1`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...PROFILE, calendar_id: "c-month" });
      })
    );
    renderWorkspace();
    fireEvent.change(
      await screen.findByRole("combobox", { name: PROFILE_CALENDAR }),
      { target: { value: "c-month" } }
    );
    fireEvent.change(screen.getByRole("textbox", { name: PROFILE_REASON }), {
      target: { value: "Agreed in writing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({
      organisation_id: "new_org",
      calendar_id: "c-month",
      calendar_override_reason: "Agreed in writing",
    });
  });
});
