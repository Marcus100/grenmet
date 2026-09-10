import {
  configureApiClient,
  type UserRoleAssignmentPublic,
} from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { RolesManager } from "./roles-manager";
import { toRoleRows } from "./roles-row";

const BASE = "http://localhost";

const ROLES = {
  data: [
    {
      id: "r-staff",
      name: "staff",
      description: "Baseline access for all employees",
      created_at: "2026-01-01T00:00:00+0000",
      updated_at: "2026-02-03T00:00:00+0000",
    },
    {
      id: "r-admin",
      name: "hr-admin",
      description: "",
      created_at: "2026-01-01T00:00:00+0000",
      updated_at: "2026-02-04T00:00:00+0000",
    },
    {
      id: "r-duty",
      name: "duty-officer",
      description: "Operator-created rota role",
      created_at: "2026-01-01T00:00:00+0000",
      updated_at: "2026-02-05T00:00:00+0000",
    },
  ],
  count: 3,
  page: 1,
  size: 100,
};

// r-staff held by u-1 and u-2 (u-2 twice, across scopes → counted once).
// r-duty held by nobody.
const STAMPS = {
  organisation_id: "gaa",
  effective_from: "2026-01-01T00:00:00+0000",
  created_at: "2026-01-01T00:00:00+0000",
  updated_at: "2026-01-01T00:00:00+0000",
} as const;

const ASSIGNMENT_ROWS: UserRoleAssignmentPublic[] = [
  { id: "a-1", user_id: "u-1", role_id: "r-staff", scope: "SELF", ...STAMPS },
  { id: "a-2", user_id: "u-2", role_id: "r-staff", scope: "SELF", ...STAMPS },
  { id: "a-3", user_id: "u-2", role_id: "r-staff", scope: "ALL", ...STAMPS },
  { id: "a-4", user_id: "u-2", role_id: "r-admin", scope: "ALL", ...STAMPS },
];

const ROLE_ASSIGNMENTS = {
  data: ASSIGNMENT_ROWS,
  count: 4,
  page: 1,
  size: 100,
};

const server = setupServer(
  http.get(`${BASE}/api/v1/auth/roles`, () => HttpResponse.json(ROLES)),
  http.get(`${BASE}/api/v1/auth/role-assignments`, () =>
    HttpResponse.json(ROLE_ASSIGNMENTS)
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderRoles() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RolesManager />
    </QueryClientProvider>
  );
}

describe("toRoleRows", () => {
  it("counts distinct holders and classifies system vs custom roles", () => {
    const rows = toRoleRows(ROLES.data, ROLE_ASSIGNMENTS.data);
    const byName = new Map(rows.map((row) => [row.name, row]));

    // u-2 holds r-staff under two scopes but counts once.
    expect(byName.get("staff")?.users).toBe(2);
    expect(byName.get("hr-admin")?.users).toBe(1);
    expect(byName.get("duty-officer")?.users).toBe(0);

    // Provisioned by onboarding (position-roles.ts) → System.
    expect(byName.get("staff")?.type).toBe("System");
    expect(byName.get("hr-admin")?.type).toBe("System");
    expect(byName.get("duty-officer")?.type).toBe("Custom");
  });

  it("falls back to an em dash for a blank description", () => {
    const rows = toRoleRows(ROLES.data, []);
    expect(rows.find((row) => row.name === "hr-admin")?.description).toBe("—");
  });
});

describe("RolesManager", () => {
  it("lists roles with type badges and holder counts; filters by search", async () => {
    renderRoles();

    expect(await screen.findByText("staff")).toBeInTheDocument();
    expect(screen.getByText("hr-admin")).toBeInTheDocument();
    expect(screen.getByText("duty-officer")).toBeInTheDocument();
    expect(
      screen.getByText("Baseline access for all employees")
    ).toBeInTheDocument();

    // Type is derived, not stored: two system roles, one custom.
    expect(screen.getAllByText("System")).toHaveLength(2);
    expect(screen.getAllByText("Custom")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Search roles"), {
      target: { value: "duty" },
    });
    expect(screen.getByText("duty-officer")).toBeInTheDocument();
    expect(screen.queryByText("hr-admin")).not.toBeInTheDocument();
  }, 20_000);

  it("groups rows under System/Custom headers and counts the page", async () => {
    renderRoles();

    expect(await screen.findByText("System roles")).toBeInTheDocument();
    expect(screen.getByText("Custom roles")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 to 3 of 3 roles")).toBeInTheDocument();
  }, 20_000);

  it("drops a group header when the filter leaves it empty", async () => {
    renderRoles();
    await screen.findByText("System roles");

    fireEvent.change(screen.getByLabelText("Search roles"), {
      target: { value: "duty" },
    });

    // Only the custom role survives, so the System header goes away.
    expect(screen.getByText("Custom roles")).toBeInTheDocument();
    expect(screen.queryByText("System roles")).not.toBeInTheDocument();
  }, 20_000);
});
