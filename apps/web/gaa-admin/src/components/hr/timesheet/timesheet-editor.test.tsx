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
const ADD_ENTRY = /add entry/i;
const SUBMIT_TO_HR = /sign & submit/i;
const FILL_FROM_ROSTER = /fill from roster/i;
const ROSTER_NOTE = /2 of 2 rostered shifts added from your published roster/;
const HOLIDAY_NOTE = /1 rostered day is a public holiday/;
const NOTHING_ADDED = /0 of 2 rostered shifts added/;

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

  it("asks for a reason when submitting breaks a roster rule, then resends it", async () => {
    const submitted: Record<string, unknown>[] = [];
    server.use(
      http.post(`${BASE}/api/v1/hr/timesheets`, () =>
        HttpResponse.json(
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
        )
      ),
      http.patch(
        `${BASE}/api/v1/hr/timesheets/ts-1/submit`,
        async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          submitted.push(body);
          if (!body.rule_override_reason)
            return HttpResponse.json(
              {
                detail: "1 roster rule warning: give a reason to save anyway",
                code: "ROSTER_RULE_WARNINGS",
                context: "TIMESHEET",
                violations: [
                  {
                    code: "MAX_WEEKLY_HOURS",
                    user_id: "u-1",
                    start_date: "2026-07-05",
                    end_date: "2026-07-11",
                    observed: "46.00",
                    limit: "40.00",
                    detail:
                      "46.00 h in the week (Sunday to Saturday); maximum is 40 h",
                  },
                ],
              },
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
    await user.click(screen.getByLabelText("DATE"));
    const grid = await screen.findByRole("grid");
    await user.click(within(grid).getByText("15"));
    await user.type(screen.getByLabelText("ROSTER HRS"), "8");
    await user.click(screen.getByRole("button", { name: SUBMIT_TO_HR }));

    const warnings = await screen.findByRole("list", { name: "Rule warnings" });
    expect(warnings).toHaveTextContent("You");
    expect(warnings).toHaveTextContent("Weekly hours over limit");
    await user.type(
      screen.getByLabelText("Reason for saving anyway"),
      "Hurricane watch overtime"
    );
    await user.click(screen.getByRole("button", { name: "Approve anyway" }));
    await waitFor(() => expect(submitted).toHaveLength(2));
    expect(submitted[1]).toEqual({
      mode: "SELF",
      signature_version: "11111111-1111-4111-8111-111111111111",
      rule_override_reason: "Hurricane watch overtime",
    });
  });

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

const WARNING_409 = {
  detail: "1 roster rule warning: give a reason to save anyway",
  code: "ROSTER_RULE_WARNINGS",
  context: "TIMESHEET",
  violations: [
    {
      code: "MAX_WEEKLY_HOURS",
      user_id: "u-1",
      start_date: "2026-07-05",
      end_date: "2026-07-11",
      observed: "46.00",
      limit: "40.00",
      detail: "46.00 h in the week (Sunday to Saturday); maximum is 40 h",
    },
  ],
};

describe("TimesheetEditor held for roster rule warnings", () => {
  interface Calls {
    created: unknown[];
    deleted: string[];
    submitted: { id: string; body: Record<string, unknown> }[];
  }

  /** Every submit without a reason is held (409); with a reason it succeeds,
   *  or fails with a 500 when `resend` is "fail". */
  function hold(resend: "ok" | "fail" = "ok"): Calls {
    const calls: Calls = { created: [], deleted: [], submitted: [] };
    server.use(
      http.post(`${BASE}/api/v1/hr/timesheets`, async ({ request }) => {
        calls.created.push(await request.json());
        return HttpResponse.json(
          {
            timesheet: {
              id: `ts-${calls.created.length}`,
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
      http.delete(`${BASE}/api/v1/hr/timesheets/:id`, ({ params }) => {
        calls.deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
      http.patch(
        `${BASE}/api/v1/hr/timesheets/:id/submit`,
        async ({ params, request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          calls.submitted.push({ id: String(params.id), body });
          if (!body.rule_override_reason)
            return HttpResponse.json(WARNING_409, { status: 409 });
          if (resend === "fail")
            return HttpResponse.json({ detail: "Down" }, { status: 500 });
          return HttpResponse.json({
            id: String(params.id),
            status: "SUBMITTED",
            submitted_at: "2026-09-07T02:30:00Z",
          });
        }
      )
    );
    return calls;
  }

  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: ADD_ENTRY }));
    await user.click(screen.getByLabelText("DATE"));
    const grid = await screen.findByRole("grid");
    await user.click(within(grid).getByText("15"));
    await user.type(screen.getByLabelText("ROSTER HRS"), "8");
    await user.click(screen.getByRole("button", { name: SUBMIT_TO_HR }));
    await screen.findByRole("list", { name: "Rule warnings" });
  }

  it("Cancel closes the dialog, keeps the editable form and sends nothing more", async () => {
    const calls = hold();
    const user = userEvent.setup();
    renderEditor();
    await fillAndSubmit(user);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("list", { name: "Rule warnings" })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText("ROSTER HRS")).toHaveValue("8");
    expect(screen.getByRole("button", { name: ADD_ENTRY })).toBeEnabled();
    expect(calls.created).toHaveLength(1);
    expect(calls.submitted).toHaveLength(1);
    expect(calls.deleted).toEqual([]);
  });

  it("resubmitting unchanged entries after Cancel reuses the saved draft", async () => {
    const calls = hold();
    const user = userEvent.setup();
    renderEditor();
    await fillAndSubmit(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: SUBMIT_TO_HR }));
    await screen.findByRole("list", { name: "Rule warnings" });

    expect(calls.created).toHaveLength(1);
    expect(calls.deleted).toEqual([]);
    expect(calls.submitted.map((c) => c.id)).toEqual(["ts-1", "ts-1"]);
  });

  it("editing after Cancel replaces the saved draft instead of duplicating it", async () => {
    const calls = hold();
    const user = userEvent.setup();
    renderEditor();
    await fillAndSubmit(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.type(screen.getByLabelText("ACTUAL HRS"), "6");
    await user.click(screen.getByRole("button", { name: SUBMIT_TO_HR }));
    await screen.findByRole("list", { name: "Rule warnings" });

    expect(calls.deleted).toEqual(["ts-1"]);
    expect(calls.created).toHaveLength(2);
    expect(calls.submitted.map((c) => c.id)).toEqual(["ts-1", "ts-2"]);
  });

  it("a failed resend closes the dialog and keeps the typed reason", async () => {
    hold("fail");
    const user = userEvent.setup();
    renderEditor();
    await fillAndSubmit(user);
    await user.type(
      screen.getByLabelText("Reason for saving anyway"),
      "Hurricane watch overtime"
    );
    await user.click(screen.getByRole("button", { name: "Approve anyway" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("list", { name: "Rule warnings" })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: SUBMIT_TO_HR })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: SUBMIT_TO_HR }));
    await screen.findByRole("list", { name: "Rule warnings" });
    expect(screen.getByLabelText("Reason for saving anyway")).toHaveValue(
      "Hurricane watch overtime"
    );
  });
});
