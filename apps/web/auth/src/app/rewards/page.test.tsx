// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listMyRewardCards = vi.hoisted(() => vi.fn());
const listMyBadges = vi.hoisted(() => vi.fn());
vi.mock("@/lib/account", () => ({
  requireAccount: vi.fn().mockResolvedValue({ access_token: "access" }),
}));
vi.mock("@/lib/account-rewards", () => ({ listMyBadges, listMyRewardCards }));
vi.mock("./actions", () => ({ redeemCard: vi.fn() }));
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
});
