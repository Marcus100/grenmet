import { configureApiClient } from "@grenmet/api-client";
import { SessionUserProvider } from "@grenmet/auth";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const BASE = "http://localhost";

const server = setupServer(
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
afterEach(() => server.resetHandlers());
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
  it("renders the full action bar (reset, save, download, submit)", async () => {
    wrap(<AbsenteeEditor />);
    expect(
      await screen.findByRole("button", { name: "Submit" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Download PDF" }).length
    ).toBeGreaterThan(0);
  }, 20_000);

  it("prefills the employee name and department from the profile", async () => {
    wrap(<AbsenteeEditor />);
    const nameInput = (await screen.findByLabelText(
      "Employee Name"
    )) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe("Tester"));
    expect(
      (screen.getByLabelText("Department") as HTMLInputElement).value
    ).toBe("Met");
  }, 20_000);

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
    await screen.findByRole("button", { name: "Submit" });

    // Pick today in the DatePicker popover calendar.
    const today = new Date();
    await user.click(screen.getByLabelText("Date"));
    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(format(today, "MMMM do, yyyy")),
      })
    );

    await user.type(screen.getByLabelText("Reason(s) — details"), "Flu");

    await user.click(screen.getByRole("button", { name: "Submit" }));

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
