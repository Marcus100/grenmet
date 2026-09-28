import { configureApiClient } from "@barrelsgd/api-client";
import { SessionUserProvider } from "@barrelsgd/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EMPTY_DAILY_STATUS } from "./daily-status-document";
import {
  buildStatusReportPayload,
  DailyStatusEditor,
  validateStatusValues,
} from "./daily-status-editor";
import { StatusSubmissions } from "./status-submissions";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const BASE = "http://localhost";

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/signature/me`, () =>
    HttpResponse.json({
      version: "11111111-1111-4111-8111-111111111111",
      image_data_url: "data:image/png;base64,aGVsbG8=",
      updated_at: "2026-09-11T12:00:00Z",
    })
  ),
  http.get(`${BASE}/api/v1/hr/profile/me`, () =>
    HttpResponse.json({
      employment: { department: { id: "dept_met", name: "Met" } },
    })
  ),
  http.get(`${BASE}/api/v1/hr/departments/:departmentId/members`, () =>
    HttpResponse.json({ data: [], count: 0 })
  ),
  http.post(
    `${BASE}/api/v1/hr/status-reports/preview-pdf`,
    () =>
      new HttpResponse(new Uint8Array([37, 80, 68, 70]), {
        headers: { "Content-Type": "application/pdf" },
      })
  ),
  http.get(`${BASE}/api/v1/hr/status-reports/staffing`, () =>
    HttpResponse.json({ entries: [] })
  ),
  http.get(`${BASE}/api/v1/hr/status-reports`, () =>
    HttpResponse.json({ data: [], count: 0 })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  nav.search = "";
});
afterAll(() => server.close());

function wrap(children: React.ReactNode) {
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
        {children}
      </SessionUserProvider>
    </QueryClientProvider>
  );
}

describe("buildStatusReportPayload", () => {
  it("maps shift labels, yes/no answers, and drops empty optionals", () => {
    const payload = buildStatusReportPayload(
      {
        ...EMPTY_DAILY_STATUS,
        date: "2026-07-15",
        shift: "E",
        allReported: "Yes",
        absenteeism: "",
        comments: "",
      },
      "dept_met"
    );
    expect(payload).toEqual({
      department_id: "dept_met",
      report_date: "2026-07-15",
      shift_code: "E",
      entries: [],
      all_equipment_operational: undefined,
      equipment_issue_reason: undefined,
      equipment_remedy_action: undefined,
      incident_reports_submitted: undefined,
      incident_explanation: undefined,
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
            report: {
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
            entries: [],
          },
          { status: 201 }
        );
      })
    );

    const user = userEvent.setup();
    wrap(<DailyStatusEditor />);
    await screen.findByRole("button", { name: "Sign & submit" });

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

    await user.selectOptions(
      screen.getByLabelText("All persons reported on time?"),
      "Yes"
    );
    await user.selectOptions(
      screen.getByLabelText("All equipment operational?"),
      "Yes"
    );
    await user.selectOptions(
      screen.getByLabelText("All incident / accident reports submitted?"),
      "Yes"
    );
    await user.click(screen.getByRole("button", { name: "Sign & submit" }));

    await waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    expect(posted[0]).toEqual({
      department_id: "dept_met",
      report_date: expectedDate,
      shift_code: "M",
      entries: [],
      all_equipment_operational: true,
      incident_reports_submitted: true,
      all_personnel_reported_on_time: true,
      affected_operations: false,
      personnel_summary: "2 on sick leave",
      general_remarks: "All systems normal",
      as_draft: false,
      signature_version: "11111111-1111-4111-8111-111111111111",
      co_approver_user_ids: [],
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

describe("daily status alignment", () => {
  it("blocks unconfirmed staffing and missing operational explanations", () => {
    const values = {
      ...EMPTY_DAILY_STATUS,
      date: "2026-09-26",
      allReported: "Yes",
      affectedEfficiency: "No",
      equipmentOperational: "Yes",
      incidentsSubmitted: "Yes",
      entries: [{ user_id: "u-1", personnel_status: "UNCONFIRMED" as const }],
    };
    expect(validateStatusValues(values, true)).toContain("Confirm each");
    expect(
      validateStatusValues(
        { ...values, entries: [], equipmentOperational: "No" },
        true
      )
    ).toContain("equipment issue");
    expect(validateStatusValues(values, false)).toBeNull();
  });
  it("prefills approved absence without creating attendance times", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/status-reports/staffing`, () =>
        HttpResponse.json({
          entries: [
            {
              user_id: "u-2",
              employee_name: "Absent Employee",
              scheduled_shift_code: "M",
              availability: "ABSENT",
              personnel_status: "ABSENT",
            },
          ],
        })
      )
    );
    wrap(<DailyStatusEditor />);
    expect(
      await screen.findByText("Absent Employee", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Reported status")).toHaveValue("ABSENT");
    expect(screen.getByLabelText("Arrival")).toHaveValue("");
    expect(screen.getByLabelText("Departure")).toHaveValue("");
  });
  it("restores saved personnel, times and equipment on draft reopen", async () => {
    nav.search = "draft=sr-draft";
    server.use(
      http.get(`${BASE}/api/v1/hr/status-reports/sr-draft`, () =>
        HttpResponse.json({
          report: {
            id: "sr-draft",
            department_id: "dept_met",
            report_date: "2026-09-26",
            shift_code: "N",
            status: "DRAFT",
            all_equipment_operational: false,
            equipment_issue_reason: "Radio offline",
            equipment_remedy_action: "Maintenance notified",
          },
          entries: [
            {
              user_id: "u-2",
              employee_name: "Night Employee",
              personnel_status: "PRESENT",
              arrival_time: "22:00",
              departure_time: "06:00",
              notes: "Handover complete",
            },
          ],
        })
      )
    );
    wrap(<DailyStatusEditor />);
    expect(
      await screen.findByText("Night Employee", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Arrival")).toHaveValue("22:00");
    expect(screen.getByLabelText("Departure")).toHaveValue("06:00");
    expect(screen.getByLabelText("Equipment issue reason")).toHaveValue(
      "Radio offline"
    );
    expect(screen.getByLabelText("Shift")).toHaveValue("N");
  });
});
