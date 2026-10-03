import { configureApiClient } from "@barrelsgd/api-client";
import { SessionUserProvider } from "@barrelsgd/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
import { EMPTY_ABSENTEE } from "./absentee-document";
import { AbsenteeEditor, buildAbsenteeReportPayload } from "./absentee-editor";
import { AbsenteeSubmissions } from "./absentee-submissions";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const BASE = "http://localhost";

const server = setupServer(
  http.post(
    `${BASE}/api/v1/hr/absentee-reports/preview-pdf`,
    () =>
      new HttpResponse("%PDF-preview", {
        headers: { "Content-Type": "application/pdf" },
      })
  ),
  http.get(`${BASE}/api/v1/hr/rosters/assignments`, () =>
    HttpResponse.json({ data: [], count: 0 })
  ),
  http.get(`${BASE}/api/v1/hr/signature/me`, () =>
    HttpResponse.json({
      version: "11111111-1111-4111-8111-111111111111",
      image_data_url: "data:image/png;base64,aGVsbG8=",
      updated_at: "2026-09-11T12:00:00Z",
    })
  ),
  http.get(`${BASE}/api/v1/hr/profile/me`, () =>
    HttpResponse.json({
      id: "u-1",
      employment: { department: { id: "dept_met", name: "Met" } },
    })
  ),
  http.get(`${BASE}/api/v1/hr/departments/:departmentId/members`, () =>
    HttpResponse.json({ data: [], count: 0 })
  ),
  http.get(`${BASE}/api/v1/hr/absentee-reports`, () =>
    HttpResponse.json({ data: [], count: 0 })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  navigation.search = "";
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

describe("buildAbsenteeReportPayload", () => {
  it("maps paper checklist labels to API absence reasons", () => {
    const cases: [string, string][] = [
      ["Uncertified Sick", "UNCERTIFIED_SICK"],
      ["Illness on the Job", "ILLNESS_ON_JOB"],
      ["Illness (family member)", "ILLNESS_FAMILY_MEMBER"],
      ["Time Off", "TIME_OFF"],
      ["Other", "OTHER"],
    ];
    for (const [label, reason] of cases) {
      expect(
        buildAbsenteeReportPayload(
          { ...EMPTY_ABSENTEE, reason: label, date: "2026-07-03" },
          "u-1",
          "dept_met"
        ).reason
      ).toBe(reason);
    }
  });

  it("builds the full payload and drops empty notes", () => {
    const payload = buildAbsenteeReportPayload(
      {
        ...EMPTY_ABSENTEE,
        date: "2026-07-03",
        reason: "Time Off",
        notes: "",
      },
      "u-1",
      "dept_met"
    );
    expect(payload).toEqual({
      user_id: "u-1",
      department_id: "dept_met",
      report_date: "2026-07-03",
      reason: "TIME_OFF",
      notes: undefined,
    });
  });

  it("falls back to OTHER for unknown labels and keeps notes", () => {
    const payload = buildAbsenteeReportPayload(
      { ...EMPTY_ABSENTEE, date: "2026-07-03", reason: "??", notes: "Flu" },
      "u-1",
      "dept_met"
    );
    expect(payload.reason).toBe("OTHER");
    expect(payload.notes).toBe("Flu");
  });
});

describe("AbsenteeEditor (wired)", () => {
  it("blocks a sickness report without details and displays the reason", async () => {
    const user = userEvent.setup();
    wrap(<AbsenteeEditor />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sign & submit" })
      ).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "Sign & submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Provide details"
    );
  });

  it("restores identity and times when a proxy draft is reopened", async () => {
    navigation.search = "draft=ar-proxy";
    server.use(
      http.get(`${BASE}/api/v1/hr/departments/:departmentId/members`, () =>
        HttpResponse.json({
          data: [
            {
              user_id: "u-2",
              full_name: "Colleague",
              first_name: "Colleague",
              last_name: "",
              employment_status: "ACTIVE",
            },
          ],
          count: 1,
        })
      ),
      http.get(`${BASE}/api/v1/hr/absentee-reports`, () =>
        HttpResponse.json({
          data: [
            {
              id: "ar-proxy",
              user_id: "u-2",
              department_id: "dept_met",
              report_date: "2026-09-26",
              reason: "UNCERTIFIED_SICK",
              notes: "Called in sick",
              status: "DRAFT",
              submitted_by_user_id: "u-1",
              expected_shift_code: "N",
              absence_start_time: "22:30",
              absence_end_time: "06:00",
            },
          ],
          count: 1,
        })
      )
    );
    wrap(<AbsenteeEditor />);
    await screen.findByText("Editing saved draft");
    expect(screen.getByLabelText("Employee Name")).toHaveValue("u-2");
    expect(screen.getByLabelText("Department")).toHaveValue("Met");
    expect(screen.getByLabelText("Absence from")).toHaveValue("22:30");
    expect(screen.getByLabelText("Absence to")).toHaveValue("06:00");
    expect(screen.getByLabelText("Reason(s) — details")).toHaveValue(
      "Called in sick"
    );
  });

  it("prefills the expected published shift without replacing entered absence times", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/rosters/assignments`, () =>
        HttpResponse.json({
          data: [{ shift_code: "N", category: "WORK", is_draft: false }],
          count: 1,
        })
      )
    );
    wrap(<AbsenteeEditor />);
    await waitFor(() =>
      expect(screen.getByLabelText("Expected shift")).toHaveValue("N")
    );
    expect(screen.getByLabelText("Absence from")).toHaveValue("");
  });

  it("keeps the reporter as signer while submitting another employee's absence", async () => {
    let posted: Record<string, unknown> | undefined;
    server.use(
      http.get(`${BASE}/api/v1/hr/departments/:departmentId/members`, () =>
        HttpResponse.json({
          data: [
            {
              user_id: "u-2",
              full_name: "Colleague",
              first_name: "Colleague",
              last_name: "",
              employment_status: "ACTIVE",
            },
          ],
          count: 1,
        })
      ),
      http.post(`${BASE}/api/v1/hr/absentee-reports`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "proxy-1",
          status: "SUBMITTED",
          ...posted,
        });
      })
    );
    const user = userEvent.setup();
    wrap(<AbsenteeEditor />);
    await screen.findByRole("option", { name: "Colleague" });
    await user.selectOptions(screen.getByLabelText("Employee Name"), "u-2");
    await user.type(
      screen.getByLabelText("Reason(s) — details"),
      "Called in sick"
    );
    await user.click(screen.getByRole("button", { name: "Sign & submit" }));
    await waitFor(() => expect(posted?.user_id).toBe("u-2"));
    expect(posted?.signature_version).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("displays the server's expected validation detail", async () => {
    server.use(
      http.post(`${BASE}/api/v1/hr/absentee-reports`, () =>
        HttpResponse.json(
          { detail: "Supervisor review is not configured" },
          { status: 400 }
        )
      )
    );
    const user = userEvent.setup();
    wrap(<AbsenteeEditor />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sign & submit" })
      ).toBeEnabled()
    );
    await user.type(screen.getByLabelText("Reason(s) — details"), "Sick");
    await user.click(screen.getByRole("button", { name: "Sign & submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Supervisor review is not configured"
    );
  });

  it("submits a filled report to HR with the mapped payload", async () => {
    const posted: unknown[] = [];
    server.use(
      http.post(`${BASE}/api/v1/hr/absentee-reports`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posted.push(body);
        return HttpResponse.json(
          {
            id: "ar-1",
            user_id: "u-1",
            department_id: "dept_met",
            report_date: body.report_date,
            reason: body.reason,
            notes: body.notes ?? null,
            contact_attempted: false,
            replacement_arranged: false,
            status: "SUBMITTED",
            submitted_by_user_id: "u-1",
            created_at: "2026-07-04T12:00:00+0000",
            updated_at: "2026-07-04T12:00:00+0000",
          },
          { status: 201 }
        );
      })
    );

    const user = userEvent.setup();
    wrap(<AbsenteeEditor />);
    await screen.findByRole("button", { name: "Sign & submit" });

    // Pick today in the DatePicker popover calendar.
    const today = new Date();
    await user.click(screen.getByLabelText("Date"));
    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(format(today, "MMMM do, yyyy")),
      })
    );

    await user.type(screen.getByLabelText("Reason(s) — details"), "Flu");

    await user.click(screen.getByRole("button", { name: "Sign & submit" }));

    await waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    expect(posted[0]).toEqual({
      user_id: "u-1",
      department_id: "dept_met",
      report_date: format(today, "yyyy-MM-dd"),
      reason: "UNCERTIFIED_SICK",
      notes: "Flu",
      as_draft: false,
      signature_version: "11111111-1111-4111-8111-111111111111",
      co_approver_user_ids: [],
    });
  }, 20_000);
});

describe("AbsenteeSubmissions", () => {
  it("lists my absentee reports with status", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/absentee-reports`, () =>
        HttpResponse.json({
          data: [
            {
              id: "ar-1",
              user_id: "u-1",
              department_id: "dept_met",
              report_date: "2026-07-03",
              reason: "TIME_OFF",
              notes: "Family matter",
              contact_attempted: false,
              replacement_arranged: false,
              status: "SUBMITTED",
              submitted_by_user_id: "u-1",
              created_at: "2026-07-04T12:00:00+0000",
              updated_at: "2026-07-04T12:00:00+0000",
            },
          ],
          count: 1,
        })
      )
    );

    wrap(<AbsenteeSubmissions />);
    expect(await screen.findByText("TIME_OFF")).toBeInTheDocument();
    expect(screen.getByText("2026-07-03")).toBeInTheDocument();
    expect(screen.getByText("Family matter")).toBeInTheDocument();
    expect(screen.getByText("SUBMITTED")).toBeInTheDocument();
  }, 20_000);
});
