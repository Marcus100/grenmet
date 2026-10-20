// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listMyOrganisations = vi.hoisted(() => vi.fn());
const canManageRewards = vi.hoisted(() => vi.fn());
vi.mock("@/lib/account", () => ({
  requireAccount: vi.fn().mockResolvedValue({ access_token: "access" }),
}));
vi.mock("@/lib/account-organisations", () => ({ listMyOrganisations }));
vi.mock("@/lib/org-rewards", () => ({ canManageRewards }));
vi.mock("@/components/account-layout", () => ({
  AccountLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  SettingsSection: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  SettingsRow: ({
    action,
    children,
    description,
    title,
  }: {
    action?: React.ReactNode;
    children?: React.ReactNode;
    description?: React.ReactNode;
    title: string;
  }) => (
    <div data-testid={title}>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
      {children}
    </div>
  ),
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

import OrganisationsPage from "./page";

async function show(params: Record<string, string> = {}) {
  render(await OrganisationsPage({ searchParams: Promise.resolve(params) }));
}

function membership(overrides: Record<string, unknown> = {}) {
  return {
    joined_at: "2026-10-18T10:00:00Z",
    membership_id: "mem_1",
    role: "owner",
    status: "active",
    organisation: {
      id: "org_1",
      kind: "business",
      name: "Spice Isle Tours",
      slug: "spice-isle-tours",
      status: "active",
      verified_at: null,
    },
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

function rewardsLink(name: string) {
  return within(screen.getByTestId(name)).queryByRole("link", {
    name: (text) => text.startsWith("Manage rewards"),
  });
}

describe("/organisations", () => {
  it("lists my memberships with the role in each", async () => {
    listMyOrganisations.mockResolvedValue([
      membership(),
      membership({
        membership_id: "mem_2",
        role: "member",
        organisation: {
          id: "org_2",
          kind: "client",
          name: "Grenada Airports",
          slug: "gaa",
          status: "active",
          verified_at: "2026-01-01T00:00:00Z",
        },
      }),
    ]);
    await show();
    expect(listMyOrganisations).toHaveBeenCalledWith("access");
    const tours = screen.getByTestId("Spice Isle Tours");
    expect(within(tours).getByText("Owner")).toBeTruthy();
    expect(within(tours).getByText("Joined 18 Oct 2026")).toBeTruthy();
    const airports = screen.getByTestId("Grenada Airports");
    expect(within(airports).getByText("Member")).toBeTruthy();
    expect(within(airports).getByText("Verified")).toBeTruthy();
  });

  it("explains how to join when there are none", async () => {
    listMyOrganisations.mockResolvedValue([]);
    await show();
    expect(
      screen.getByText(
        "You are not part of an organisation yet. Ask an owner or admin to invite you, then open the link in your email."
      )
    ).toBeTruthy();
  });

  it("says when an organisation is suspended", async () => {
    listMyOrganisations.mockResolvedValue([
      membership({
        organisation: {
          id: "org_3",
          kind: "business",
          name: "Frozen Ltd",
          slug: "frozen",
          status: "suspended",
          verified_at: null,
        },
      }),
    ]);
    await show();
    expect(screen.getByText("This organisation is suspended.")).toBeTruthy();
  });

  it("shows only a fixed notice for a known code", async () => {
    listMyOrganisations.mockResolvedValue([]);
    await show({ notice: "joined" });
    expect(screen.getByRole("status").textContent).toBe(
      "You joined the organisation."
    );
  });

  it("ignores an unknown notice code", async () => {
    listMyOrganisations.mockResolvedValue([]);
    await show({ notice: "<script>" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  describe("rewards admin link", () => {
    it("is offered to an owner or admin of an organisation with rewards", async () => {
      canManageRewards.mockResolvedValue(true);
      listMyOrganisations.mockResolvedValue([
        membership(),
        membership({
          membership_id: "mem_2",
          organisation: {
            id: "org_2",
            kind: "business",
            name: "Admin Co",
            slug: "admin-co",
            status: "active",
            verified_at: null,
          },
          role: "admin",
        }),
      ]);
      await show();
      expect(canManageRewards).toHaveBeenCalledWith("access", "org_1");
      expect(rewardsLink("Spice Isle Tours")?.getAttribute("href")).toBe(
        "/organisations/org_1/rewards"
      );
      expect(rewardsLink("Admin Co")?.getAttribute("href")).toBe(
        "/organisations/org_2/rewards"
      );
    });

    it("is hidden for a plain member, without probing the API", async () => {
      listMyOrganisations.mockResolvedValue([membership({ role: "member" })]);
      await show();
      expect(rewardsLink("Spice Isle Tours")).toBeNull();
      expect(canManageRewards).not.toHaveBeenCalled();
    });

    it("is hidden when the organisation has no rewards entitlement", async () => {
      canManageRewards.mockResolvedValue(false);
      listMyOrganisations.mockResolvedValue([membership()]);
      await show();
      expect(rewardsLink("Spice Isle Tours")).toBeNull();
    });

    it("is hidden for a suspended organisation", async () => {
      listMyOrganisations.mockResolvedValue([
        membership({
          organisation: {
            id: "org_3",
            kind: "business",
            name: "Frozen Ltd",
            slug: "frozen",
            status: "suspended",
            verified_at: null,
          },
        }),
      ]);
      await show();
      expect(rewardsLink("Frozen Ltd")).toBeNull();
      expect(canManageRewards).not.toHaveBeenCalled();
    });
  });
});
