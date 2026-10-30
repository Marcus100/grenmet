import {
  configureApiClient,
  type RolePublic,
  type UserPublic,
} from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { grenadaToday } from "@/components/hr/expiry";
import {
  DEPARTMENT_TRANSFER_WARNING,
  END_DATE_EXPLANATION,
} from "@/lib/employment-end";
import { reportError } from "@/lib/report-error";
import { ManageUserDialog } from "./manage-user-dialog";

const actor = vi.hoisted(() => ({ is_superuser: true }));
vi.mock("@barrelsgd/auth", () => ({ useSessionUser: () => actor }));

vi.mock("./account-activation", () => ({ AccountActivation: () => null }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const BASE = "http://localhost";
const DELEGATION_EXPLANATION = /Delegated access ends when your authority ends/;

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
afterEach(() => {
  server.resetHandlers();
  actor.is_superuser = true;
});
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
  it("shows bounded staff delegation and hides platform controls for managers", async () => {
    actor.is_superuser = false;
    server.use(
      http.get(`${BASE}/api/v1/hr/employment/u-1`, () =>
        HttpResponse.json({
          id: "e-1",
          user_id: "u-1",
          organisation_id: "gaa",
          employee_number: "MET-9",
          department_id: "dept_met",
          status: "ACTIVE",
        })
      )
    );
    renderDialog();
    expect(await screen.findByText(DELEGATION_EXPLANATION)).toBeInTheDocument();
    expect(screen.queryByLabelText("Assignment scope")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deactivate account" })
    ).not.toBeInTheDocument();
  });
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
  });

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
    // Inactive ends every role, so the save waits for confirmation.
    expect(patched).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));

    await waitFor(() => expect(patched).toHaveLength(1));
    // Only the changed status is sent; the unchanged department is not.
    expect(patched[0]).toEqual({
      employment: {
        employee_number: "MET-1",
        position: "Observer",
        status: "INACTIVE",
      },
    });
  });

  it("confirms a status change to Inactive or Terminated before saving, naming the roles consequence", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({}), patchRecord(bodies));
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "TERMINATED" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    expect(screen.getByText(CONFIRM_TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(
        "This ends all of this person's roles in the organisation; they must be granted again if they return."
      )
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(bodies).toHaveLength(0);
    expect(screen.getByLabelText("Status")).toHaveValue("TERMINATED");

    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      employment: {
        employee_number: "MET-1",
        position: "Observer",
        status: "TERMINATED",
      },
    });
  });

  it("does not stop a reinstatement to Active for confirmation", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({ status: "INACTIVE" }), patchRecord(bodies));
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "ACTIVE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(screen.queryByText(CONFIRM_TITLE)).not.toBeInTheDocument();
  });

  it("does not send a stale department or status after someone else changed the record", async () => {
    const bodies: unknown[] = [];
    let getCount = 0;
    server.use(
      http.get(`${BASE}/api/v1/hr/employment/u-1`, () => {
        getCount += 1;
        // The first read is the form's load; later reads show another admin's edit.
        return HttpResponse.json(
          getCount === 1
            ? RECORD
            : { ...RECORD, department_id: "dept_admin", status: "INACTIVE" }
        );
      }),
      patchRecord(bodies)
    );
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Position"), {
      target: { value: "Forecaster" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    // The save after the refetch changes nothing about department or status.
    fireEvent.change(screen.getByLabelText("Position"), {
      target: { value: "Senior Forecaster" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({
      employment: {
        employee_number: "MET-1",
        position: "Senior Forecaster",
      },
    });
    expect(screen.queryByText(CONFIRM_TITLE)).not.toBeInTheDocument();
  });
});

/** Title of the AlertDialog that names the person before a change that ends roles. */
const CONFIRM_TITLE = "Confirm change for Jude Charles";

const RECORD = {
  id: "e-1",
  user_id: "u-1",
  organisation_id: "gaa",
  employee_number: "MET-1",
  department_id: "dept_met",
  position: "Observer",
  employment_type: "FULL_TIME",
  status: "ACTIVE",
  start_date: "2020-01-01",
  end_date: null,
};

/** Captures each PATCH body and answers with `status` (or 200 when none is given). */
function patchRecord(
  bodies: unknown[],
  response: { status: number; body?: unknown } | null = null
) {
  return http.patch(`${BASE}/api/v1/hr/employment/u-1`, async ({ request }) => {
    bodies.push(await request.json());
    if (!response) return HttpResponse.json({}, { status: 200 });
    return HttpResponse.json(response.body ?? {}, { status: response.status });
  });
}

function recordWith(overrides: Record<string, unknown>) {
  return http.get(`${BASE}/api/v1/hr/employment/u-1`, () =>
    HttpResponse.json({ ...RECORD, ...overrides })
  );
}

describe("ManageUserDialog — last day of employment", () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear();
  });

  it("shows the last day field with its plain explanation", async () => {
    server.use(recordWith({}));
    renderDialog();
    expect(
      await screen.findByLabelText("Last day of employment")
    ).toBeInTheDocument();
    expect(screen.getByText(END_DATE_EXPLANATION)).toBeInTheDocument();
  });

  it("shows an empty state, not a missing field, before the record exists", async () => {
    server.use(
      http.get(
        `${BASE}/api/v1/hr/employment/u-1`,
        () => new HttpResponse(null, { status: 404 })
      )
    );
    renderDialog();
    expect(
      await screen.findByText(
        "A last day can be recorded once the employment record is saved."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Last day of employment")
    ).not.toBeInTheDocument();
  });

  it("rejects a last day before the start date and will not save it", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({}), patchRecord(bodies));
    renderDialog();
    const input = await screen.findByLabelText("Last day of employment");
    fireEvent.change(input, { target: { value: "2019-12-31" } });
    expect(
      screen.getByText(
        "The last day cannot be before the start date (1 Jan 2020)."
      )
    ).toBeInTheDocument();
    // Save is disabled while the date is invalid, so nothing is sent or lost silently.
    expect(
      screen.getByRole("button", { name: "Save employment" })
    ).toBeDisabled();
    expect(bodies).toHaveLength(0);
    // The field points at the explanation and the error, so a screen reader announces why.
    const message = screen.getByText(
      "The last day cannot be before the start date (1 Jan 2020)."
    );
    expect(message).toHaveAttribute("id", "mu-end-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("mu-end-error");
    expect(input.getAttribute("aria-describedby")).toContain("mu-end-help");
  });

  it("asks for confirmation before a last day today, and saves only after confirming", async () => {
    const today = grenadaToday();
    const bodies: unknown[] = [];
    server.use(recordWith({}), patchRecord(bodies));
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Last day of employment"), {
      target: { value: today },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));

    expect(screen.getByText(CONFIRM_TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Last day is today. Access to everything except basic staff self-service stops at midnight tonight."
      )
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(bodies).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Save employment" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      employment: {
        employee_number: "MET-1",
        position: "Observer",
        end_date: today,
      },
    });
  });

  it("does not ask for confirmation for a future last day", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({}), patchRecord(bodies));
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Last day of employment"), {
      target: { value: "2099-11-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(
      (bodies[0] as { employment: { end_date: string } }).employment.end_date
    ).toBe("2099-11-15");
    expect(screen.queryByText(CONFIRM_TITLE)).not.toBeInTheDocument();
  });

  it("clears a last day and sends null only because it changed", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({ end_date: "2099-11-15" }), patchRecord(bodies));
    renderDialog();
    fireEvent.click(
      await screen.findByRole("button", { name: "Clear last day" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(
      (bodies[0] as { employment: Record<string, unknown> }).employment
    ).toHaveProperty("end_date", null);
    expect(screen.queryByText(CONFIRM_TITLE)).not.toBeInTheDocument();
  });

  it("does not send the last day when it was not changed", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({ end_date: "2099-11-15" }), patchRecord(bodies));
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "INACTIVE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect((bodies[0] as { employment: object }).employment).not.toHaveProperty(
      "end_date"
    );
  });

  it("shows the API's 403 reason on the form when an end date change is refused", async () => {
    server.use(
      recordWith({}),
      patchRecord([], {
        status: 403,
        body: {
          detail:
            "Changing an end date on someone who holds organisation-wide roles needs organisation-wide HR employment authority",
        },
      })
    );
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Last day of employment"), {
      target: { value: "2099-11-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    expect(
      await screen.findByText(
        "Changing an end date on someone who holds organisation-wide roles needs organisation-wide HR employment authority. Nothing was saved."
      )
    ).toBeInTheDocument();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("shows the API's 400 reason when a passed last day blocks reinstating", async () => {
    server.use(
      recordWith({ status: "INACTIVE", end_date: "2020-06-01" }),
      patchRecord([], {
        status: 400,
        body: {
          detail: "Clear or move the end date before reinstating employment",
        },
      })
    );
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "ACTIVE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    expect(
      await screen.findByText(
        "Clear or move the end date before reinstating employment. Nothing was saved."
      )
    ).toBeInTheDocument();
  });

  it("shows the API's 403 reason when a transfer is refused, after confirming", async () => {
    server.use(
      recordWith({}),
      patchRecord([], {
        status: 403,
        body: {
          detail:
            "Transferring someone who holds organisation-wide roles needs organisation-wide HR employment authority",
        },
      })
    );
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Department"), {
      target: { value: "dept_admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    expect(
      await screen.findByText(
        "Transferring someone who holds organisation-wide roles needs organisation-wide HR employment authority. Nothing was saved."
      )
    ).toBeInTheDocument();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure and shows a plain fallback", async () => {
    server.use(
      recordWith({}),
      patchRecord([], { status: 500, body: { detail: "boom" } })
    );
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Position"), {
      target: { value: "Forecaster" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    expect(
      await screen.findByText(
        "Something went wrong and nothing was saved. Try again."
      )
    ).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      "hr-employment"
    );
  });

  it("warns about a department transfer before saving and sends it only after confirming", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({}), patchRecord(bodies));
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Department"), {
      target: { value: "dept_admin" },
    });
    expect(screen.getByText(DEPARTMENT_TRANSFER_WARNING)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    expect(
      screen.getAllByText(DEPARTMENT_TRANSFER_WARNING).length
    ).toBeGreaterThan(0);
    expect(bodies).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(
      (bodies[0] as { employment: { department_id: string } }).employment
        .department_id
    ).toBe("dept_admin");
  });
});

describe("CMS access", () => {
  it("grants, changes and removes explicit access", async () => {
    const updates: unknown[] = [];
    server.use(
      http.get(
        `${BASE}/api/v1/hr/employment/u-1`,
        () => new HttpResponse(null, { status: 404 })
      ),
      http.patch(`${BASE}/api/v1/auth/users/u-1`, async ({ request }) => {
        updates.push(await request.json());
        return HttpResponse.json(USER);
      })
    );
    renderDialog();
    for (const value of ["writer", "publisher", "none"]) {
      fireEvent.change(screen.getByRole("combobox", { name: "CMS access" }), {
        target: { value },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save CMS access" }));
      await waitFor(() =>
        expect(updates).toContainEqual({ cms_access: value })
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Save CMS access" })
        ).not.toBeDisabled()
      );
    }
  });
  it("hides access controls from non-administrators", () => {
    actor.is_superuser = false;
    server.use(
      http.get(
        `${BASE}/api/v1/hr/employment/u-1`,
        () => new HttpResponse(null, { status: 404 })
      )
    );
    renderDialog();
    expect(
      screen.queryByRole("button", { name: "Save CMS access" })
    ).toBeNull();
  });
});
