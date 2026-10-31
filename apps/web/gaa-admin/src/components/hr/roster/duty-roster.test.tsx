import { configureApiClient } from "@barrelsgd/api-client";
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
import { nth } from "@/test/nth";
import { DutyRoster } from "./duty-roster";

const BASE = "http://localhost";
const SAVE_ONE_LABEL = /Save \(1\)/;
const APPROVED_ABSENCE_LABEL = /scheduled E, Approved absence/;

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

const RULE_CHECK_PATH = `${BASE}/api/v1/hr/rosters/periods/${PERIOD.id}/rule-check`;
const EMPTY_RULE_CHECK = {
  period_id: PERIOD.id,
  rules: { department_id: "dept_met" },
  violations: [],
  count: 0,
};

const server = setupServer(
  http.get(RULE_CHECK_PATH, () => HttpResponse.json(EMPTY_RULE_CHECK)),
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
          user_id: MEMBERS.data[0]?.user_id,
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
  it("lists roster rule warnings by staff name without blocking publish", async () => {
    server.use(
      http.get(RULE_CHECK_PATH, () =>
        HttpResponse.json({
          ...EMPTY_RULE_CHECK,
          rules: { department_id: "dept_met", min_rest_hours: "11.00" },
          count: 1,
          violations: [
            {
              code: "MIN_REST",
              user_id: MEMBERS.data[0]?.user_id,
              start_date: `${year}-${pad(month + 1)}-03`,
              end_date: `${year}-${pad(month + 1)}-04`,
              observed: "7.00",
              limit: "11.00",
              detail: "7.00 h rest between shifts; minimum is 11.00 h",
            },
          ],
        })
      )
    );
    renderRoster();
    const warnings = await screen.findByRole("region", {
      name: "Roster rule warnings",
    });
    expect(warnings).toHaveTextContent("1 roster rule warning");
    expect(warnings).toHaveTextContent("G. Tamar");
    expect(warnings).toHaveTextContent("Short rest between shifts");
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("shows a clear empty state when nothing is breached", async () => {
    renderRoster();
    const panel = await screen.findByRole("region", {
      name: "Roster rule warnings",
    });
    await waitFor(() =>
      expect(panel).toHaveTextContent("No roster rule warnings this month")
    );
  });

  it("asks for a reason when publishing breaks a rule, then resends it", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.patch(
        `${BASE}/api/v1/hr/rosters/periods/${PERIOD.id}/publish`,
        async ({ request }) => {
          const text = await request.text();
          const body = text
            ? (JSON.parse(text) as { rule_override_reason?: string })
            : null;
          bodies.push(body);
          if (!body?.rule_override_reason) {
            return HttpResponse.json(
              {
                detail: "1 roster rule warning: give a reason to save anyway",
                code: "ROSTER_RULE_WARNINGS",
                context: "PUBLISH",
                violations: [
                  {
                    code: "MAX_CONSECUTIVE_DAYS",
                    user_id: MEMBERS.data[0]?.user_id,
                    start_date: `${year}-${pad(month + 1)}-02`,
                    end_date: `${year}-${pad(month + 1)}-05`,
                    observed: "4",
                    limit: "3",
                    detail: "4 consecutive shifts; maximum is 3",
                  },
                ],
              },
              { status: 409 }
            );
          }
          return HttpResponse.json({ ...PERIOD, status: "PUBLISHED" });
        }
      )
    );
    renderRoster();
    await screen.findByText("G. Tamar");
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const confirm = await screen.findByRole("dialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Publish" }));

    const warnings = await screen.findByRole("list", { name: "Rule warnings" });
    expect(warnings).toHaveTextContent("G. Tamar");
    expect(warnings).toHaveTextContent("Too many consecutive shifts");
    const publishAnyway = screen.getByRole("button", {
      name: "Publish anyway",
    });
    fireEvent.click(publishAnyway);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "at least 3 characters"
    );
    fireEvent.change(screen.getByLabelText("Reason for saving anyway"), {
      target: { value: "Two officers on sick leave" },
    });
    fireEvent.click(publishAnyway);
    await waitFor(() =>
      expect(bodies.at(-1)).toEqual({
        rule_override_reason: "Two officers on sick leave",
      })
    );
    expect(bodies).toHaveLength(2);
  });

  it("shows an approved exception while retaining the original scheduled shift", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/rosters/periods/${PERIOD.id}`, () =>
        HttpResponse.json({
          period: PERIOD,
          assignments: [
            {
              id: "a1",
              roster_period_id: PERIOD.id,
              user_id: MEMBERS.data[0]?.user_id,
              assignment_date: `${year}-${pad(month + 1)}-02`,
              shift_code: "E",
              availability: "ABSENT",
            },
          ],
        })
      )
    );
    renderRoster();
    const button = await screen.findByRole("button", {
      name: APPROVED_ABSENCE_LABEL,
    });
    expect(button).toHaveTextContent("E*");
    expect(button).toHaveAttribute("title", "Scheduled E · Approved absence");
  });
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
      expect(cells[1]?.textContent).toBe("E");
    });
  });

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
    const firstCell = nth(within(row).getAllByRole("button"));

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
          user_id: MEMBERS.data[0]?.user_id,
          assignment_date: `${year}-${pad(month + 1)}-01`,
          shift_code: "E",
        },
      ],
    });
  });

  it("discards pending edits without touching server state", async () => {
    renderRoster();

    const row = (await screen.findByText("G. Tamar")).closest("tr");
    if (!row) throw new Error("Expected a roster row for G. Tamar");
    const firstCell = nth(within(row).getAllByRole("button"));

    fireEvent.click(firstCell);
    expect(firstCell.textContent).toBe("M");

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(firstCell.textContent).toBe("");
  });
});
