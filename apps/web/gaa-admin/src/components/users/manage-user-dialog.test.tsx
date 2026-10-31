import {
  configureApiClient,
  type RolePublic,
  type UserPublic,
} from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { toast } from "sonner";
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
import { CHANGED_ELSEWHERE_NOTICE } from "./employment-section";
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
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ManageUserDialog open={true} roles={ROLES} user={USER} />
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

/**
 * Records whether the changed-elsewhere notice is ever added to the page, even
 * for one render: every added node is inspected as it arrives, so a notice that
 * appears and disappears before the next check is still caught.
 */
function watchForNotice() {
  let flashed = false;
  const watcher = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.textContent?.includes(CHANGED_ELSEWHERE_NOTICE))
          flashed = true;
      }
    }
  });
  watcher.observe(document.body, { childList: true, subtree: true });
  return {
    /** Stops watching and says whether the notice ever showed. */
    stop() {
      for (const record of watcher.takeRecords()) {
        for (const node of record.addedNodes) {
          if (node.textContent?.includes(CHANGED_ELSEWHERE_NOTICE)) {
            flashed = true;
          }
        }
      }
      watcher.disconnect();
      return flashed;
    },
  };
}

/** Lets any late render or request settle before a final check. */
const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 50)));

/** No employment record yet: a 404 puts the section in create mode. */
const noRecord = () =>
  http.get(
    `${BASE}/api/v1/hr/employment/u-1`,
    () => new HttpResponse(null, { status: 404 })
  );

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
    // Only the changed status is sent; unchanged fields are not.
    expect(patched[0]).toEqual({ employment: { status: "INACTIVE" } });
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
    expect(bodies[0]).toEqual({ employment: { status: "TERMINATED" } });
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

  it("does not overwrite another admin's changes to fields this admin did not edit", async () => {
    const bodies: unknown[] = [];
    let getCount = 0;
    server.use(
      http.get(`${BASE}/api/v1/hr/employment/u-1`, () => {
        getCount += 1;
        // The first read is this form's load. Later reads show another admin's edits:
        // a new position, and a moved department and status.
        return HttpResponse.json(
          getCount === 1
            ? RECORD
            : {
                ...RECORD,
                department_id: "dept_admin",
                position: "Senior Observer",
                status: "INACTIVE",
              }
        );
      }),
      patchRecord(bodies)
    );
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Employee #"), {
      target: { value: "MET-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ employment: { employee_number: "MET-2" } });

    // Wait for the refetch that carries the other admin's position change. The
    // form says the record changed, but keeps what this admin loaded.
    await waitFor(() => expect(getCount).toBeGreaterThanOrEqual(2));
    expect(
      await screen.findByText(CHANGED_ELSEWHERE_NOTICE)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Position")).toHaveValue("Observer");
    fireEvent.change(screen.getByLabelText("Employee #"), {
      target: { value: "MET-3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    // Only the field this admin edited is sent. The position, department and status
    // another admin set are left alone.
    expect(bodies[1]).toEqual({ employment: { employee_number: "MET-3" } });
    expect(screen.queryByText(CONFIRM_TITLE)).not.toBeInTheDocument();
  });

  it("hides the Status select before the record exists: a new record starts Active", async () => {
    server.use(noRecord());
    renderDialog();
    await screen.findByRole("button", { name: "Assign to department" });
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(
      screen.getByText("Active. A new record always starts Active.")
    ).toBeInTheDocument();
  });

  it("requires an employee number in create mode and sends nothing without one", async () => {
    const errorToast = vi.spyOn(toast, "error");
    const posted: unknown[] = [];
    server.use(
      noRecord(),
      http.post(`${BASE}/api/v1/hr/employment/u-1`, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({}, { status: 201 });
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
      target: { value: "   " },
    });
    fireEvent.click(assignBtn);
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith(
        "Employee number is required to assign a department"
      )
    );
    expect(posted).toHaveLength(0);
    errorToast.mockRestore();
  });

  it("says when the record changed elsewhere and loads the latest values on request", async () => {
    let getCount = 0;
    server.use(
      http.get(`${BASE}/api/v1/hr/employment/u-1`, () => {
        getCount += 1;
        return HttpResponse.json(
          getCount === 1 ? RECORD : { ...RECORD, position: "Senior Observer" }
        );
      })
    );
    const { queryClient } = renderDialog();
    fireEvent.change(await screen.findByLabelText("Employee #"), {
      target: { value: "MET-2" },
    });
    expect(
      screen.queryByText(CHANGED_ELSEWHERE_NOTICE)
    ).not.toBeInTheDocument();

    // Another admin saves; this dialog refetches without saving anything.
    await act(() => queryClient.invalidateQueries());
    expect(
      await screen.findByText(CHANGED_ELSEWHERE_NOTICE)
    ).toBeInTheDocument();
    // Nothing on screen changes until the admin asks.
    expect(screen.getByLabelText("Position")).toHaveValue("Observer");
    expect(screen.getByLabelText("Employee #")).toHaveValue("MET-2");

    fireEvent.click(screen.getByRole("button", { name: "Load latest values" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Position")).toHaveValue("Senior Observer")
    );
    expect(screen.getByLabelText("Employee #")).toHaveValue("MET-1");
    expect(
      screen.queryByText(CHANGED_ELSEWHERE_NOTICE)
    ).not.toBeInTheDocument();
    // The button is gone, so keyboard focus moves to the first field, not the page.
    expect(screen.getByLabelText("Department")).toHaveFocus();
  });

  it("does not report this form's own save as a change made elsewhere", async () => {
    const successToast = vi.spyOn(toast, "success");
    let record = { ...RECORD };
    server.use(
      http.get(`${BASE}/api/v1/hr/employment/u-1`, () =>
        HttpResponse.json(record)
      ),
      http.patch(`${BASE}/api/v1/hr/employment/u-1`, async ({ request }) => {
        const body = (await request.json()) as {
          employment: Partial<typeof RECORD>;
        };
        record = { ...record, ...body.employment };
        return HttpResponse.json({}, { status: 200 });
      })
    );
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Employee #"), {
      target: { value: "MET-2" },
    });
    // Watch every render: the stale cached record before the refetch must not
    // flash the notice either.
    const watch = watchForNotice();
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    await waitFor(() => expect(successToast).toHaveBeenCalled());
    await settle();
    expect(watch.stop()).toBe(false);
    expect(
      screen.queryByText(CHANGED_ELSEWHERE_NOTICE)
    ).not.toBeInTheDocument();
    successToast.mockRestore();
  });

  it("does not report a successful create as a change made elsewhere", async () => {
    const successToast = vi.spyOn(toast, "success");
    let record: Record<string, unknown> | null = null;
    server.use(
      http.get(`${BASE}/api/v1/hr/employment/u-1`, () =>
        record
          ? HttpResponse.json(record)
          : new HttpResponse(null, { status: 404 })
      ),
      http.post(`${BASE}/api/v1/hr/employment/u-1`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        record = { ...RECORD, ...body, status: "ACTIVE", end_date: null };
        return HttpResponse.json(record, { status: 201 });
      })
    );
    renderDialog();
    const assignBtn = await screen.findByRole("button", {
      name: "Assign to department",
    });
    fireEvent.change(screen.getByLabelText("Employee #"), {
      target: { value: "MET-9" },
    });
    fireEvent.change(screen.getByLabelText("Position"), {
      target: { value: "Forecaster" },
    });
    const watch = watchForNotice();
    fireEvent.click(assignBtn);
    await waitFor(() => expect(successToast).toHaveBeenCalled());
    // The refetch brings the new record and the form switches to edit mode.
    expect(
      await screen.findByRole("button", { name: "Save employment" })
    ).toBeInTheDocument();
    await settle();
    expect(watch.stop()).toBe(false);
    expect(
      screen.queryByText(CHANGED_ELSEWHERE_NOTICE)
    ).not.toBeInTheDocument();
    successToast.mockRestore();
  });

  it("sends one save when Save employment is clicked twice quickly", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({}), patchRecord(bodies));
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Employee #"), {
      target: { value: "MET-2" },
    });
    const saveBtn = screen.getByRole("button", { name: "Save employment" });
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);
    await waitFor(() => expect(bodies).toHaveLength(1));
    // Let any second request arrive before checking there was none.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(bodies).toHaveLength(1);
  });

  it("sends one save when Confirm and save is clicked twice quickly", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({}), patchRecord(bodies));
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "INACTIVE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save employment" }));
    const confirm = screen.getByRole("button", { name: "Confirm and save" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(bodies).toHaveLength(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(bodies).toEqual([{ employment: { status: "INACTIVE" } }]);
  });

  it("Escape closes only the confirmation, keeps the draft and returns focus to Save", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({}), patchRecord(bodies));
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "TERMINATED" },
    });
    const saveBtn = screen.getByRole("button", { name: "Save employment" });
    saveBtn.focus();
    fireEvent.click(saveBtn);
    expect(screen.getByText(CONFIRM_TITLE)).toBeInTheDocument();
    // Focus starts on the safe choice inside the confirmation.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Go back" })).toHaveFocus()
    );

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByText(CONFIRM_TITLE)).not.toBeInTheDocument()
    );
    // The user dialog stays open with the edit intact, and nothing was sent.
    expect(screen.getByLabelText("Status")).toHaveValue("TERMINATED");
    expect(bodies).toHaveLength(0);
    await waitFor(() => expect(saveBtn).toHaveFocus());
  });

  it("says there is nothing to save and sends nothing when no field changed", async () => {
    const bodies: unknown[] = [];
    server.use(recordWith({}), patchRecord(bodies));
    renderDialog();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save employment" })
    );
    expect(screen.getByRole("status")).toHaveTextContent("No changes to save");
    expect(bodies).toHaveLength(0);
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
    expect(bodies[0]).toEqual({ employment: { end_date: today } });
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
