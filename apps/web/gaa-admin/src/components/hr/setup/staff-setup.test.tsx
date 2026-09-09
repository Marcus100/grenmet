import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { StaffSetupManager } from "./staff-setup";

const BASE = "http://localhost";
const MISSING_GRADES = /No grades are configured/;
const user = {
  user_id: "00000000-0000-4000-8000-000000000001",
  name: "Test Staff",
  email: "staff@example.com",
  number: "",
  department_id: "meteorological_department",
  grade_id: "",
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
function renderSetup() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <StaffSetupManager />
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
it("saves a grade with incomplete personnel details and preserves account enablement", async () => {
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
