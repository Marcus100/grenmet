import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMyEmployment } from "@/lib/hr-me-employment";
import { loadMyOrganisations } from "@/lib/hr-organisations";
import MyRecordPage from "./page";

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
vi.mock("@/lib/hr-me-employment", () => ({
  loadMyEmployment: vi.fn(),
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
const RECORD = {
  organisation_id: GAA.id,
  status: "ACTIVE" as const,
  position: "Forecaster",
  department_name: "Forecasting",
  employment_type: "FULL_TIME" as const,
  start_date: "2024-03-01",
  end_date: null,
  leave_balances: [
    { leave_type: "VACATION", balance_days: "12" },
    { leave_type: "PROFESSIONAL_APPOINTMENT", balance_days: "1" },
  ],
};

const NO_RECORD = /You have no current employment record in this organisation/u;
const NO_ACCESS_HEADING = "No access to this organisation";

function params(orgSlug: string) {
  return { params: Promise.resolve({ orgSlug }) };
}

beforeEach(() => {
  vi.mocked(loadMyOrganisations).mockReset();
  vi.mocked(loadMyEmployment).mockReset();
});

describe("my record (/<orgSlug>/me)", () => {
  it("shows status, position, department, type, start date and leave balances in words", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA, GMS],
    });
    vi.mocked(loadMyEmployment).mockResolvedValue({
      ok: true,
      employment: RECORD,
    });
    render(await MyRecordPage(params("gaa")));

    expect(
      screen.getByRole("heading", { level: 1, name: "My record" })
    ).toBeInTheDocument();
    expect(loadMyEmployment).toHaveBeenCalledWith("tok-1", GAA.id);

    expect(screen.getByText("Active")).toBeInTheDocument();
    const facts = screen.getByText("Position").parentElement
      ?.parentElement as HTMLElement;
    expect(within(facts).getByText("Forecaster")).toBeInTheDocument();
    expect(within(facts).getByText("Forecasting")).toBeInTheDocument();
    expect(within(facts).getByText("Full time")).toBeInTheDocument();
    expect(within(facts).getByText("1 March 2024")).toBeInTheDocument();
    expect(screen.queryByText("End date")).not.toBeInTheDocument();

    const balances = within(
      screen.getByRole("list", { name: "Leave balances" })
    ).getAllByRole("listitem");
    expect(balances).toHaveLength(2);
    expect(balances[0]).toHaveTextContent("Vacation");
    expect(balances[0]).toHaveTextContent("12 days");
    expect(balances[1]).toHaveTextContent("Professional appointment");
    expect(balances[1]).toHaveTextContent("1 day");
  });

  it("shows the end date when the record has one, and says no leave balances yet when empty", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA],
    });
    vi.mocked(loadMyEmployment).mockResolvedValue({
      ok: true,
      employment: {
        ...RECORD,
        status: "INACTIVE",
        position: null,
        end_date: "2026-06-30",
        leave_balances: [],
      },
    });
    render(await MyRecordPage(params("gaa")));

    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("30 June 2026")).toBeInTheDocument();
    expect(screen.getByText("Not set", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("No leave balances yet.")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Leave balances" })
    ).not.toBeInTheDocument();
  });

  it("says plainly when there is no current employment record, without an alert", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA],
    });
    vi.mocked(loadMyEmployment).mockResolvedValue({
      ok: false,
      reason: "not-employed",
    });
    render(await MyRecordPage(params("gaa")));

    expect(screen.getByText(NO_RECORD)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Employment")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No leave balances yet.")
    ).not.toBeInTheDocument();
  });

  it("uses the shared no-access wording when the API refuses the read", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA, GMS],
    });
    vi.mocked(loadMyEmployment).mockResolvedValue({
      ok: false,
      reason: "not-granted",
    });
    render(await MyRecordPage(params("gaa")));

    expect(
      screen.getByRole("heading", { name: NO_ACCESS_HEADING })
    ).toBeInTheDocument();
    expect(screen.queryByText(GAA.name)).not.toBeInTheDocument();
  });

  it("says the record could not load when the read fails, and never shows an empty record", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA],
    });
    vi.mocked(loadMyEmployment).mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });
    render(await MyRecordPage(params("gaa")));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not load your record just now"
    );
    expect(screen.queryByText(NO_RECORD)).not.toBeInTheDocument();
    expect(
      screen.queryByText("No leave balances yet.")
    ).not.toBeInTheDocument();
  });

  it("refuses a slug outside the person's list and reads no record", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GMS],
    });
    render(await MyRecordPage(params("gaa")));

    expect(
      screen.getByRole("heading", { name: NO_ACCESS_HEADING })
    ).toBeInTheDocument();
    expect(screen.queryByText(GAA.name)).not.toBeInTheDocument();
    expect(loadMyEmployment).not.toHaveBeenCalled();
  });

  it("shows the no-access state, and reads no record, when the person has no organisations", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [],
    });
    render(await MyRecordPage(params("gaa")));

    expect(screen.getByText("No HR access yet")).toBeInTheDocument();
    expect(loadMyEmployment).not.toHaveBeenCalled();
  });

  it("says the organisation could not load when the organisation list fails, and reads no record", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({ ok: false });
    render(await MyRecordPage(params("gaa")));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not load this organisation just now"
    );
    expect(loadMyEmployment).not.toHaveBeenCalled();
  });
});
