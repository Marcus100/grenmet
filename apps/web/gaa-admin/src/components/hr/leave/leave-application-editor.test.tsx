import { configureApiClient } from "@barrelsgd/api-client";
import { SessionUserProvider } from "@barrelsgd/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { toast } from "sonner";
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
  validateLeaveValues,
} from "./leave-application-editor";
import { EMPTY_LEAVE } from "./leave-document";
import { LeaveSubmissions } from "./leave-submissions";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const BASE = "http://localhost";

const server = setupServer(
  http.post(`${BASE}/api/v1/hr/leave-requests/preview-pdf`, () =>
    HttpResponse.text("%PDF-1.7", {
      headers: { "content-type": "application/pdf" },
    })
  ),
  http.get(`${BASE}/api/v1/hr/signed-documents/:documentId/pdf`, () =>
    HttpResponse.text("%PDF-1.7", {
      headers: { "content-type": "application/pdf" },
    })
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
  URL.createObjectURL = vi.fn(() => "blob:hr-preview");
  URL.revokeObjectURL = vi.fn();
  server.listen({ onUnhandledRequest: "bypass" });
});
afterEach(() => {
  vi.clearAllMocks();
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
      professional_appointment_subtype: undefined,
      salary_in_advance: false,
      leave_address: undefined,
      travel_from_date: undefined,
      travel_to_date: undefined,
      requires_acting_appointment: false,
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

  it("keeps applicant details from the paper form in the API payload", () => {
    const payload = buildLeaveRequestPayload(
      {
        ...EMPTY_LEAVE,
        leaveType: "Professional Appointment",
        professionalAppointmentSubtype: "MEDICAL",
        salaryInAdvance: true,
        leaveAddress: "St. George's",
        travelFromDate: "2026-10-01",
        travelToDate: "2026-10-03",
        requiresActingAppointment: true,
      },
      "dept_met"
    );
    expect(payload).toMatchObject({
      leave_type: "PROFESSIONAL_APPOINTMENT",
      professional_appointment_subtype: "MEDICAL",
      salary_in_advance: true,
      leave_address: "St. George's",
      travel_from_date: "2026-10-01",
      travel_to_date: "2026-10-03",
      requires_acting_appointment: true,
    });
  });
});

describe("validateLeaveValues", () => {
  const valid = {
    ...EMPTY_LEAVE,
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    daysRequested: "2",
    leaveType: "Annual Vacation",
  };

  it("rejects reversed dates and invalid requested days", () => {
    expect(validateLeaveValues({ ...valid, leaveType: "" }, false)).toBe(
      "Choose a type of leave"
    );
    expect(
      validateLeaveValues({ ...valid, endDate: "2026-09-30" }, false)
    ).toBe("End date must be on or after start date");
    expect(validateLeaveValues({ ...valid, daysRequested: "0" }, false)).toBe(
      "Enter a positive number of days requested"
    );
  });

  it("requires the paper-form details for selected choices", () => {
    expect(validateLeaveValues({ ...valid, leaveType: "Other" }, false)).toBe(
      "State the reason for other leave"
    );
    expect(
      validateLeaveValues(
        { ...valid, leaveType: "Professional Appointment" },
        false
      )
    ).toBe("Choose the professional appointment type");
    expect(
      validateLeaveValues({ ...valid, travelFromDate: "2026-10-01" }, false)
    ).toBe("Enter both travel dates or leave both blank");
  });
});

describe("LeaveSubmissions", () => {
  it("lists my leave requests with status", async () => {
    wrap(<LeaveSubmissions />);
    expect(await screen.findByText("VACATION")).toBeInTheDocument();
    expect(screen.getByText("2026-08-03")).toBeInTheDocument();
    expect(screen.getByText("SUBMITTED")).toBeInTheDocument();
  }, 20_000);
});

it("keeps a submitted draft printable with the server date and resets cleanly", async () => {
  navigation.search = "draft=lr-draft";
  server.use(
    http.get(`${BASE}/api/v1/hr/leave-requests/me`, () =>
      HttpResponse.json({
        data: [
          {
            id: "lr-draft",
            user_id: "u-1",
            department_id: "dept_met",
            leave_type: "VACATION",
            start_date: "2026-08-03",
            end_date: "2026-08-14",
            days_requested: "10",
            status: "DRAFT",
            created_at: "2020-01-01T00:00:00Z",
            updated_at: "2020-01-01T00:00:00Z",
          },
        ],
        count: 1,
      })
    ),
    http.patch(`${BASE}/api/v1/hr/leave-requests/lr-draft`, () =>
      HttpResponse.json({ id: "lr-draft", status: "DRAFT" })
    ),
    http.post(`${BASE}/api/v1/hr/leave-requests/lr-draft/submit`, () =>
      HttpResponse.json({
        id: "lr-draft",
        status: "SUBMITTED",
        submitted_at: "2026-09-07T02:30:00Z",
      })
    )
  );
  wrap(<LeaveApplicationEditor />);
  await screen.findByText("Editing saved draft");
  expect(screen.getByRole("textbox", { name: "Employee Name" })).toHaveValue(
    "Tester"
  );
  expect(screen.getByRole("textbox", { name: "Department" })).toHaveValue(
    "Met"
  );
  expect(screen.getAllByText("Not submitted").length).toBeGreaterThan(0);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sign & submit" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign & submit" }));
  expect((await screen.findAllByText("06 Sept 2026")).length).toBeGreaterThan(
    0
  );
  expect(
    screen.queryByRole("button", { name: "Sign & submit" })
  ).not.toBeInTheDocument();
  expect(screen.getByText("Leave Application PDF preview")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getAllByText("Not submitted").length).toBeGreaterThan(0);
});

it("requires a saved signature for signing but still permits saving a draft", async () => {
  server.use(
    http.get(`${BASE}/api/v1/hr/signature/me`, () => HttpResponse.json(null))
  );
  wrap(<LeaveApplicationEditor />);
  expect(
    await screen.findByText("Save your signature in your profile")
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Sign & submit" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

it("requires both dates before sending a new leave draft to the API", async () => {
  const create = vi.fn(() => HttpResponse.json({ id: "unexpected-draft" }));
  server.use(http.post(`${BASE}/api/v1/hr/leave-requests`, create));
  wrap(<LeaveApplicationEditor />);
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Department" })).toHaveValue(
      "Met"
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("Start and end dates are required")
  );
  expect(create).not.toHaveBeenCalled();
}, 20_000);

it("shows the API reason when leave submission is rejected", async () => {
  navigation.search = "draft=lr-draft";
  server.use(
    http.get(`${BASE}/api/v1/hr/leave-requests/me`, () =>
      HttpResponse.json({
        data: [
          {
            id: "lr-draft",
            user_id: "u-1",
            department_id: "dept_met",
            leave_type: "VACATION",
            start_date: "2026-10-01",
            end_date: "2026-10-02",
            days_requested: "2",
            status: "DRAFT",
          },
        ],
        count: 1,
      })
    ),
    http.patch(`${BASE}/api/v1/hr/leave-requests/lr-draft`, () =>
      HttpResponse.json({ id: "lr-draft", status: "DRAFT" })
    ),
    http.post(`${BASE}/api/v1/hr/leave-requests/lr-draft/submit`, () =>
      HttpResponse.json(
        { detail: "Verify the opening balance for this leave type" },
        { status: 400 }
      )
    )
  );
  wrap(<LeaveApplicationEditor />);
  await screen.findByText("Editing saved draft");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sign & submit" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign & submit" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "Submission failed: Verify the opening balance for this leave type"
    )
  );
}, 20_000);
