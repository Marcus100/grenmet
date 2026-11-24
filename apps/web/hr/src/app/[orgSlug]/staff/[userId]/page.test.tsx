import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMyOrganisations } from "@/lib/hr-organisations";
import { loadOrganisationGrades, loadOrganisationStaff } from "@/lib/hr-staff";
import StaffRecordPage from "./page";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok-1",
    email: "hr@example.com",
    name: null,
    userId: "22222222-2222-4222-8222-222222222222",
  })),
}));
vi.mock("@/lib/hr-organisations", () => ({
  loadMyOrganisations: vi.fn(),
}));
vi.mock("@/lib/hr-staff", () => ({
  loadOrganisationStaff: vi.fn(),
  loadOrganisationGrades: vi.fn(),
}));

const GAA = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "gaa",
  name: "Grenada Airports Authority",
  scope: "DEPARTMENT" as const,
};
const GMS = {
  id: "33333333-3333-4333-8333-333333333333",
  slug: "gms",
  name: "Grenada Meteorological Service",
  scope: "SELF" as const,
};
const SUPERVISOR_ID = "66666666-6666-4666-8666-666666666666";
const ADA_ID = "44444444-4444-4444-8444-444444444444";
const ADA = {
  user_id: ADA_ID,
  email: "ada@example.com",
  name: "Ada Example",
  number: "S-001",
  department_id: "dep-1",
  grade_id: "grade-1",
  mailbox_ready: true,
  email_verified: true,
  employment_ready: true,
  status: "active",
  account_active: true,
  registration_pending: false,
  employee_number: "E-100",
  employment_type: "FULL_TIME" as const,
  start_date: "2019-03-04",
  continuous_service_date: "2019-03-04",
  probation_end_date: null,
  probation_completed_date: null,
  service_details_source: "Personnel file, 2019",
  supervisor_id: SUPERVISOR_ID,
  staff_approval_ready: true,
};
const SUPERVISOR = {
  ...ADA,
  user_id: SUPERVISOR_ID,
  name: "Sam Supervisor",
  email: "sam@example.com",
  number: "S-009",
  employee_number: null,
  supervisor_id: null,
  employment_type: null,
  start_date: null,
  continuous_service_date: null,
  service_details_source: null,
};
const GRADE = {
  id: "grade-1",
  department_id: "dep-1",
  code: "OFFICER",
  label: "Officer II",
  rank: 3,
  establishment_band: null,
  is_active: true,
};

const NOT_ADMIN_NOTICE = /Staff records are for HR administrators/u;
const UNAVAILABLE = /We could not load this staff record just now/u;

function params(orgSlug: string, userId: string) {
  return { params: Promise.resolve({ orgSlug, userId }) };
}

function givenOrganisations(
  organisations: (typeof GAA | typeof GMS)[] = [GAA, GMS]
) {
  vi.mocked(loadMyOrganisations).mockResolvedValue({
    ok: true,
    organisations,
  });
}

beforeEach(() => {
  vi.mocked(loadMyOrganisations).mockReset();
  vi.mocked(loadOrganisationStaff).mockReset();
  vi.mocked(loadOrganisationGrades).mockReset();
});

