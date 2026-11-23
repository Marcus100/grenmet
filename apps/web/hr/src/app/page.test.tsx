import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMyOrganisations } from "@/lib/hr-organisations";
import OrganisationPickerPage from "./page";

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
  scope: "ALL" as const,
};
const GMS = {
  id: "33333333-3333-4333-8333-333333333333",
  slug: "gms",
  name: "Grenada Meteorological Service",
  scope: "SELF" as const,
};

beforeEach(() => {
  vi.mocked(loadMyOrganisations).mockReset();
});

describe("organisation picker (/)", () => {
  it("links each organisation to its own home and names its access", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [GAA, GMS],
    });
    render(await OrganisationPickerPage());

    const list = screen.getByRole("list");
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/gaa",
      "/gms",
    ]);
    expect(within(list).getByText("Whole organisation")).toBeInTheDocument();
    expect(within(list).getByText("Own record only")).toBeInTheDocument();
  });

  it("shows the no-access state when the list is empty", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({
      ok: true,
      organisations: [],
    });
    render(await OrganisationPickerPage());

    expect(screen.getByText("No HR access yet")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("says the list could not load, and does not claim no access, when the read fails", async () => {
    vi.mocked(loadMyOrganisations).mockResolvedValue({ ok: false });
    render(await OrganisationPickerPage());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not load your organisations just now"
    );
    expect(screen.queryByText("No HR access yet")).not.toBeInTheDocument();
  });
});
