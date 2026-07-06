import { configureApiClient } from "@grenmet/api-client";
import { SessionUserProvider } from "@grenmet/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { TimesheetEditor } from "./timesheet-editor";

const BASE = "http://localhost";
const ADD_ENTRY = /add entry/i;
const SUBMIT_TO_HR = /submit to hr/i;

const PROFILE = {
  id: "u-1",
  employment: {
    department: { id: "dept_met", name: "Meteorological Department" },
  },
};

const EMPTY_TIMESHEETS = { data: [], count: 0 };

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/profile/me`, () => HttpResponse.json(PROFILE)),
  http.get(`${BASE}/api/v1/hr/timesheets/me`, () =>
    HttpResponse.json(EMPTY_TIMESHEETS)
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionUserProvider
        user={{
          id: "u-1",
          email: "tester@barrels.gd",
          full_name: "Tester",
          is_active: true,
          is_superuser: false,
        }}
      >
        <TimesheetEditor />
      </SessionUserProvider>
    </QueryClientProvider>
  );
}

describe("TimesheetEditor", () => {
  it("adds timesheet entries through the array field", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.queryByText("Entry 1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: ADD_ENTRY }));
    expect(screen.getByText("Entry 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: ADD_ENTRY }));
    expect(screen.getByText("Entry 2")).toBeInTheDocument();
  });

  it("mirrors the department field into the preview document", async () => {
    const user = userEvent.setup();
    renderEditor();

    // Wait for prefill to seed the department, then replace it so the assertion
    // isn't racing the profile-driven prefill (which fills "Meteorological
    // Department" and would otherwise concatenate with the typed value).
    const department = screen.getByLabelText("Department") as HTMLInputElement;
    await waitFor(() =>
      expect(department.value).toBe("Meteorological Department")
    );
    await user.clear(department);
    await user.type(department, "Meteorology");

    expect(screen.getAllByText("Meteorology").length).toBeGreaterThanOrEqual(1);
  });

  it("submits the filled entries to HR with the profile department", async () => {
    const posted: unknown[] = [];
    server.use(
      http.post(`${BASE}/api/v1/hr/timesheets`, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json(
          {
            id: "ts-1",
            user_id: "u-1",
            department_id: "dept_met",
            period_start: "2026-07-01",
            period_end: "2026-07-01",
            status: "DRAFT",
            created_at: "2026-07-04T00:00:00+0000",
            updated_at: "2026-07-04T00:00:00+0000",
          },
          { status: 201 }
        );
      })
    );

    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: ADD_ENTRY }));

    // Pick the 15th of the currently shown month from the DATE calendar.
    await user.click(screen.getByLabelText("DATE"));
    const grid = await screen.findByRole("grid");
    await user.click(within(grid).getByText("15"));
    const expectedDate = `${format(new Date(), "yyyy-MM")}-15`;

    await user.type(screen.getByLabelText("ROSTER HRS"), "8");
    await user.type(screen.getByLabelText("ACTUAL HRS"), "7.5");
    await user.type(screen.getByLabelText("REMARKS"), "Left early");

    await user.click(screen.getByRole("button", { name: SUBMIT_TO_HR }));

    await waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    expect(posted[0]).toEqual({
      department_id: "dept_met",
      period_start: expectedDate,
      period_end: expectedDate,
      entries: [
        {
          entry_date: expectedDate,
          roster_hours: "8",
          actual_hours: "7.5",
          comments: "Left early",
        },
      ],
    });
  }, 20_000);
});
