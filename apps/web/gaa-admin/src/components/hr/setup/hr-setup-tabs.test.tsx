import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { HrSetupTabs } from "./hr-setup-tabs";

const actor = vi.hoisted(() => ({ is_superuser: true }));
vi.mock("@barrelsgd/auth", () => ({ useSessionUser: () => actor }));
beforeEach(() => {
  actor.is_superuser = true;
});
vi.mock("./staff-setup", () => ({
  StaffSetupManager: ({ organisationId }: { organisationId?: string }) => (
    <p>Staff for {organisationId}</p>
  ),
}));
vi.mock("./departments-manager", () => ({
  DepartmentsManager: () => <p>Department setup</p>,
}));
vi.mock("./shift-types-manager", () => ({
  ShiftTypesManager: ({ canManage }: { canManage?: boolean }) => (
    <p>Shared shifts: {canManage ? "editable" : "read only"}</p>
  ),
}));
vi.mock("./notification-settings", () => ({
  NotificationSettings: () => null,
}));
const BASE = "http://localhost";
const first = { id: "gaa", code: "GAA", name: "Grenada Airports Authority" };
const second = { id: "example", code: "EXAMPLE", name: "Example Employer" };
const server = setupServer(
  http.get(`${BASE}/api/v1/hr/organisations`, () =>
    HttpResponse.json([first, second])
  )
);
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <HrSetupTabs />
    </QueryClientProvider>
  );
}
it("requires a choice with multiple organisations and switches the staff context", async () => {
  show();
  const selector = await screen.findByLabelText("Employer organisation");
  expect(
    screen.getByText("Select an organisation to open HR setup.")
  ).toBeInTheDocument();
  fireEvent.change(selector, { target: { value: "gaa" } });
  expect(await screen.findByText("Staff for gaa")).toBeInTheDocument();
  fireEvent.change(selector, { target: { value: "example" } });
  expect(await screen.findByText("Staff for example")).toBeInTheDocument();
  expect(screen.queryByText("Staff for gaa")).not.toBeInTheDocument();
});
it("uses the single accessible organisation without a hardcoded GAA default", async () => {
  server.use(
    http.get(`${BASE}/api/v1/hr/organisations`, () =>
      HttpResponse.json([second])
    )
  );
  show();
  expect(await screen.findByText("Staff for example")).toBeInTheDocument();
});
it("does not render setup after an organisation access error", async () => {
  server.use(
    http.get(`${BASE}/api/v1/hr/organisations`, () =>
      HttpResponse.json({}, { status: 403 })
    )
  );
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to load organisations"
  );
  expect(
    screen.queryByLabelText("Employer organisation")
  ).not.toBeInTheDocument();
});

it("does not confuse department roster permission with shared catalogue authority", async () => {
  actor.is_superuser = false;
  server.use(
    http.get(`${BASE}/api/v1/auth/access/me`, () =>
      HttpResponse.json({
        is_superuser: false,
        role_names: ["department-manager"],
        permission_keys: ["user.manage", "roster.manage"],
        all_scope_permission_keys: [],
      })
    )
  );
  show();
  const selector = await screen.findByLabelText("Employer organisation");
  fireEvent.change(selector, { target: { value: "gaa" } });
  expect(await screen.findByText("Department setup")).toBeInTheDocument();
  expect(
    screen.queryByRole("tab", { name: "Staff baseline" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("tab", { name: "Notifications" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Shift types" }));
  expect(
    await screen.findByText("Shared shifts: read only")
  ).toBeInTheDocument();
});
it("does not permit shared editing from organisation-wide authority", async () => {
  actor.is_superuser = false;
  server.use(
    http.get(`${BASE}/api/v1/auth/access/me`, () =>
      HttpResponse.json({
        is_superuser: false,
        role_names: ["global-roster-admin"],
        permission_keys: ["roster.manage"],
        all_scope_permission_keys: ["roster.manage"],
        global_permission_keys: [],
      })
    )
  );
  show();
  const selector = await screen.findByLabelText("Employer organisation");
  fireEvent.change(selector, { target: { value: "gaa" } });
  fireEvent.click(screen.getByRole("tab", { name: "Shift types" }));
  expect(
    await screen.findByText("Shared shifts: read only")
  ).toBeInTheDocument();
});

it("permits shared editing from preserved unscoped authority", async () => {
  actor.is_superuser = false;
  server.use(
    http.get(`${BASE}/api/v1/auth/access/me`, () =>
      HttpResponse.json({
        is_superuser: false,
        role_names: ["legacy-global-roster-admin"],
        permission_keys: ["roster.manage"],
        all_scope_permission_keys: ["roster.manage"],
        global_permission_keys: ["roster.manage"],
      })
    )
  );
  show();
  const selector = await screen.findByLabelText("Employer organisation");
  fireEvent.change(selector, { target: { value: "gaa" } });
  fireEvent.click(screen.getByRole("tab", { name: "Shift types" }));
  expect(
    await screen.findByText("Shared shifts: editable")
  ).toBeInTheDocument();
});
