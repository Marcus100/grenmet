import { configureApiClient } from "@grenmet/api-client";
import { SessionUserProvider } from "@grenmet/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import {
  buildLeaveRequestPayload,
  LeaveApplicationEditor,
} from "./leave-application-editor";
import { EMPTY_LEAVE } from "./leave-document";
import { LeaveSubmissions } from "./leave-submissions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const BASE = "http://localhost";

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/profile/me`, () =>
    HttpResponse.json({
      employment: { department: { id: "dept_met", name: "Met" } },
    })
  ),
  http.get(`${BASE}/api/v1/hr/departments/:departmentId/members`, () =>
    HttpResponse.json({ data: [], count: 0 })
  ),
  http.get(`${BASE}/api/v1/hr/leave-requests/me`, () =>
    HttpResponse.json({
      data: [
        {
          id: "lr-1",
          user_id: "u-1",
          department_id: "dept_met",
          leave_type: "VACATION",
          start_date: "2026-08-03",
          end_date: "2026-08-14",
          days_requested: "10",
          status: "SUBMITTED",
          created_at: "2026-07-04T12:00:00+0000",
          updated_at: "2026-07-04T12:00:00+0000",
        },
      ],
      count: 1,
    })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "bypass" });
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

describe("buildLeaveRequestPayload", () => {
  it("maps paper labels to API leave types and drops empty optionals", () => {
    const payload = buildLeaveRequestPayload(
      {
        ...EMPTY_LEAVE,
        leaveType: "Annual Vacation",
        startDate: "2026-08-03",
        endDate: "2026-08-14",
        daysRequested: "10",
        otherReason: "",
      },
      "dept_met"
    );
    expect(payload).toEqual({
      department_id: "dept_met",
      leave_type: "VACATION",
      start_date: "2026-08-03",
      end_date: "2026-08-14",
      days_requested: "10",
      reason: undefined,
    });
  });

  it("falls back to OTHER for unknown labels and keeps the reason", () => {
    const payload = buildLeaveRequestPayload(
      { ...EMPTY_LEAVE, leaveType: "Other", otherReason: "Jury duty" },
      "dept_met"
    );
    expect(payload.leave_type).toBe("OTHER");
    expect(payload.reason).toBe("Jury duty");
  });
});

describe("LeaveApplicationEditor (wired)", () => {
  it("renders the full action bar (reset, save, download, submit)", async () => {
    wrap(<LeaveApplicationEditor />);
    expect(
      await screen.findByRole("button", { name: "Submit" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    // Download PDF appears in the action bar and the document-preview toolbar.
    expect(
      screen.getAllByRole("button", { name: "Download PDF" }).length
    ).toBeGreaterThan(0);
  }, 20_000);

  it("prefills the employee name and department, still editable", async () => {
    wrap(<LeaveApplicationEditor />);
    const nameInput = (await screen.findByLabelText(
      "Employee Name"
    )) as HTMLInputElement;
    // Seeded from the session user + HR profile department.
    await waitFor(() => expect(nameInput.value).toBe("Tester"));
    expect(
      (screen.getByLabelText("Department") as HTMLInputElement).value
    ).toBe("Met");
    // Fields remain editable — a user edit overrides the prefill.
    fireEvent.change(nameInput, { target: { value: "Someone Else" } });
    expect(nameInput.value).toBe("Someone Else");
  }, 20_000);
});

describe("LeaveSubmissions", () => {
  it("lists my leave requests with status", async () => {
    wrap(<LeaveSubmissions />);
    expect(await screen.findByText("VACATION")).toBeInTheDocument();
    expect(screen.getByText("2026-08-03")).toBeInTheDocument();
    expect(screen.getByText("SUBMITTED")).toBeInTheDocument();
  }, 20_000);
});
