// @vitest-environment jsdom
import type { RewardsOrgEntryPublic } from "@barrelsgd/api-client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const lib = vi.hoisted(() => ({
  listAchievements: vi.fn(),
  listChallenges: vi.fn(),
  listEntries: vi.fn(),
  listProgrammes: vi.fn(),
  listRedemptions: vi.fn(),
  listTrails: vi.fn(),
  listVenues: vi.fn(),
}));
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/org-rewards", () => lib);
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/app/organisations/[organisationId]/rewards/actions", () => ({
  addTrailStopAction: vi.fn(),
  confirmRedemptionAction: vi.fn(),
  createAchievementAction: vi.fn(),
  createChallengeAction: vi.fn(),
  createProgrammeAction: vi.fn(),
  createTrailAction: vi.fn(),
  createVenueAction: vi.fn(),
  setChallengeStatusAction: vi.fn(),
  setProgrammeStatusAction: vi.fn(),
  setTrailStatusAction: vi.fn(),
}));
vi.mock("@/components/account-layout", () => ({
  SettingsSection: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: string;
  }) => (
    <section aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  SettingsRow: ({
    action,
    children,
    description,
    title,
  }: {
    action?: ReactNode;
    children?: ReactNode;
    description?: ReactNode;
    title: string;
  }) => (
    <div data-testid={title}>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
      {children}
    </div>
  ),
  StatusBadge: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

import { AchievementsSection } from "./achievements-section";
import {
  CHALLENGES_NOT_ENABLED,
  ChallengesSection,
} from "./challenges-section";
import { ProgrammesSection } from "./programmes-section";
import { RecentEntries } from "./redemptions-section";
import { TrailsSection } from "./trails-section";
import { VenuesSection } from "./venues-section";

function contains(text: string) {
  return (content: string) => content.includes(text);
}

const PROPS = { organisationId: "org_1", token: "access" };
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function apiError(status: number, data: unknown = {}) {
  return Object.assign(new Error(`status ${status}`), { data, status });
}

describe("stamp cards", () => {
  const programme = {
    created_at: "2026-10-01T00:00:00Z",
    id: UUID_A,
    kind: "stamp_card",
    max_redemptions_per_account: null,
    name: "Coffee card",
    organisation_id: "org_1",
    qualifying_source_type: "rewards.venue_check_in",
    reward_description: "a free coffee",
    stamps_per_source: 1,
    stamps_required: 8,
    status: "active",
  };

  it("lists programmes with the source label, status and a pause button", async () => {
    lib.listProgrammes.mockResolvedValue([programme]);
    render(await ProgrammesSection(PROPS));
    expect(lib.listProgrammes).toHaveBeenCalledWith("access", "org_1");
    const row = screen.getByTestId("Coffee card");
    expect(
      within(row).getByText(contains("8 stamps for a free coffee"))
    ).toBeTruthy();
    expect(within(row).getByText(contains("Venue check-in"))).toBeTruthy();
    expect(within(row).getByText("Active")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("offers Resume for a paused card", async () => {
    lib.listProgrammes.mockResolvedValue([{ ...programme, status: "paused" }]);
    render(await ProgrammesSection(PROPS));
    const row = screen.getByTestId("Coffee card");
    expect(within(row).getByText("Paused")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Resume" })).toBeTruthy();
  });

  it("offers every source from the catalogue in the create form", async () => {
    lib.listProgrammes.mockResolvedValue([]);
    render(await ProgrammesSection(PROPS));
    const select = screen.getByLabelText("A stamp is earned by");
    expect(within(select).getAllByRole("option")).toHaveLength(5);
    expect(screen.getByText(contains("never ranked by how much"))).toBeTruthy();
  });

  it("says so when there are none", async () => {
    lib.listProgrammes.mockResolvedValue([]);
    render(await ProgrammesSection(PROPS));
    expect(screen.getByText(contains("No stamp cards yet"))).toBeTruthy();
  });

  it("shows a fallback and reports a failure", async () => {
    const failure = apiError(503);
    lib.listProgrammes.mockRejectedValue(failure);
    render(await ProgrammesSection(PROPS));
    expect(screen.getByRole("alert").textContent).toContain("isn't available");
    expect(reportError).toHaveBeenCalledWith(failure, "org-rewards-programmes");
  });
});

describe("redemptions and activity", () => {
  const entry: RewardsOrgEntryPublic = {
    amount: -8,
    created_at: "2026-10-02T15:00:00Z",
    id: "e1",
    kind: "redeem",
    program_id: UUID_A,
    program_name: "Coffee card",
    reason: null,
    settled_at: null,
    source_type: null,
    status: "pending",
  };

  it("lists entries without any account identity", async () => {
    render(
      await RecentEntries({
        area: "x",
        empty: "Nothing.",
        load: () => Promise.resolve({ data: [entry] }),
        title: "Recent redemptions",
      })
    );
    expect(screen.getByText("Reward redeemed: -8 stamps")).toBeTruthy();
    expect(screen.getByText("Waiting for staff")).toBeTruthy();
    expect(screen.queryByText(contains("@"))).toBeNull();
  });

  it("shows the empty text", async () => {
    render(
      await RecentEntries({
        area: "x",
        empty: "Nothing yet.",
        load: () => Promise.resolve({ data: [] }),
        title: "Recent redemptions",
      })
    );
    expect(screen.getByText("Nothing yet.")).toBeTruthy();
  });

  it("falls back and reports when the load fails", async () => {
    const failure = apiError(500);
    render(
      await RecentEntries({
        area: "org-rewards-entries",
        empty: "x",
        load: () => Promise.reject(failure),
        title: "Recent stamp activity",
      })
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(reportError).toHaveBeenCalledWith(failure, "org-rewards-entries");
  });
});

describe("venues", () => {
  it("links an active venue to its code screen and not an inactive one", async () => {
    lib.listVenues.mockResolvedValue([
      { active: true, created_at: "x", id: UUID_A, name: "Market" },
      { active: false, created_at: "x", id: UUID_B, name: "Old shop" },
    ]);
    render(await VenuesSection(PROPS));
    const link = screen.getByRole("link", {
      name: contains("Display check-in code"),
    });
    expect(link.getAttribute("href")).toBe(
      `/organisations/org_1/rewards/venues/${UUID_A}/code`
    );
    expect(link.getAttribute("href")).not.toContain("token|secret");
    expect(
      within(screen.getByTestId("Old shop")).queryByRole("link")
    ).toBeNull();
    expect(screen.getByText("Inactive")).toBeTruthy();
  });

  it("shows empty and error states", async () => {
    lib.listVenues.mockResolvedValue([]);
    render(await VenuesSection(PROPS));
    expect(screen.getByText(contains("No venues yet"))).toBeTruthy();
    cleanup();
    lib.listVenues.mockRejectedValue(apiError(403, { detail: "nope" }));
    render(await VenuesSection(PROPS));
    expect(screen.getByRole("alert").textContent).toContain(
      "Only owners and admins"
    );
  });
});

describe("trails", () => {
  const trail = {
    description: "",
    ends_on: null,
    id: UUID_A,
    kind: "parish",
    name: "Parish Explorer",
    organisation_id: "org_1",
    starts_on: null,
    status: "active",
    stops: [
      {
        id: "s1",
        label: "Gouyave",
        position: 1,
        required_check_in: true,
        venue_id: UUID_B,
      },
    ],
  };

  it("lists trails with ordered stops and a Pause button", async () => {
    lib.listTrails.mockResolvedValue([trail]);
    lib.listVenues.mockResolvedValue([
      { active: true, created_at: "x", id: UUID_B, name: "Fish Friday" },
    ]);
    render(await TrailsSection(PROPS));
    const row = screen.getByTestId("Parish Explorer");
    expect(within(row).getByText(contains("1. Gouyave"))).toBeTruthy();
    expect(within(row).getByText(contains("· Fish Friday"))).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(within(row).getByLabelText("Venue")).toBeTruthy();
  });

  it("offers Activate for a draft trail", async () => {
    lib.listTrails.mockResolvedValue([
      { ...trail, status: "draft", stops: [] },
    ]);
    lib.listVenues.mockResolvedValue([]);
    render(await TrailsSection(PROPS));
    const row = screen.getByTestId("Parish Explorer");
    expect(within(row).getByText("Paused (draft)")).toBeTruthy();
    expect(within(row).getByText("No stops yet.")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Activate" })).toBeTruthy();
  });

  it("still lists trails when venues fail, and reports that", async () => {
    const failure = apiError(500);
    lib.listTrails.mockResolvedValue([trail]);
    lib.listVenues.mockRejectedValue(failure);
    render(await TrailsSection(PROPS));
    expect(screen.getByTestId("Parish Explorer")).toBeTruthy();
    expect(reportError).toHaveBeenCalledWith(
      failure,
      "org-rewards-trails-venues"
    );
  });

  it("shows empty and error states", async () => {
    lib.listTrails.mockResolvedValue([]);
    lib.listVenues.mockResolvedValue([]);
    render(await TrailsSection(PROPS));
    expect(screen.getByText(contains("No trails yet"))).toBeTruthy();
    cleanup();
    lib.listTrails.mockRejectedValue(apiError(500));
    render(await TrailsSection(PROPS));
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("achievements", () => {
  const definition = {
    active: true,
    description: "",
    id: "a1",
    key: "parish-explorer",
    name: "Parish Explorer",
    organisation_id: "org_1",
    parameters: { trail_id: UUID_A },
    rule_type: "visited_all_stops_of_trail",
  };

  it("describes each rule in words", async () => {
    lib.listAchievements.mockResolvedValue([
      definition,
      {
        ...definition,
        id: "a2",
        key: "regular",
        name: "Regular",
        parameters: { n: 5 },
        rule_type: "attended_n_events",
      },
      {
        ...definition,
        id: "a3",
        key: "week",
        name: "Week",
        parameters: { days: 7 },
        rule_type: "streak_days",
      },
    ]);
    lib.listTrails.mockResolvedValue([
      { id: UUID_A, name: "Island trail", stops: [] },
    ]);
    render(await AchievementsSection(PROPS));
    expect(
      screen.getByText(contains("Visit every stop of Island trail"))
    ).toBeTruthy();
    expect(screen.getByText(contains("Attend 5 events"))).toBeTruthy();
    expect(screen.getByText(contains("Check in 7 days in a row"))).toBeTruthy();
  });

  it("shows empty and error states", async () => {
    lib.listAchievements.mockResolvedValue([]);
    lib.listTrails.mockResolvedValue([]);
    render(await AchievementsSection(PROPS));
    expect(screen.getByText(contains("No achievements yet"))).toBeTruthy();
    cleanup();
    lib.listAchievements.mockRejectedValue(apiError(500));
    render(await AchievementsSection(PROPS));
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("challenges", () => {
  const challenge = {
    completed: false,
    description: "",
    ends_at: "2026-11-30T03:59:59Z",
    id: UUID_A,
    metric: "venue_check_ins",
    name: "500 check-ins",
    organisation_id: "org_1",
    reward_description: "A shout-out",
    starts_at: "2026-11-01T04:00:00Z",
    status: "active",
    target_total: 500,
    total: 120,
  };

  it("lists challenges with aggregate progress and a Pause button", async () => {
    lib.listChallenges.mockResolvedValue([challenge]);
    render(await ChallengesSection(PROPS));
    const row = screen.getByTestId("500 check-ins");
    expect(within(row).getByText(contains("120 of 500"))).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("offers Resume when paused", async () => {
    lib.listChallenges.mockResolvedValue([{ ...challenge, status: "paused" }]);
    render(await ChallengesSection(PROPS));
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
  });

  it("explains a 404 as not enabled yet, without an alert or report noise", async () => {
    lib.listChallenges.mockRejectedValue(apiError(404));
    render(await ChallengesSection(PROPS));
    expect(screen.getByRole("status").textContent).toBe(CHALLENGES_NOT_ENABLED);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Create a challenge")).toBeNull();
  });

  it("shows a real error for other failures", async () => {
    lib.listChallenges.mockRejectedValue(apiError(500));
    render(await ChallengesSection(PROPS));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("shows the empty state", async () => {
    lib.listChallenges.mockResolvedValue([]);
    render(await ChallengesSection(PROPS));
    expect(screen.getByText(contains("never for individuals"))).toBeTruthy();
  });
});
