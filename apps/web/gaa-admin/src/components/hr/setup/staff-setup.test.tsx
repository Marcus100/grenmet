import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { StaffSetupManager } from "./staff-setup";

vi.mock("@barrelsgd/auth", () => ({
  useSessionUser: () => ({ is_superuser: true }),
}));

const BASE = "http://localhost";
const MISSING_GRADES = /No grades are configured/;
const user = {
  user_id: "00000000-0000-4000-8000-000000000001",
  name: "Test Staff",
  email: "staff@example.com",
  number: "",
  department_id: "meteorological_department",
  grade_id: "",
  account_active: true,
  staff_approval_ready: false,
  mailbox_ready: true,
  email_verified: false,
  employment_ready: false,
  employee_number: "MET-004",
  employment_type: "FULL_TIME",
  start_date: null,
  supervisor_id: null,
  status: "draft",
};
const server = setupServer(
  http.get(`${BASE}/api/v1/auth/onboarding/:id`, ({ params }) =>
    HttpResponse.json({
      user_id: params.id,
      email_verified: false,
      password_setup_pending: false,
      activation_pending: false,
      can_issue_activation: true,
      apps: [],
    })
  ),
  http.get(`${BASE}/api/v1/hr/setup/staff`, () => HttpResponse.json([user])),
  http.get(`${BASE}/api/v1/hr/setup/grades`, () => HttpResponse.json([])),
  http.get(`${BASE}/api/v1/hr/setup/policies`, () => HttpResponse.json([])),
  http.get(`${BASE}/api/v1/hr/departments`, () =>
    HttpResponse.json({ data: [], count: 0 })
  )
);
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
function renderSetup(organisationId?: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <StaffSetupManager organisationId={organisationId} />
    </QueryClientProvider>
  );
}
it("explains missing grades and blocks staff saving", async () => {
  renderSetup();
  expect(await screen.findByText(MISSING_GRADES)).toBeInTheDocument();
  fireEvent.click(screen.getByText("Test Staff · draft"));
  expect(
    screen.getByRole("button", { name: "Save staff setup" })
  ).toBeDisabled();
});
it("saves incomplete personnel details and separate mailbox readiness", async () => {
  const saved: unknown[] = [];
  server.use(
    http.get(`${BASE}/api/v1/hr/setup/grades`, () =>
      HttpResponse.json([
        {
          id: "GMS_SENIOR_TECH",
          department_id: "meteorological_department",
          code: "SENIOR_TECH",
          label: "Senior Level Technician",
          rank: 3,
          is_active: true,
        },
      ])
    ),
    http.put(
      `${BASE}/api/v1/hr/setup/staff/${user.user_id}`,
      async ({ request }) => {
        saved.push(await request.json());
        return HttpResponse.json({ message: "Staff setup saved" });
      }
    )
  );
  renderSetup();
  fireEvent.click(await screen.findByText("Test Staff · draft"));
  fireEvent.change(screen.getByLabelText("Grade"), {
    target: { value: "GMS_SENIOR_TECH" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save staff setup" }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({
    grade_id: "GMS_SENIOR_TECH",
    department_id: "meteorological_department",
    employee_number: "MET-004",
    employment_type: "FULL_TIME",
    start_date: null,
    mailbox_ready: true,
  });
});

it("prefills and persists verified service facts and exposes server validation", async () => {
  const saved: unknown[] = [];
  const details = {
    ...user,
    grade_id: "GMS_SENIOR_TECH",
    start_date: "2024-04-01",
    continuous_service_date: "2020-04-01",
    probation_end_date: "2024-10-01",
    probation_completed_date: "2024-11-01",
    service_details_source: "HR appointment and confirmation letters",
  };
  server.use(
    http.get(`${BASE}/api/v1/hr/setup/staff`, () =>
      HttpResponse.json([details])
    ),
    http.get(`${BASE}/api/v1/hr/setup/grades`, () =>
      HttpResponse.json([
        {
          id: "GMS_SENIOR_TECH",
          department_id: user.department_id,
          code: "SENIOR_TECH",
          label: "Senior Level Technician",
          rank: 3,
          is_active: true,
        },
      ])
    ),
    http.put(
      `${BASE}/api/v1/hr/setup/staff/${user.user_id}`,
      async ({ request }) => {
        saved.push(await request.json());
        return HttpResponse.json(
          {
            detail:
              "Provide the HR source for recorded service and probation facts",
          },
          { status: 400 }
        );
      }
    )
  );
  renderSetup();
  fireEvent.click(await screen.findByText("Test Staff · draft"));
  expect(screen.getByLabelText("Verified continuous service date")).toHaveValue(
    "2020-04-01"
  );
  expect(
    screen.getByLabelText("Verified probation completion date")
  ).toHaveValue("2024-11-01");
  fireEvent.change(
    screen.getByLabelText("Verified probation completion date"),
    { target: { value: "2024-12-01" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Save staff setup" }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({
    continuous_service_date: "2020-04-01",
    probation_end_date: "2024-10-01",
    probation_completed_date: "2024-12-01",
    service_details_source: "HR appointment and confirmation letters",
  });
  expect(
    await screen.findByText(
      "Provide the HR source for recorded service and probation facts"
    )
  ).toBeInTheDocument();
});

it("permits staff approval after administrator activation without a mailbox", async () => {
  const approved: string[] = [];
  server.use(
    http.get(`${BASE}/api/v1/hr/setup/staff`, () =>
      HttpResponse.json([
        {
          ...user,
          registration_pending: true,
          staff_approval_ready: true,
          mailbox_ready: false,
          grade_id: "GMS_SENIOR_TECH",
        },
      ])
    ),
    http.post(
      `${BASE}/api/v1/hr/setup/staff/${user.user_id}/approve-registration`,
      () => {
        approved.push(user.user_id);
        return HttpResponse.json({ message: "Staff registration approved" });
      }
    )
  );
  renderSetup();
  fireEvent.click(await screen.findByText("Test Staff · draft"));
  const button = screen.getByRole("button", { name: "Approve staff access" });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(approved).toEqual([user.user_id]));
  expect(
    screen.getByLabelText("Work email inbox provisioned")
  ).not.toBeChecked();
});

it("blocks staff approval while identity activation is incomplete", async () => {
  server.use(
    http.get(`${BASE}/api/v1/hr/setup/staff`, () =>
      HttpResponse.json([
        { ...user, registration_pending: true, grade_id: "GMS_SENIOR_TECH" },
      ])
    )
  );
  renderSetup();
  fireEvent.click(await screen.findByText("Test Staff · draft"));
  expect(
    screen.getByRole("button", { name: "Approve staff access" })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Refresh onboarding status" })
  ).toBeEnabled();
});

it("keeps unassigned accounts separate while grades and policies stay in the selected employer", async () => {
  const staffRequests: URL[] = [];
  const contextRequests: URL[] = [];
  server.use(
    http.get(`${BASE}/api/v1/hr/setup/staff`, ({ request }) => {
      const url = new URL(request.url);
      staffRequests.push(url);
      return HttpResponse.json(
        url.searchParams.get("unassigned") === "true"
          ? [{ ...user, name: "Unassigned Person", organisation_id: null }]
          : [{ ...user, organisation_id: "example" }]
      );
    }),
    http.get(`${BASE}/api/v1/hr/setup/grades`, ({ request }) => {
      contextRequests.push(new URL(request.url));
      return HttpResponse.json([]);
    }),
    http.get(`${BASE}/api/v1/hr/setup/policies`, ({ request }) => {
      contextRequests.push(new URL(request.url));
      return HttpResponse.json([]);
    })
  );
  renderSetup("example");
  await screen.findByText("Test Staff · draft");
  fireEvent.click(
    screen.getByRole("button", {
      name: "Show accounts awaiting employer assignment",
    })
  );
  await screen.findByText("Unassigned Person · draft");
  expect(screen.queryByText("Test Staff · draft")).not.toBeInTheDocument();
  expect(staffRequests[0]?.searchParams.get("organisation_id")).toBe("example");
  const queueRequest = staffRequests.find(
    (url) => url.searchParams.get("unassigned") === "true"
  );
  expect(queueRequest?.searchParams.has("organisation_id")).toBe(false);
  expect(queueRequest).toBeDefined();
  expect(
    contextRequests.every(
      (url) => url.searchParams.get("organisation_id") === "example"
    )
  ).toBe(true);
});

it("assigns an existing employer supervisor during the first unassigned-account save", async () => {
  const supervisorId = "00000000-0000-4000-8000-000000000002";
  const saved: unknown[] = [];
  server.use(
    http.get(`${BASE}/api/v1/hr/setup/staff`, ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get("unassigned") === "true"
          ? [
              {
                ...user,
                name: "New Employee",
                department_id: "",
                organisation_id: null,
              },
            ]
          : [
              {
                ...user,
                user_id: supervisorId,
                name: "Existing Supervisor",
                employment_ready: true,
                status: "active",
                organisation_id: "example",
              },
            ]
      )
    ),
    http.get(`${BASE}/api/v1/hr/setup/grades`, () =>
      HttpResponse.json([
        {
          id: "EXAMPLE_STAFF",
          department_id: "meteorological_department",
          code: "STAFF",
          label: "Staff",
          rank: 1,
          is_active: true,
        },
      ])
    ),
    http.put(
      `${BASE}/api/v1/hr/setup/staff/${user.user_id}`,
      async ({ request }) => {
        saved.push(await request.json());
        return HttpResponse.json({ message: "Staff setup saved" });
      }
    )
  );
  renderSetup("example");
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Show accounts awaiting employer assignment",
    })
  );
  fireEvent.click(await screen.findByText("New Employee · draft"));
  fireEvent.change(screen.getByLabelText("Grade"), {
    target: { value: "EXAMPLE_STAFF" },
  });
  expect(
    screen.getByRole("option", { name: "Existing Supervisor" })
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Supervisor"), {
    target: { value: supervisorId },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save staff setup" }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({
    organisation_id: "example",
    supervisor_id: supervisorId,
    department_id: "meteorological_department",
    grade_id: "EXAMPLE_STAFF",
  });
});
