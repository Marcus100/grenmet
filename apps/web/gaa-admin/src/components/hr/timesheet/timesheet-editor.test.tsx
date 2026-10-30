import { configureApiClient } from "@barrelsgd/api-client";
import { SessionUserProvider } from "@barrelsgd/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { TimesheetEditor } from "./timesheet-editor";

const BASE = "http://localhost";
const ADD_ENTRY = /add entry/iu;
const SUBMIT_TO_HR = /sign & submit/iu;
const FILL_FROM_ROSTER = /fill from roster/iu;
const ROSTER_NOTE = /2 of 2 rostered shifts added from your published roster/u;
const HOLIDAY_NOTE = /1 rostered day is a public holiday/u;
const NOTHING_ADDED = /0 of 2 rostered shifts added/u;

const PROFILE = {
  id: "u-1",
  employment: {
    department: { id: "dept_met", name: "Meteorological Department" },
  },
};

const EMPTY_TIMESHEETS = { data: [], count: 0 };

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/signed-documents/me`, () =>
    HttpResponse.json({ data: [], count: 0 })
  ),
  http.get(`${BASE}/api/v1/hr/signature/me`, () =>
    HttpResponse.json({
      version: "11111111-1111-4111-8111-111111111111",
      image_data_url: "data:image/png;base64,aGVsbG8=",
      updated_at: "2026-09-11T12:00:00Z",
    })
  ),
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

  it("locks the profile department and shows it in the preview only after Preview", async () => {
    const user = userEvent.setup();
    renderEditor();

    const department = screen.getByLabelText("Department") as HTMLInputElement;
    await waitFor(() =>
      expect(department.value).toBe("Meteorological Department")
    );
    expect(department).toHaveAttribute("readonly");
    expect(screen.getByText("From your staff profile")).toBeInTheDocument();

    // Only the hidden print copy exists until the user asks for a preview.
    const beforePreview = screen.getAllByText("Meteorological Department");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(
      screen.getAllByText("Meteorological Department").length
    ).toBeGreaterThan(beforePreview.length);
  });

  it.each([false, true])(
    "submits the entries and reuses the saved draft on retry (%s)",
    async (failFirst) => {
      const posted: unknown[] = [];
      const submitted: unknown[] = [];
      server.use(
        http.post(`${BASE}/api/v1/hr/timesheets`, async ({ request }) => {
          posted.push(await request.json());
          return HttpResponse.json(
            {
              timesheet: {
                id: "ts-1",
                user_id: "u-1",
                department_id: "dept_met",
                period_start: "2026-07-01",
                period_end: "2026-07-01",
                status: "DRAFT",
                created_at: "2026-07-04T00:00:00+0000",
                updated_at: "2026-07-04T00:00:00+0000",
              },
              entries: [],
            },
            { status: 201 }
          );
        }),
        http.patch(
          `${BASE}/api/v1/hr/timesheets/ts-1/submit`,
          async ({ request }) => {
            submitted.push(await request.json());
            if (failFirst && submitted.length === 1)
              return HttpResponse.json(
                { detail: "Temporary submission failure" },
                { status: 409 }
              );
            return HttpResponse.json({
              id: "ts-1",
              status: "SUBMITTED",
              submitted_at: "2026-09-07T02:30:00Z",
            });
          }
        )
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
      if (failFirst) {
        await waitFor(() => expect(submitted).toHaveLength(1));
        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: SUBMIT_TO_HR })
          ).toBeEnabled()
        );
        await user.click(screen.getByRole("button", { name: SUBMIT_TO_HR }));
      }
      expect(
        (await screen.findAllByText("06 Sept 2026")).length
      ).toBeGreaterThan(0);
      expect(submitted).toEqual(
        failFirst
          ? [
              {
                mode: "SELF",
                signature_version: "11111111-1111-4111-8111-111111111111",
              },
              {
                mode: "SELF",
                signature_version: "11111111-1111-4111-8111-111111111111",
              },
            ]
          : [
              {
                mode: "SELF",
                signature_version: "11111111-1111-4111-8111-111111111111",
              },
            ]
      );
      expect(posted).toHaveLength(1);
      expect(screen.getByRole("button", { name: SUBMIT_TO_HR })).toBeDisabled();
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
    }
  );

  it("fills entries from the published roster without duplicating existing dates", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/timesheets/prefill`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("period")).toBe("2026-07");
        return HttpResponse.json({
          department_id: "dept_met",
          period: "2026-07",
          period_start: "2026-07-01",
          period_end: "2026-07-31",
          roster_published: true,
          entries: [
            {
              entry_date: "2026-07-06",
              shift_code: "M",
              shift_label: "Morning",
              start_time: "05:30",
              end_time: "14:00",
              roster_hours: "8.50",
              roster_assignment_id: "a1",
              availability: "SCHEDULED",
              holiday_name: "Test Day",
              holiday_provisional: true,
            },
            {
              entry_date: "2026-07-07",
              shift_code: "M",
              shift_label: "Morning",
              start_time: "05:30",
              end_time: "14:00",
              roster_hours: "8.50",
              roster_assignment_id: "a2",
              availability: "LEAVE",
            },
          ],
        });
      })
    );
    const user = userEvent.setup();
    renderEditor();

    const month = await screen.findByLabelText("Roster month");
    fireEvent.change(month, { target: { value: "2026-07" } });
    await user.click(screen.getByRole("button", { name: FILL_FROM_ROSTER }));

    expect(await screen.findByText("Entry 2")).toBeInTheDocument();
    expect(screen.queryByText("Entry 3")).not.toBeInTheDocument();
    expect(screen.getAllByDisplayValue("8.50")).toHaveLength(5);
    expect(screen.getByDisplayValue("M - Approved leave")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(
        "M - Public holiday: Test Day (provisional, HR to verify)"
      )
    ).toBeInTheDocument();
    expect(screen.getByText(HOLIDAY_NOTE)).toBeInTheDocument();
    expect(screen.getByDisplayValue("July 2026")).toBeInTheDocument();
    expect(screen.getByText(ROSTER_NOTE)).toBeInTheDocument();

    // A second fill adds nothing: both dates are already on the sheet.
    await user.click(screen.getByRole("button", { name: FILL_FROM_ROSTER }));
    await screen.findByText(NOTHING_ADDED);
    expect(screen.queryByText("Entry 3")).not.toBeInTheDocument();
  });
});
