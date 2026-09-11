import { configureApiClient } from "@barrelsgd/api-client";
import { SessionUserProvider } from "@barrelsgd/auth";
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

const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
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
  expect(screen.getAllByText("2026-08-14").length).toBeGreaterThan(0);
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
