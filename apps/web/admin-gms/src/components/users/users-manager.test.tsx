import { configureApiClient } from "@grenmet/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { UsersManager } from "./users-manager";

const BASE = "http://localhost";
const NEW_USER_LABEL = /New user/;

const ROLES = {
  data: [
    {
      id: "r-staff",
      name: "staff",
      description: "",
      created_at: "2026-01-01T00:00:00+0000",
      updated_at: "2026-01-01T00:00:00+0000",
    },
    {
      id: "r-sup",
      name: "hr-supervisor",
      description: "",
      created_at: "2026-01-01T00:00:00+0000",
      updated_at: "2026-01-01T00:00:00+0000",
    },
    {
      id: "r-admin",
      name: "hr-admin",
      description: "",
      created_at: "2026-01-01T00:00:00+0000",
      updated_at: "2026-01-01T00:00:00+0000",
    },
  ],
  count: 3,
  page: 1,
  size: 100,
};

const USERS = {
  data: [
    {
      id: "u-1",
      email: "gtamar@example.com",
      username: "gtamar",
      first_name: "Gerard",
      last_name: "Tamar",
      is_active: true,
      is_superuser: false,
    },
    {
      id: "u-2",
      email: "ewhint@example.com",
      username: "ewhint",
      first_name: "Eugine",
      last_name: "Whint",
      is_active: true,
      is_superuser: true,
    },
  ],
  count: 2,
  page: 1,
  size: 100,
};

const DEPARTMENTS = {
  data: [{ id: "dept_met", name: "Meteorological Department" }],
  count: 1,
};

const server = setupServer(
  http.get(`${BASE}/api/v1/auth/users`, () => HttpResponse.json(USERS)),
  http.get(`${BASE}/api/v1/auth/roles`, () => HttpResponse.json(ROLES)),
  http.get(`${BASE}/api/v1/hr/departments`, () =>
    HttpResponse.json(DEPARTMENTS)
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderUsers() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersManager />
    </QueryClientProvider>
  );
}

describe("UsersManager", () => {
  it("lists users with status and superuser badges, and filters by search", async () => {
    renderUsers();

    expect(await screen.findByText("Gerard Tamar")).toBeInTheDocument();
    expect(screen.getByText("Eugine Whint")).toBeInTheDocument();
    expect(screen.getByText("superuser")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search users"), {
      target: { value: "tamar" },
    });
    expect(screen.getByText("Gerard Tamar")).toBeInTheDocument();
    expect(screen.queryByText("Eugine Whint")).not.toBeInTheDocument();
  }, 20_000);

  it("onboards a user: account, roles (baseline + suggested), employment", async () => {
    const posted: {
      users: unknown[];
      assignments: unknown[];
      employment: unknown[];
    } = { users: [], assignments: [], employment: [] };
    server.use(
      http.post(`${BASE}/api/v1/auth/users`, async ({ request }) => {
        posted.users.push(await request.json());
        return HttpResponse.json(
          { ...USERS.data[0], id: "u-new", username: "tclovey" },
          { status: 201 }
        );
      }),
      http.post(`${BASE}/api/v1/auth/role-assignments`, async ({ request }) => {
        const body = (await request.json()) as Record<string, string>;
        posted.assignments.push(body);
        return HttpResponse.json(
          {
            id: `a-${posted.assignments.length}`,
            user_id: body.user_id,
            role_id: body.role_id,
            scope: "SELF",
            effective_from: "2026-07-04T00:00:00+0000",
            created_at: "2026-07-04T00:00:00+0000",
            updated_at: "2026-07-04T00:00:00+0000",
          },
          { status: 201 }
        );
      }),
      http.post(`${BASE}/api/v1/hr/employment/u-new`, async ({ request }) => {
        posted.employment.push(await request.json());
        return HttpResponse.json(
          {
            id: "e-1",
            user_id: "u-new",
            employee_number: "GMD-100",
            department_id: "dept_met",
            position: "Forecaster (Senior Supervisor)",
            employment_type: "FULL_TIME",
            status: "ACTIVE",
          },
          { status: 201 }
        );
      })
    );

    renderUsers();
    await screen.findByText("Gerard Tamar");

    fireEvent.click(screen.getByRole("button", { name: NEW_USER_LABEL }));
    fireEvent.change(await screen.findByLabelText("First name"), {
      target: { value: "Tavon" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Clovey" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "tclovey" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "tclovey@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Temporary password"), {
      target: { value: "changeme123" },
    });
    fireEvent.change(screen.getByLabelText("Employee number"), {
      target: { value: "GMD-100" },
    });
    fireEvent.change(screen.getByLabelText("Position"), {
      target: { value: "Forecaster (Senior Supervisor)" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() => {
      expect(posted.employment).toHaveLength(1);
    });
    expect(posted.users).toHaveLength(1);
    // Forecaster suggests hr-supervisor; baseline staff is always assigned too.
    expect(posted.assignments).toEqual([
      { user_id: "u-new", role_id: "r-staff" },
      { user_id: "u-new", role_id: "r-sup" },
    ]);
    expect(posted.employment[0]).toEqual({
      employee_number: "GMD-100",
      department_id: "dept_met",
      position: "Forecaster (Senior Supervisor)",
    });
  }, 20_000);
});
