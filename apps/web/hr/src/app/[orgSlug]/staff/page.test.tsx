import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMyOrganisations } from "@/lib/hr-organisations";
import { loadOrganisationStaff } from "@/lib/hr-staff";
import OrganisationStaffPage from "./page";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok-1",
    email: "staff@example.com",
    name: null,
    userId: "22222222-2222-4222-8222-222222222222",
  })),
}));
vi.mock("@/lib/hr-organisations", () => ({
  loadMyOrganisations: vi.fn(),
}));
vi.mock("@/lib/hr-staff", () => ({
  loadOrganisationStaff: vi.fn(),
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
const ADA = {
  user_id: "44444444-4444-4444-8444-444444444444",
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
};
const PENDING = {
  user_id: "55555555-5555-4555-8555-555555555555",
  email: "ben@example.com",
  name: "Ben Example",
  number: "S-002",
  department_id: "dep-1",
  grade_id: "grade-1",
  mailbox_ready: false,
  email_verified: false,
  employment_ready: false,
  status: "pending",
  account_active: false,
  registration_pending: true,
};

const ADMIN_ONLY_NOTICE = /The staff list is for HR administrators/u;

function params(orgSlug: string) {
  return { params: Promise.resolve({ orgSlug }) };
}

beforeEach(() => {
  vi.mocked(loadMyOrganisations).mockReset();
  vi.mocked(loadOrganisationStaff).mockReset();
});

describe("organisation staff list (/<orgSlug>/staff)", () => {
  it("lists the staff of the organisation, read with its id from the person's own list", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA, GMS],
    });
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: true,
      staff: [ADA, PENDING],
    });
    render(await OrganisationStaffPage(params("gaa")));

    expect(
      screen.getByRole("heading", { level: 1, name: "Staff" })
    ).toBeInTheDocument();
    expect(loadOrganisationStaff).toHaveBeenCalledWith("tok-1", GAA.id);
    expect(screen.getByText("2 staff records")).toBeInTheDocument();

    const items = within(
      screen.getByRole("list", { name: "Staff" })
    ).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Ada Example");
    expect(items[0]).toHaveTextContent("Active");
    expect(items[0]).toHaveTextContent("Account:enabled");
    expect(items[0]).toHaveTextContent("Employee number:E-100");

    expect(items[1]).toHaveTextContent("Ben Example");
    expect(items[1]).toHaveTextContent("Pending");
    expect(items[1]).toHaveTextContent("Staff access:approval needed");
    expect(items[1]).toHaveTextContent("Email:verification pending");
    expect(items[1]).toHaveTextContent("Employee number:not set");
  });

  it("says plainly when the organisation has no staff records yet", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA],
    });
    vi.mocked(loadOrganisationStaff).mockResolvedValue({ ok: true, staff: [] });
    render(await OrganisationStaffPage(params("gaa")));

    expect(
      screen.getByText("No staff records for this organisation yet.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Staff" })
    ).not.toBeInTheDocument();
  });

  it("explains that the list is for HR administrators when the API refuses, without an alert", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA],
    });
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: false,
      reason: "not-admin",
    });
    render(await OrganisationStaffPage(params("gaa")));

    expect(screen.getByText(ADMIN_ONLY_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Staff" })
    ).not.toBeInTheDocument();
  });

  it("says the staff list could not load when the read fails, and never shows an empty list", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA],
    });
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });
    render(await OrganisationStaffPage(params("gaa")));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not load the staff list just now"
    );
    expect(
      screen.queryByText("No staff records for this organisation yet.")
    ).not.toBeInTheDocument();
  });

  it("uses the same no-access wording when the API says the organisation is not visible", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA, GMS],
    });
    vi.mocked(loadOrganisationStaff).mockResolvedValue({
      ok: false,
      reason: "not-found",
    });
    render(await OrganisationStaffPage(params("gaa")));

    expect(
      screen.getByRole("heading", { name: "No access to this organisation" })
    ).toBeInTheDocument();
    expect(screen.queryByText(GAA.name)).not.toBeInTheDocument();
  });

  it("refuses a slug outside the person's list without reading any staff", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GMS],
    });
    render(await OrganisationStaffPage(params("gaa")));

    expect(
      screen.getByRole("heading", { name: "No access to this organisation" })
    ).toBeInTheDocument();
    expect(screen.queryByText(GAA.name)).not.toBeInTheDocument();
    expect(loadOrganisationStaff).not.toHaveBeenCalled();
  });

  it("shows the no-access state, and reads no staff, when the person has no organisations", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [],
    });
    render(await OrganisationStaffPage(params("gaa")));

    expect(screen.getByText("No HR access yet")).toBeInTheDocument();
    expect(loadOrganisationStaff).not.toHaveBeenCalled();
  });

  it("says the organisation could not load when the organisation list fails, and reads no staff", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({ ok: false });
    render(await OrganisationStaffPage(params("gaa")));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not load this organisation just now"
    );
    expect(loadOrganisationStaff).not.toHaveBeenCalled();
  });
});
