import {
  configureApiClient,
  type SrcAuthSchemasRolePublic as RolePublic,
  type UserPublic,
} from "@grenmet/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ManageUserDialog } from "./manage-user-dialog";

const BASE = "http://localhost";

const ROLES: RolePublic[] = [
  {
    id: "r-staff",
    name: "staff",
    description: "",
    created_at: "2026-01-01T00:00:00+0000",
    updated_at: "2026-01-01T00:00:00+0000",
  },
];

const USER: UserPublic = {
  id: "u-1",
  email: "jcharles@example.com",
  username: "jcharles",
  first_name: "Jude",
  last_name: "Charles",
  full_name: "Jude Charles",
  is_active: true,
  is_superuser: false,
  created_at: "2026-01-01T00:00:00+0000",
  updated_at: "2026-01-01T00:00:00+0000",
};

const DEPARTMENTS = {
  data: [
    { id: "dept_met", name: "Meteorological Department" },
    { id: "dept_admin", name: "Administration" },
  ],
  count: 2,
};

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/departments`, () =>
    HttpResponse.json(DEPARTMENTS)
  ),
  http.get(`${BASE}/api/v1/auth/role-assignments`, () =>
    HttpResponse.json({ data: [], count: 0, page: 1, size: 100 })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ManageUserDialog open={true} roles={ROLES} user={USER} />
    </QueryClientProvider>
  );
}

describe("ManageUserDialog — department & employment", () => {
  it("assigns a department when the user has no record yet (POST)", async () => {
    const posted: unknown[] = [];
    server.use(
      // No employment record yet → 404, which puts the section in create mode.
      http.get(
        `${BASE}/api/v1/hr/employment/u-1`,
        () => new HttpResponse(null, { status: 404 })
      ),
      http.post(`${BASE}/api/v1/hr/employment/u-1`, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json(
          {
            id: "e-1",
            user_id: "u-1",
            employee_number: "MET-9",
            department_id: "dept_met",
            employment_type: "FULL_TIME",
            status: "ACTIVE",
          },
          { status: 201 }
        );
      })
    );

    renderDialog();

    const assignBtn = await screen.findByRole("button", {
      name: "Assign to department",
    });
    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "dept_met" },
    });
    fireEvent.change(screen.getByLabelText("Employee #"), {
      target: { value: "MET-9" },
    });
    fireEvent.change(screen.getByLabelText("Position"), {
      target: { value: "Forecaster" },
    });
    fireEvent.click(assignBtn);

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      employee_number: "MET-9",
      department_id: "dept_met",
      position: "Forecaster",
    });
  }, 20_000);

  it("edits an existing employment record (PATCH with wrapper)", async () => {
    const patched: unknown[] = [];
    server.use(
      http.get(`${BASE}/api/v1/hr/employment/u-1`, () =>
        HttpResponse.json({
          id: "e-1",
          user_id: "u-1",
          employee_number: "MET-1",
          department_id: "dept_met",
          position: "Observer",
          employment_type: "FULL_TIME",
          status: "ACTIVE",
        })
      ),
      http.patch(`${BASE}/api/v1/hr/employment/u-1`, async ({ request }) => {
        patched.push(await request.json());
        return HttpResponse.json({}, { status: 200 });
      })
    );

    renderDialog();

    const saveBtn = await screen.findByRole("button", {
      name: "Save employment",
    });
    // Fields are pre-seeded from the existing record.
    expect(
      (screen.getByLabelText("Employee #") as HTMLInputElement).value
    ).toBe("MET-1");
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "INACTIVE" },
    });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).toEqual({
      employment: {
        department_id: "dept_met",
        employee_number: "MET-1",
        position: "Observer",
        status: "INACTIVE",
      },
    });
  }, 20_000);
});
