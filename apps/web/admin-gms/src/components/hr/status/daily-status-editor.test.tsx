import { configureApiClient } from "@grenmet/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_DAILY_STATUS } from "./daily-status-document";
import {
  buildStatusReportPayload,
  DailyStatusEditor,
} from "./daily-status-editor";
import { StatusSubmissions } from "./status-submissions";

const BASE = "http://localhost";

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/profile/me`, () =>
    HttpResponse.json({
      employment: { department: { id: "dept_met", name: "Met" } },
    })
  ),
  http.get(`${BASE}/api/v1/hr/status-reports`, () =>
    HttpResponse.json({ data: [], count: 0 })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("buildStatusReportPayload", () => {
  it("maps shift labels, yes/no answers, and drops empty optionals", () => {
    const payload = buildStatusReportPayload(
      {
        ...EMPTY_DAILY_STATUS,
        date: "2026-07-15",
        shift: "P.M.",
        absenteeism: "",
        comments: "",
      },
      "dept_met"
    );
    expect(payload).toEqual({
      department_id: "dept_met",
      report_date: "2026-07-15",
      shift_code: "PM",
      shift_period: "PM",
      all_personnel_reported_on_time: true,
      personnel_explanation: undefined,
      affected_operations: false,
      affected_operations_explanation: undefined,
      personnel_summary: undefined,
      general_remarks: undefined,
    });
  });

  it("keeps explanations only when their yes/no gate is open", () => {
    const payload = buildStatusReportPayload(
      {
        ...EMPTY_DAILY_STATUS,
        date: "2026-07-15",
        allReported: "No",
        notReportedExplain: "Two late arrivals",
        affectedEfficiency: "Yes",
        affectedExplain: "Delayed obs",
      },
      "dept_met"
    );
    expect(payload.all_personnel_reported_on_time).toBe(false);
    expect(payload.personnel_explanation).toBe("Two late arrivals");
    expect(payload.affected_operations).toBe(true);
    expect(payload.affected_operations_explanation).toBe("Delayed obs");
  });

  it("discards a stale explanation once the answer flips back", () => {
    const payload = buildStatusReportPayload(
      {
        ...EMPTY_DAILY_STATUS,
        date: "2026-07-15",
        allReported: "Yes",
        notReportedExplain: "Stale text",
      },
      "dept_met"
    );
    expect(payload.personnel_explanation).toBeUndefined();
  });
});

describe("DailyStatusEditor (wired)", () => {
  it("fills the form, submits to HR, and posts the mapped payload", async () => {
    const posted: unknown[] = [];
    server.use(
      http.post(`${BASE}/api/v1/hr/status-reports`, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json(
          {
            id: "sr-1",
            department_id: "dept_met",
            report_date: "2026-07-15",
            shift_code: "AM",
            shift_period: "AM",
            submitted_by_user_id: "u-1",
            status: "SUBMITTED",
            created_at: "2026-07-04T12:00:00+0000",
            updated_at: "2026-07-04T12:00:00+0000",
          },
          { status: 201 }
        );
      })
    );

    const user = userEvent.setup();
    wrap(<DailyStatusEditor />);
    await screen.findByRole("button", { name: "Submit to HR" });

    // DatePicker: open the popover and pick the 15th of the current month.
    await user.click(screen.getByRole("button", { name: "Date" }));
    await user.click(await screen.findByText("15"));
    const now = new Date();
    const expectedDate = format(
      new Date(now.getFullYear(), now.getMonth(), 15),
      "yyyy-MM-dd"
    );

    fireEvent.change(screen.getByLabelText("Absenteeism"), {
      target: { value: "2 on sick leave" },
    });
    fireEvent.change(screen.getByLabelText("Operational status comments"), {
      target: { value: "All systems normal" },
    });

    await user.click(screen.getByRole("button", { name: "Submit to HR" }));

    await waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    expect(posted[0]).toEqual({
      department_id: "dept_met",
      report_date: expectedDate,
      shift_code: "AM",
      shift_period: "AM",
      all_personnel_reported_on_time: true,
      affected_operations: false,
      personnel_summary: "2 on sick leave",
      general_remarks: "All systems normal",
    });
  }, 20_000);
});

describe("StatusSubmissions", () => {
  it("lists submitted reports when the query succeeds", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/status-reports`, () =>
        HttpResponse.json({
          data: [
            {
              id: "sr-1",
              department_id: "dept_met",
              report_date: "2026-07-15",
              shift_code: "AM",
              shift_period: "AM",
              submitted_by_user_id: "u-1",
              affected_operations: false,
              status: "SUBMITTED",
              created_at: "2026-07-04T12:00:00+0000",
              updated_at: "2026-07-04T12:00:00+0000",
            },
          ],
          count: 1,
        })
      )
    );

    wrap(<StatusSubmissions />);
    expect(await screen.findByText("2026-07-15")).toBeInTheDocument();
    expect(screen.getByText("AM")).toBeInTheDocument();
    expect(screen.getByText("SUBMITTED")).toBeInTheDocument();
  }, 20_000);

  it("renders nothing when the list endpoint returns 403", async () => {
    let requested = false;
    server.use(
      http.get(`${BASE}/api/v1/hr/status-reports`, () => {
        requested = true;
        return HttpResponse.json({ detail: "Forbidden" }, { status: 403 });
      })
    );

    const { container } = wrap(<StatusSubmissions />);
    // Let the query settle into its error state, then confirm nothing rendered.
    await waitFor(() => expect(requested).toBe(true));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  }, 20_000);
});
