import { configureApiClient } from "@grenmet/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DutyRoster } from "./duty-roster";

const BASE = "http://localhost";
const SAVE_ONE_LABEL = /Save \(1\)/;

const CATALOG = {
  data: [
    {
      code: "M",
      label: "Morning",
      category: "WORK",
      start_time: "05:30",
      end_time: "14:00",
      ends_next_day: false,
      counts_as_work_hours: true,
      needs_reason: false,
      needs_approval: false,
      is_active: true,
    },
    {
      code: "E",
      label: "Evening",
      category: "WORK",
      start_time: "14:00",
      end_time: "22:30",
      ends_next_day: false,
      counts_as_work_hours: true,
      needs_reason: false,
      needs_approval: false,
      is_active: true,
    },
    {
      code: "V",
      label: "Vacation",
      category: "LEAVE",
      start_time: null,
      end_time: null,
      ends_next_day: false,
      counts_as_work_hours: false,
      needs_reason: false,
      needs_approval: true,
      is_active: true,
    },
  ],
  count: 3,
};

const DEPARTMENTS = {
  data: [{ id: "dept_met", name: "Meteorological Department" }],
  count: 1,
};

const MEMBERS = {
  data: [
    {
      user_id: "11111111-1111-4111-8111-111111111111",
      first_name: "Gerad",
      last_name: "Tamar",
      employee_number: "E001",
      position: "Manager",
      employment_status: "ACTIVE",
    },
    {
      user_id: "22222222-2222-4222-8222-222222222222",
      first_name: "Jill",
      last_name: "Charles",
      employee_number: "E002",
      position: "Observer",
      employment_status: "ACTIVE",
    },
  ],
  count: 2,
};

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();
const pad = (n: number) => String(n).padStart(2, "0");
const monthStart = `${year}-${pad(month + 1)}-01`;
const monthEnd = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;

const PERIOD = {
  id: "33333333-3333-4333-8333-333333333333",
  department_id: "dept_met",
  period_start: monthStart,
  period_end: monthEnd,
  status: "DRAFT",
  created_by_user_id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-06-25T12:00:00+0000",
  updated_at: "2026-06-25T12:00:00+0000",
};

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/rosters/shifts`, () =>
    HttpResponse.json(CATALOG)
  ),
  http.get(`${BASE}/api/v1/hr/departments`, () =>
    HttpResponse.json(DEPARTMENTS)
  ),
  http.get(`${BASE}/api/v1/hr/departments/dept_met/members`, () =>
    HttpResponse.json(MEMBERS)
  ),
  http.get(`${BASE}/api/v1/hr/rosters/periods`, () =>
    HttpResponse.json({ data: [PERIOD], count: 1 })
  ),
  http.get(`${BASE}/api/v1/hr/rosters/periods/${PERIOD.id}`, () =>
    HttpResponse.json({
      period: PERIOD,
      assignments: [
        {
          id: "a1",
          roster_period_id: PERIOD.id,
          user_id: MEMBERS.data[0].user_id,
          assignment_date: `${year}-${pad(month + 1)}-02`,
          shift_code: "E",
          remarks: null,
        },
      ],
    })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderRoster() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DutyRoster />
    </QueryClientProvider>
  );
}

describe("DutyRoster (wired)", () => {
  it("renders members, legend from the catalog, and saved assignments", async () => {
    renderRoster();

    expect(await screen.findByText("G. Tamar")).toBeInTheDocument();
    expect(screen.getByText("J. Charles")).toBeInTheDocument();
    expect(await screen.findByText("0530–1400 hrs")).toBeInTheDocument();
    expect(screen.getByText("Vacation")).toBeInTheDocument();
    expect(await screen.findByText("DRAFT")).toBeInTheDocument();

    const row = screen.getByText("G. Tamar").closest("tr");
    if (!row) throw new Error("Expected a roster row for G. Tamar");
    await waitFor(() => {
      const cells = within(row).getAllByRole("button");
      expect(cells[1].textContent).toBe("E");
    });
  }, 20_000);

  it("cycles a cell locally and posts only pending edits on save", async () => {
    let bulkBody: unknown;
    server.use(
      http.post(
        `${BASE}/api/v1/hr/rosters/assignments/bulk`,
        async ({ request }) => {
          bulkBody = await request.json();
          return HttpResponse.json([]);
        }
      )
    );
    renderRoster();

    const row = (await screen.findByText("G. Tamar")).closest("tr");
    if (!row) throw new Error("Expected a roster row for G. Tamar");
    const firstCell = within(row).getAllByRole("button")[0];

    expect(firstCell.textContent).toBe("");
    fireEvent.click(firstCell);
    expect(firstCell.textContent).toBe("M");
    fireEvent.click(firstCell);
    expect(firstCell.textContent).toBe("E");

    fireEvent.click(screen.getByRole("button", { name: SAVE_ONE_LABEL }));
    await waitFor(() => {
      expect(bulkBody).toBeTruthy();
    });
    expect(bulkBody).toEqual({
      roster_period_id: PERIOD.id,
      assignments: [
        {
          user_id: MEMBERS.data[0].user_id,
          assignment_date: `${year}-${pad(month + 1)}-01`,
          shift_code: "E",
        },
      ],
    });
  }, 20_000);

  it("discards pending edits without touching server state", async () => {
    renderRoster();

    const row = (await screen.findByText("G. Tamar")).closest("tr");
    if (!row) throw new Error("Expected a roster row for G. Tamar");
    const firstCell = within(row).getAllByRole("button")[0];

    fireEvent.click(firstCell);
    expect(firstCell.textContent).toBe("M");

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(firstCell.textContent).toBe("");
  }, 20_000);
});