describe("staff record (/<orgSlug>/staff/<userId>)", () => {
  it("shows one person's record, with the grade and supervisor named and empty facts as not set", async () => {
    givenOrganisations();
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: true,
      staff: [ADA, SUPERVISOR],
    });
    vi.mocked(loadOrganisationGrades).mockResolvedValue({
      ok: true,
      grades: [GRADE],
    });
    render(await StaffRecordPage(params("gaa", ADA_ID)));

    expect(
      screen.getByRole("heading", { level: 1, name: "Ada Example" })
    ).toBeInTheDocument();
    // Read with the id from the person's own organisation, after the slug check.
    expect(loadOrganisationStaff).toHaveBeenCalledWith("tok-1", GAA.id);
    expect(loadOrganisationGrades).toHaveBeenCalledWith("tok-1", GAA.id);

    const access = screen.getByRole("heading", {
      name: "Account and access",
    });
    expect(access.parentElement).toHaveTextContent("Active");
    expect(access.parentElement).toHaveTextContent("Account:enabled");
    expect(access.parentElement).toHaveTextContent("Email:verified");
    expect(access.parentElement).toHaveTextContent("Staff access:approved");

    const employment = within(
      screen.getByRole("heading", { name: "Employment and service" })
        .parentElement as HTMLElement
    );
    expect(employment.getByText("Officer II")).toBeInTheDocument();
    expect(employment.getByText("Full time")).toBeInTheDocument();
    // Start and continuous service are both 4 March 2019 for Ada.
    expect(employment.getAllByText("4 March 2019")).toHaveLength(2);
    expect(employment.getByText("Sam Supervisor")).toBeInTheDocument();
    expect(employment.getByText("Personnel file, 2019")).toBeInTheDocument();
    expect(employment.getByText("E-100")).toBeInTheDocument();
    // Both probation dates are empty for Ada: shown as not set, not hidden.
    expect(employment.getAllByText("Not set")).toHaveLength(2);
  });

  it("names a supervisor who is not on this staff list as set, without showing a raw id", async () => {
    givenOrganisations();
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: true,
      staff: [ADA],
    });
    vi.mocked(loadOrganisationGrades).mockResolvedValue({
      ok: true,
      grades: [GRADE],
    });
    render(await StaffRecordPage(params("gaa", ADA_ID)));

    expect(
      screen.getByText("set (not on this staff list)")
    ).toBeInTheDocument();
    expect(screen.queryByText(SUPERVISOR_ID)).not.toBeInTheDocument();
  });

  it("keeps the record visible and says the grade could not load when only the grade read fails", async () => {
    givenOrganisations();
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: true,
      staff: [ADA, SUPERVISOR],
    });
    vi.mocked(loadOrganisationGrades).mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });
    render(await StaffRecordPage(params("gaa", ADA_ID)));

    expect(
      screen.getByRole("heading", { level: 1, name: "Ada Example" })
    ).toBeInTheDocument();
    expect(screen.getByText("could not load just now")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says the grade is not recognised when it is not in the organisation's grade list", async () => {
    givenOrganisations();
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: true,
      staff: [ADA, SUPERVISOR],
    });
    vi.mocked(loadOrganisationGrades).mockResolvedValue({
      ok: true,
      grades: [],
    });
    render(await StaffRecordPage(params("gaa", ADA_ID)));

    expect(screen.getByText("not recognised")).toBeInTheDocument();
  });

  it("says no record was found when the id is not on this organisation's list, and never shows an empty record", async () => {
    givenOrganisations();
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: true,
      staff: [SUPERVISOR],
    });
    render(await StaffRecordPage(params("gaa", ADA_ID)));

    expect(
      screen.getByRole("heading", { name: "No staff record found" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to the staff list" })
    ).toHaveAttribute("href", "/gaa/staff");
    expect(loadOrganisationGrades).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains that records are for HR administrators when the API refuses, without an alert", async () => {
    givenOrganisations();
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: false,
      reason: "not-admin",
    });
    render(await StaffRecordPage(params("gaa", ADA_ID)));

    expect(screen.getByText(NOT_ADMIN_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(loadOrganisationGrades).not.toHaveBeenCalled();
  });

  it("says the record could not load when the staff read fails, and never shows an empty record", async () => {
    givenOrganisations();
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });
    render(await StaffRecordPage(params("gaa", ADA_ID)));

    expect(screen.getByRole("alert")).toHaveTextContent(UNAVAILABLE);
    expect(
      screen.queryByRole("heading", { name: "No staff record found" })
    ).not.toBeInTheDocument();
  });

  it("uses the no-access wording for a slug outside the person's list, and never reads staff", async () => {
    givenOrganisations();
    render(await StaffRecordPage(params("elsewhere", ADA_ID)));

    expect(
      screen.getByRole("heading", { name: "No access to this organisation" })
    ).toBeInTheDocument();
    expect(loadOrganisationStaff).not.toHaveBeenCalled();
  });

  it("uses the same no-access wording when the API will not show the organisation", async () => {
    givenOrganisations();
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: false,
      reason: "not-found",
    });
    render(await StaffRecordPage(params("gaa", ADA_ID)));

    expect(
      screen.getByRole("heading", { name: "No access to this organisation" })
    ).toBeInTheDocument();
  });

  it("shows the no-access page when the person has no HR organisations, without reading staff", async () => {
    givenOrganisations([]);
    render(await StaffRecordPage(params("gaa", ADA_ID)));

    expect(
      screen.queryByRole("heading", { name: "Ada Example" })
    ).not.toBeInTheDocument();
    expect(loadOrganisationStaff).not.toHaveBeenCalled();
  });

  it("says the organisation could not load when the organisation list fails, and reads nothing", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({ ok: false });
    render(await StaffRecordPage(params("gaa", ADA_ID)));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not load this organisation just now."
    );
    expect(loadOrganisationStaff).not.toHaveBeenCalled();
  });
});
