import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMyOrganisations } from "@/lib/hr-organisations";
import OrganisationHomePage from "./page";

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

function params(orgSlug: string) {
  return { params: Promise.resolve({ orgSlug }) };
}

beforeEach(() => {
  vi.mocked(loadMyOrganisations).mockReset();
});

describe("organisation home (/<orgSlug>)", () => {
  it("links to the staff list of the organisation it shows", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA, GMS],
    });
    render(await OrganisationHomePage(params("gaa")));

    expect(
      screen.getByRole("link", { name: "View the staff list" })
    ).toHaveAttribute("href", "/gaa/staff");
  });

  it("shows the organisation the person belongs to, with their access", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA, GMS],
    });
    render(await OrganisationHomePage(params("gaa")));

    expect(
      screen.getByRole("heading", { level: 1, name: GAA.name })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your access: Your department")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "All organisations" })
    ).toHaveAttribute("href", "/");
  });

  it("refuses an organisation outside the person's list, without saying whether it exists", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GMS],
    });
    render(await OrganisationHomePage(params("gaa")));

    expect(
      screen.getByRole("heading", { name: "No access to this organisation" })
    ).toBeInTheDocument();
    expect(screen.queryByText(GAA.name)).not.toBeInTheDocument();
  });

  it("shows the no-access state when the person has no organisations", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [],
    });
    render(await OrganisationHomePage(params("gaa")));

    expect(screen.getByText("No HR access yet")).toBeInTheDocument();
  });

  it("says the organisation could not load when the read fails", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({ ok: false });
    render(await OrganisationHomePage(params("gaa")));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not load this organisation just now"
    );
  });
});
