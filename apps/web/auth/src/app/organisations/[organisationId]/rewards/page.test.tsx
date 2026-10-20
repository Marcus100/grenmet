// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listMyOrganisations = vi.hoisted(() => vi.fn());
const listProgrammes = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
);

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/account", () => ({
  requireAccount: vi.fn().mockResolvedValue({ access_token: "access" }),
}));
vi.mock("@/lib/account-organisations", () => ({ listMyOrganisations }));
vi.mock("@/lib/org-rewards", () => ({ listProgrammes }));
vi.mock("@/components/account-layout", () => ({
  AccountLayout: ({
    children,
    description,
  }: {
    children: ReactNode;
    description?: string;
  }) => (
    <main>
      <p data-testid="description">{description}</p>
      {children}
    </main>
  ),
}));
vi.mock("@/components/org-rewards/achievements-section", () => ({
  AchievementsSection: ({ organisationId }: { organisationId: string }) => (
    <p>achievements section for {organisationId}</p>
  ),
}));

vi.mock("@/components/org-rewards/challenges-section", () => ({
  ChallengesSection: ({ organisationId }: { organisationId: string }) => (
    <p>challenges section for {organisationId}</p>
  ),
}));

vi.mock("@/components/org-rewards/programmes-section", () => ({
  ProgrammesSection: ({ organisationId }: { organisationId: string }) => (
    <p>programmes section for {organisationId}</p>
  ),
}));

vi.mock("@/components/org-rewards/redemptions-section", () => ({
  RedemptionsSection: ({ organisationId }: { organisationId: string }) => (
    <p>redemptions section for {organisationId}</p>
  ),
}));

vi.mock("@/components/org-rewards/trails-section", () => ({
  TrailsSection: ({ organisationId }: { organisationId: string }) => (
    <p>trails section for {organisationId}</p>
  ),
}));

vi.mock("@/components/org-rewards/venues-section", () => ({
  VenuesSection: ({ organisationId }: { organisationId: string }) => (
    <p>venues section for {organisationId}</p>
  ),
}));

function membership(role: string, status = "active") {
  return {
    joined_at: "2026-10-18T10:00:00Z",
    membership_id: "mem_1",
    organisation: {
      id: "org_1",
      kind: "business",
      name: "Spice Isle Tours",
      slug: "spice-isle-tours",
      status,
      verified_at: null,
    },
    role,
    status: "active",
  };
}

import Page from "./page";

async function show(organisationId = "org_1") {
  render(await Page({ params: Promise.resolve({ organisationId }) }));
}

async function failure(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    return error instanceof Error ? error.message : "non-error";
  }
  return "no error";
}

function apiError(status: number, detail: string) {
  return Object.assign(new Error(detail), { data: { detail }, status });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("organisation rewards page gating", () => {
  it("shows every section to an admin of an entitled organisation", async () => {
    listMyOrganisations.mockResolvedValue([membership("admin")]);
    listProgrammes.mockResolvedValue([]);
    await show();
    expect(listProgrammes).toHaveBeenCalledWith("access", "org_1");
    expect(screen.getByText("programmes section for org_1")).toBeTruthy();
    expect(screen.getByText("venues section for org_1")).toBeTruthy();
    expect(screen.getByText("challenges section for org_1")).toBeTruthy();
    expect(screen.getByTestId("description").textContent).toContain(
      "real-world check-ins"
    );
    expect(screen.getByTestId("description").textContent).toContain(
      "Nothing here ranks people by how much they spend"
    );
  });

  it("explains instead of listing for a plain member, without calling the API", async () => {
    listMyOrganisations.mockResolvedValue([membership("member")]);
    await show();
    expect(screen.getByText("Owners and admins only")).toBeTruthy();
    expect(screen.queryByText("programmes section for org_1")).toBeNull();
    expect(listProgrammes).not.toHaveBeenCalled();
  });

  it("explains when the organisation has no rewards entitlement (API 403)", async () => {
    listMyOrganisations.mockResolvedValue([membership("owner")]);
    listProgrammes.mockRejectedValue(
      apiError(403, "This organisation is not entitled to this app")
    );
    await show();
    expect(
      screen.getByText("Rewards isn't switched on for this organisation")
    ).toBeTruthy();
    expect(screen.queryByText("programmes section for org_1")).toBeNull();
  });

  it("explains a role or suspension 403 differently", async () => {
    listMyOrganisations.mockResolvedValue([membership("owner")]);
    listProgrammes.mockRejectedValue(apiError(403, "Organisation suspended"));
    await show();
    expect(screen.getByText("You can't manage rewards right now")).toBeTruthy();
  });

  it("still renders the sections when the probe fails for another reason", async () => {
    listMyOrganisations.mockResolvedValue([membership("owner")]);
    listProgrammes.mockRejectedValue(apiError(500, "boom"));
    await show();
    expect(screen.getByText("trails section for org_1")).toBeTruthy();
  });

  it("is a 404 for an organisation the person doesn't belong to", async () => {
    listMyOrganisations.mockResolvedValue([membership("admin")]);
    expect(await failure(show("org_other"))).toBe("NOT_FOUND");
    expect(listProgrammes).not.toHaveBeenCalled();
  });

  it("is a 404 for a malformed id", async () => {
    expect(await failure(show("../x"))).toBe("NOT_FOUND");
    expect(listMyOrganisations).not.toHaveBeenCalled();
  });
});
