import {
  CODES,
  constituencyHref,
  constituencyName,
  contestStats,
  generalResult,
  seatLean,
} from "@/data/model";
import type { CampaignFile, ConstituencyCode, ResultsFile } from "@/data/types";
import { formatIsoDate } from "@/lib/format";

/**
 * The 2026 general election as far as it is known. Change these dates as
 * they are announced; every 2026 page reads its state from here.
 */
export interface ElectionCalendar {
  /** When the Prime Minister is due to announce polling day. */
  announcement: string;
  /** Latest lawful polling day (✱ until the 2022 first sitting is confirmed). */
  deadline: string;
  /** Nomination day, once proclaimed. */
  nominationDay: string | null;
  /** Polling day, once announced. */
  pollingDay: string | null;
}

export function calendarFrom(campaign: CampaignFile): ElectionCalendar {
  return {
    announcement: campaign.announce,
    deadline: campaign.deadline,
    nominationDay: null,
    pollingDay: null,
  };
}

/** Where the election is, which decides what the homepage leads with. */
export type ElectionPhase =
  | "awaiting-date"
  | "campaign"
  | "polling-day"
  | "counting";

/** Today's date in Grenada (UTC−4, no daylight saving) as YYYY-MM-DD. */
export function grenadaDate(now: Date): string {
  return new Date(now.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
}

export function electionPhase(
  calendar: ElectionCalendar,
  now: Date
): ElectionPhase {
  if (!calendar.pollingDay) return "awaiting-date";
  const today = grenadaDate(now);
  if (today < calendar.pollingDay) return "campaign";
  if (today === calendar.pollingDay) return "polling-day";
  return "counting";
}

/** Whole days from today in Grenada until an ISO date (0 on the day). */
export function daysUntil(iso: string, now: Date): number {
  const today = Date.parse(grenadaDate(now));
  return Math.round((Date.parse(iso) - today) / 86_400_000);
}

export interface DeclaredCandidate {
  name: string;
  party: string;
}

export interface SeatOutlook {
  /** Candidates named so far, by party. */
  candidates: DeclaredCandidate[];
  code: ConstituencyCode;
  /** The constituency's page, addressed by name. */
  href: string;
  /** Grenada Lean Index: positive leans NDC against the country. */
  lean: number | null;
  /** 2022 winner's lead over the runner-up, as a share of valid votes. */
  margin2022: number;
  name: string;
  /** Per party, why a name (or its absence) is uncertain; shown with ✱. */
  notes: Record<string, string>;
  /** The member now, after any floor crossing since 2022. */
  sitting: { name: string; party: string; was?: string };
  winner2022: { name: string; party: string };
}

const SLATE_ORDER = ["NDC", "NNP", "DPM"];

/** One row per constituency: 2022 result, who sits now, who is standing. */
export function seatOutlook(
  results: ResultsFile,
  campaign: CampaignFile
): SeatOutlook[] {
  return CODES.flatMap((code) => {
    const contest = generalResult(results, "2022", code);
    if (!contest) return [];
    const stats = contestStats(contest);
    const winner = { name: stats.winner[0], party: stats.winner[1] };
    const crossed = campaign.sitting[code];
    const sitting = crossed
      ? { name: crossed.name, party: crossed.party, was: crossed.was }
      : winner;
    const candidates = SLATE_ORDER.flatMap((party) => {
      const name = campaign.candidates[party]?.[code];
      return name ? [{ name, party }] : [];
    });
    const nnpNote = campaign.candidate_flags.NNP[code];
    const notes: Record<string, string> = nnpNote ? { NNP: nnpNote } : {};
    return [
      {
        code,
        href: constituencyHref(results, code),
        name: constituencyName(results, code),
        winner2022: winner,
        margin2022: stats.margin,
        lean: seatLean(results, code),
        sitting,
        candidates,
        notes,
      },
    ];
  });
}

/** Seats held by each party today, counting floor crossings since 2022. */
export function currentHouse(seats: SeatOutlook[]): Record<string, number> {
  const house: Record<string, number> = {};
  for (const seat of seats)
    house[seat.sitting.party] = (house[seat.sitting.party] ?? 0) + 1;
  return house;
}

/** One line for the masthead and the phone menu. */
export function electionStatus(calendar: ElectionCalendar, now: Date): string {
  const phase = electionPhase(calendar, now);
  if (phase === "awaiting-date") {
    const days = daysUntil(calendar.announcement, now);
    if (days > 1)
      return `Election date due ${formatIsoDate(calendar.announcement)}`;
    if (days === 1) return "Election date due tomorrow";
    if (days === 0) return "Election date due today";
    return "Election date not yet announced";
  }
  if (phase === "campaign" && calendar.pollingDay) {
    const days = daysUntil(calendar.pollingDay, now);
    return days === 1
      ? "Grenada votes tomorrow"
      : `Grenada votes in ${days} days`;
  }
  if (phase === "polling-day") return "Grenada votes today";
  return "Counting and results";
}
