import type { Metadata } from "next";
import {
  AccountLayout,
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { requireAccount } from "@/lib/account";
import { listMyBadges, listMyRewardCards } from "@/lib/account-rewards";
import { readQueryParam } from "@/lib/return-to";
import { redeemCard } from "./actions";

export const metadata: Metadata = { title: "Rewards — Barrels account" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  failed: "That didn't work. Try again, or ask the team if it keeps happening.",
  "not-ready":
    "That card can't be redeemed right now: you need a full card and no open redemption.",
  redeeming:
    "Your reward is ready. Show the code below to staff to collect it.",
};

const BUTTON =
  "rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted";

function badgeStatus(badge: { earned: boolean; available: boolean }): string {
  if (badge.earned) return "Earned";
  return badge.available ? "Not yet" : "Unavailable right now";
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RewardsPage({ searchParams }: PageProps) {
  const session = await requireAccount();
  const [cards, badges] = await Promise.all([
    listMyRewardCards(session.access_token),
    listMyBadges(session.access_token),
  ]);
  const notice = NOTICES[readQueryParam((await searchParams).notice) ?? ""];

  return (
    <AccountLayout
      current="/rewards"
      description="Stamps you earn by going to real events and shops. They have no cash value and can't be transferred."
      title="Rewards"
    >
      {notice ? (
        <p className="text-muted-foreground text-sm" role="status">
          {notice}
        </p>
      ) : null}
      <SettingsSection title="Your cards">
        {cards.length === 0 ? (
          <p className="py-5 text-muted-foreground text-sm">
            No stamps yet. Cards fill when you are admitted at an event run by a
            business that offers rewards.
          </p>
        ) : null}
        {cards.map((card) => (
          <SettingsRow
            action={
              card.can_redeem ? (
                <form action={redeemCard}>
                  <input
                    name="program_id"
                    type="hidden"
                    value={card.program_id}
                  />
                  <button className={BUTTON} type="submit">
                    Redeem
                  </button>
                </form>
              ) : null
            }
            description={`${card.organisation_name} · ${card.balance} of ${card.stamps_required} stamps · ${card.reward_description}`}
            key={card.program_id}
            title={card.program_name}
          >
            <div className="flex flex-wrap gap-2">
              {card.pending > 0 ? (
                <StatusBadge tone="neutral">{card.pending} pending</StatusBadge>
              ) : null}
              {card.open_redemption_code ? (
                <StatusBadge tone="on">
                  Show staff code {card.open_redemption_code}
                </StatusBadge>
              ) : null}
            </div>
          </SettingsRow>
        ))}
      </SettingsSection>
      <SettingsSection title="Trust badges">
        {badges.map((badge) => (
          <SettingsRow
            description={badge.description}
            key={badge.key}
            title={badge.label}
          >
            <StatusBadge tone={badge.earned ? "on" : "off"}>
              {badgeStatus(badge)}
            </StatusBadge>
          </SettingsRow>
        ))}
      </SettingsSection>
    </AccountLayout>
  );
}
