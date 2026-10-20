// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listMyRewardCards = vi.hoisted(() => vi.fn());
const listMyBadges = vi.hoisted(() => vi.fn());
vi.mock("@/lib/account", () => ({
  requireAccount: vi.fn().mockResolvedValue({ access_token: "access" }),
}));
const getMyPassport = vi.hoisted(() => vi.fn());
const listMyAchievements = vi.hoisted(() => vi.fn());
const getMyStreak = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/account-rewards", () => ({
  getMyPassport,
  getMyStreak,
  listMyAchievements,
  listMyBadges,
  listMyRewardCards,
}));
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("./actions", () => ({ checkIn: vi.fn(), redeemCard: vi.fn() }));
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
    <div>
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

import RewardsPage from "./page";

async function show(params: Record<string, string> = {}) {
  render(await RewardsPage({ searchParams: Promise.resolve(params) }));
}

const CARD = {
  available: 2,
  balance: 2,
  can_redeem: true,
  open_redemption_code: null,
  organisation_id: "org_1",
  organisation_name: "Spice Cafe",
  pending: 0,
  program_id: "11111111-1111-4111-8111-111111111111",
  program_name: "Coffee card",
  redemptions: 0,
  reward_description: "A free coffee",
  stamps_required: 2,
};

const BADGES = [
  {
    available: true,
    count: 0,
    description: "You act for a verified organisation.",
    earned: false,
    key: "verified_organiser",
    label: "Verified organiser",
    since: null,
  },
  {
    available: false,
    count: 0,
    description: "Admitted at the door.",
    earned: false,
    key: "verified_attendee",
    label: "Verified attendee",
    since: null,
  },
];

const TRAIL = {
  completed: false,
  description: "Visit the parishes",
  ends_on: null,
  id: "t1",
  kind: "parish",
  name: "Parish Explorer",
  organisation_id: null,
  required: 3,
  starts_on: null,
  stamped: 1,
  stops: [
    {
      id: "s1",
      label: "St George's",
      position: 1,
      required_check_in: true,
      stamped_at: "2026-10-01T10:00:00Z",
    },
    {
      id: "s2",
      label: "Gouyave",
      position: 2,
      required_check_in: true,
      stamped_at: null,
    },
  ],
};

const STREAK = {
  checked_in_today: true,
  current_days: 3,
  last_check_in: "2026-10-20",
  longest_days: 5,
};

beforeEach(() => {
  getMyPassport.mockResolvedValue([]);
  listMyAchievements.mockResolvedValue([]);
  getMyStreak.mockResolvedValue({
    checked_in_today: false,
    current_days: 0,
    last_check_in: null,
    longest_days: 0,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RewardsPage", () => {
  it("explains an empty account and still shows the badges", async () => {
    listMyRewardCards.mockResolvedValue([]);
    listMyBadges.mockResolvedValue(BADGES);
    await show();
    expect(
      screen.getByText("No stamps yet", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
    expect(screen.getByText("Unavailable right now")).toBeInTheDocument();
  });

  it("offers Redeem only for a full card", async () => {
    listMyRewardCards.mockResolvedValue([
      CARD,
      { ...CARD, can_redeem: false, program_id: "p2", program_name: "Other" },
    ]);
    listMyBadges.mockResolvedValue(BADGES);
    await show();
    expect(screen.getAllByRole("button", { name: "Redeem" })).toHaveLength(1);
    expect(screen.getAllByText("2 of 2 stamps", { exact: false })).toHaveLength(
      2
    );
  });

  it("shows the code staff need while a redemption is open", async () => {
    listMyRewardCards.mockResolvedValue([
      { ...CARD, can_redeem: false, open_redemption_code: "ABCD2345" },
    ]);
    listMyBadges.mockResolvedValue(BADGES);
    await show({ notice: "redeeming" });
    expect(
      screen.getByText("Show staff code ABCD2345", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("code below");
  });

  it("renders passport trails with stamped stops and progress", async () => {
    listMyRewardCards.mockResolvedValue([]);
    listMyBadges.mockResolvedValue(BADGES);
    getMyPassport.mockResolvedValue([TRAIL]);
    await show();
    expect(screen.getByText("Parish Explorer")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 stamps")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Parish Explorer progress" })
    ).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("Stamped")).toBeInTheDocument();
    expect(screen.getAllByText("Not yet").length).toBeGreaterThan(0);
  });

  it("explains an empty passport and empty achievements", async () => {
    listMyRewardCards.mockResolvedValue([]);
    listMyBadges.mockResolvedValue(BADGES);
    await show();
    expect(
      screen.getByText("No trails yet", { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.getByText("No achievements to show yet.")
    ).toBeInTheDocument();
  });

  it("lists achievements as earned or not yet", async () => {
    listMyRewardCards.mockResolvedValue([]);
    listMyBadges.mockResolvedValue(BADGES);
    listMyAchievements.mockResolvedValue([
      {
        awarded_at: "2026-10-02T09:00:00Z",
        description: "Check in once.",
        earned: true,
        key: "first_check_in",
        name: "First visit",
      },
      {
        awarded_at: null,
        description: "Seven days running.",
        earned: false,
        key: "week",
        name: "Week streak",
      },
    ]);
    await show();
    expect(screen.getByText("First visit")).toBeInTheDocument();
    expect(screen.getByText("Earned 2026-10-02")).toBeInTheDocument();
    expect(screen.getByText("Week streak")).toBeInTheDocument();
  });

  it("shows the check-in streak", async () => {
    listMyRewardCards.mockResolvedValue([]);
    listMyBadges.mockResolvedValue(BADGES);
    getMyStreak.mockResolvedValue(STREAK);
    await show();
    expect(screen.getByText("Current streak: 3 days")).toBeInTheDocument();
    expect(screen.getByText("Checked in today")).toBeInTheDocument();
    expect(
      screen.getByText("Longest streak: 5 days", { exact: false })
    ).toBeInTheDocument();
  });

  it("states that rewards need real visits and offers a labelled form", async () => {
    listMyRewardCards.mockResolvedValue([]);
    listMyBadges.mockResolvedValue(BADGES);
    await show();
    expect(
      screen.getByText("not from opening the app", { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.getByText("no ranking by spend", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Venue code")).toBeRequired();
    expect(screen.getByRole("button", { name: "Check in" })).toBeEnabled();
  });

  it.each([
    ["checked-in", "status", "You're checked in"],
    ["already-checked-in", "status", "already checked in at this venue today"],
    ["invalid-code", "alert", "isn't valid or has expired"],
    ["unavailable", "alert", "isn't available right now"],
  ])("explains the %s check-in outcome", async (code, role, text) => {
    listMyRewardCards.mockResolvedValue([]);
    listMyBadges.mockResolvedValue(BADGES);
    await show({ notice: code });
    expect(screen.getByRole(role)).toHaveTextContent(text);
  });

  it("falls back per section and reports when a section fails", async () => {
    listMyRewardCards.mockResolvedValue([]);
    listMyBadges.mockResolvedValue(BADGES);
    getMyPassport.mockRejectedValue(new Error("boom"));
    getMyStreak.mockRejectedValue(new Error("boom"));
    await show();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "rewards-passport"
    );
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "rewards-streak"
    );
    expect(screen.getByText("Verified organiser")).toBeInTheDocument();
  });
});
