import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { RosterRulesManager } from "./roster-rules-manager";

const BASE = "http://localhost";
const ROSTERS = `${BASE}/api/v1/hr/rosters`;
const STAFF = "11111111-1111-4111-8111-111111111111";
const ORG_ONLY = /Only an organisation-wide HR administrator/;

const RULE_SET = {
  organisation_id: "gaa",
  department_id: null,
  source: "ORGANISATION",
  work_pattern: "ROTATION",
  worker_type: "SHIFT",
  max_consecutive_shifts: 3,
  min_days_off_after_run: 2,
  shift_daily_hours: "8.00",
  shift_weekly_hours: "40.00",
  non_shift_daily_hours: null,
  non_shift_weekly_hours: "35.00",
  weekend_window_weeks: 4,
  notice_days: 7,
  overtime_bands_enabled: true,
  weekday_first_hours: "4.00",
  weekday_first_rate: "1.50",
  weekday_after_rate: "2.00",
  saturday_window_start: "08:00",
  saturday_window_end: "12:00",
  saturday_window_rate: "1.50",
  saturday_after_rate: "2.00",
  rest_day_first_hours: "8.00",
  rest_day_first_rate: "2.00",
  rest_day_after_rate: "3.00",
  after_midnight_rate: "2.00",
  updated_at: "2026-10-31T12:00:00Z",
  updated_by_user_id: null,
};

let savedOrg: Record<string, unknown> | undefined;
let savedProfile: unknown;
let deleted = false;

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/departments`, () =>
    HttpResponse.json({
      data: [{ id: "dept_met", name: "Meteorological Department" }],
      count: 1,
    })
  ),
  http.get(`${ROSTERS}/organisations/gaa/rule-set`, () =>
    HttpResponse.json(RULE_SET)
  ),
  http.put(`${ROSTERS}/organisations/gaa/rule-set`, async ({ request }) => {
    savedOrg = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...RULE_SET, ...savedOrg });
  }),
  http.get(`${ROSTERS}/departments/dept_met/rule-set`, () =>
    HttpResponse.json({
      ...RULE_SET,
      department_id: "dept_met",
      source: "DEPARTMENT",
      work_pattern: "WEEKDAYS",
    })
  ),
  http.delete(`${ROSTERS}/departments/dept_met/rule-set`, () => {
    deleted = true;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${ROSTERS}/departments/dept_met/rule-profiles`, () =>
    HttpResponse.json({
      data: [
        {
          user_id: STAFF,
          full_name: "Gerad Tamar",
          employee_number: "E001",
          union_covered: true,
          worker_type: null,
          effective_worker_type: "SHIFT",
        },
      ],
      count: 1,
    })
  ),
  http.put(
    `${ROSTERS}/employees/${STAFF}/rule-profile`,
    async ({ request }) => {
      savedProfile = await request.json();
      return HttpResponse.json({
        user_id: STAFF,
        full_name: "Gerad Tamar",
        union_covered: false,
        worker_type: null,
        effective_worker_type: "SHIFT",
      });
    }
  ),
  http.get(`${ROSTERS}/departments/dept_met/rule-overrides`, () =>
    HttpResponse.json({
      data: [
        {
          id: "o1",
          department_id: "dept_met",
          context: "PUBLISH",
          entity_type: "roster_period",
          entity_id: "p1",
          rule_codes: ["MAX_CONSECUTIVE_DAYS"],
          violations: [],
          reason: "Two officers on sick leave",
          overridden_by_user_id: STAFF,
          overridden_by_name: "Gerad Tamar",
          created_at: "2026-10-31T12:00:00Z",
        },
      ],
      count: 1,
    })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  savedOrg = undefined;
  savedProfile = undefined;
  deleted = false;
});
afterAll(() => server.close());

function renderManager(canEditOrganisation = true, canEditDepartment = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RosterRulesManager
        canEditDepartment={canEditDepartment}
        canEditOrganisation={canEditOrganisation}
        organisationId="gaa"
      />
    </QueryClientProvider>
  );
}

function section(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const element = heading.closest("section");
  if (!element) throw new Error(`No section ${name}`);
  return element;
}

describe("RosterRulesManager", () => {
  it("saves the organisation rules with an empty limit switched off", async () => {
    renderManager();
    const field = await screen.findByLabelText("Days of notice", {
      selector: "#org-notice_days",
    });
    expect(field).toHaveValue("7");
    const org = section("Organisation default");
    const save = within(org).getByRole("button", {
      name: "Save organisation rules",
    });
    expect(save).toBeDisabled();
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.change(within(org).getByLabelText("Most shifts in a row"), {
      target: { value: "4" },
    });
    fireEvent.click(save);
    await waitFor(() => expect(savedOrg).toBeDefined());
    expect(savedOrg?.notice_days).toBeNull();
    expect(savedOrg?.max_consecutive_shifts).toBe(4);
    expect(savedOrg?.shift_weekly_hours).toBe(40);
    expect(savedOrg?.saturday_window_start).toBe("08:00");
  });

  it("blocks saving an invalid rate", async () => {
    renderManager();
    const org = section("Organisation default");
    const rate = await within(org).findByLabelText(
      "After midnight: lowest rate"
    );
    fireEvent.change(rate, { target: { value: "0.5" } });
    expect(await within(org).findByRole("alert")).toHaveTextContent(
      "between 1 and 10"
    );
    expect(
      within(org).getByRole("button", { name: "Save organisation rules" })
    ).toBeDisabled();
  });

  it("shows where department rules come from and can revert them", async () => {
    renderManager();
    const dept = section("Department rules");
    expect(
      await within(dept).findByText("This department's own rules")
    ).toBeInTheDocument();
    expect(within(dept).getByLabelText("Work pattern")).toHaveValue("WEEKDAYS");
    fireEvent.click(
      within(dept).getByRole("button", { name: "Use the organisation rules" })
    );
    await waitFor(() => expect(deleted).toBe(true));
  });

  it("turns union coverage off for one employee", async () => {
    renderManager();
    const covered = await screen.findByRole("checkbox", {
      name: "Gerad Tamar covered by the union agreement",
    });
    fireEvent.click(covered);
    await waitFor(() =>
      expect(savedProfile).toEqual({ union_covered: false, worker_type: null })
    );
  });

  it("lists overrides with who, rules and reason", async () => {
    renderManager();
    const log = section("Saved despite warnings");
    expect(
      await within(log).findByText("Two officers on sick leave")
    ).toBeInTheDocument();
    expect(within(log).getByText("Roster published")).toBeInTheDocument();
    expect(
      within(log).getByText("Too many consecutive shifts")
    ).toBeInTheDocument();
  });

  it("keeps every section visible without edit permission", async () => {
    renderManager(false, false);
    expect(await screen.findByText(ORG_ONLY)).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Only HR administrators can view and change coverage."
      )
    ).toBeInTheDocument();
    const dept = section("Department rules");
    expect(await within(dept).findByLabelText("Work pattern")).toBeDisabled();
    expect(
      within(dept).getByText("You can view these rules but not change them.")
    ).toBeInTheDocument();
  });
});
