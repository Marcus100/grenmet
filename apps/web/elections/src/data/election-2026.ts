import {
  CODES,
  constituencyHref,
  constituencyName,
  contestStats,
  generalResult,
  nationalResult,
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
  /** Latest lawful polling day: within three months of dissolution (Constitution s. 53(1)). */
  deadline: string;
  /** When Parliament was dissolved, once it has been. */
  dissolved: string | null;
  /** Nomination day, once proclaimed. */
  nominationDay: string | null;
  /** Special polling day for police officers, if announced. */
  policePollingDay: string | null;
  /** Polling day, once announced. */
  pollingDay: string | null;
  /** True once every constituency result is in the data; decides the phase, never the date. */
  resultsDeclared: boolean;
  /** When the writs were issued, which proclaims both dates. */
  writs: string | null;
}

/** The election these results belong to. */
export const ELECTION_ID = "2026";

/** Provisional results are in the data for every constituency. */
export function hasResults(results: ResultsFile | undefined): boolean {
  const contests = results?.results[ELECTION_ID];
  return CODES.every((code) => (contests?.[code]?.c.length ?? 0) > 0);
}

export function calendarFrom(
  campaign: CampaignFile,
  results?: ResultsFile
): ElectionCalendar {
  return {
    resultsDeclared: hasResults(results),
    announcement: campaign.announce,
    deadline: campaign.deadline,
    dissolved: campaign.dissolved ?? null,
    nominationDay: campaign.nomination_day ?? null,
    pollingDay: campaign.polling_day ?? null,
    policePollingDay: campaign.police_polling_day ?? null,
    writs: campaign.writs ?? null,
  };
}

/** Where the election is, which decides what the homepage leads with. */
export type ElectionPhase =
  | "awaiting-date"
  | "campaign"
  | "polling-day"
  | "counting"
  | "declared";

/** Today's date in Grenada (UTC−4, no daylight saving) as YYYY-MM-DD. */
export function grenadaDate(now: Date): string {
  return new Date(now.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
}

export function electionPhase(
  calendar: ElectionCalendar,
  now: Date
): ElectionPhase {
  // Results in the data decide this, not today's date.
  if (calendar.resultsDeclared) return "declared";
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

/** The updates page and feeds begin here, the day the first campaign item was reported. */
export const UPDATES_START = "2026-09-18";

/** Campaign events from the start of the updates record, oldest first. */
export function updateEvents(campaign: CampaignFile): CampaignFile["events"] {
  return campaign.events.filter((event) => event.date >= UPDATES_START);
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

/** One row per constituency: 2022 result, who sat at dissolution, who is standing. */
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
    const notes: Record<string, string> = {};
    for (const party of SLATE_ORDER) {
      const note = candidateNote(campaign, party, code);
      if (note) notes[party] = note;
    }
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
  if (phase === "declared") return "Provisional results declared";
  return "Counting and results";
}

/**
 * The 2026 page headline. Returns null when the wording depends on today's date
 * and `now` is not known yet (server render, JavaScript off); the caller shows a
 * date-free fallback then.
 */
export function electionHeadline(
  calendar: ElectionCalendar,
  now: Date | null
): string | null {
  if (calendar.resultsDeclared && calendar.pollingDay)
    return `Grenada voted on ${formatIsoDate(calendar.pollingDay)}`;
  if (calendar.pollingDay)
    return `Grenada votes on ${formatIsoDate(calendar.pollingDay)}`;
  if (!now) return null;
  if (daysUntil(calendar.announcement, now) >= 0)
    return `Grenada’s election date is due on ${formatIsoDate(calendar.announcement)}`;
  return "Grenada waits for its election date";
}

export const PEO_RESULTS_URL = "https://elections.gd/2026/";
export const PEO_RESULTS_LABEL =
  "Provisional results from the Parliamentary Elections Office, 23 November 2026";

export interface DeclaredSeat {
  code: ConstituencyCode;
  href: string;
  /** Winner's lead over the runner-up, in votes. */
  majority: number;
  name: string;
  runnerUp: { name: string; party: string; votes: number } | null;
  /** Winner's share of valid votes. */
  share: number;
  validVotes: number;
  /** Who held the seat at dissolution. */
  was: { name: string; party: string };
  winner: { name: string; party: string; votes: number };
}

export interface DeclaredResult {
  registered: number | null;
  /** Every constituency, in letter order. */
  seatRows: DeclaredSeat[];
  /** Seats won by each party, most first. */
  seats: [string, number][];
  /** From the national figure on the source page; null if it has none. */
  turnout: number | null;
  validVotes: number;
  /** The party with the most seats, or null on a tie. */
  winningParty: string | null;
}

/** The declared 2026 result, or null until every constituency is in the data. */
export function declaredResult(
  results: ResultsFile,
  campaign: CampaignFile
): DeclaredResult | null {
  if (!hasResults(results)) return null;
  const outlook = seatOutlook(results, campaign);
  const seatRows = outlook.flatMap((seat): DeclaredSeat[] => {
    const contest = generalResult(results, ELECTION_ID, seat.code);
    if (!contest) return [];
    const stats = contestStats(contest);
    const [name, party, votes] = stats.winner;
    return [
      {
        code: seat.code,
        name: seat.name,
        href: seat.href,
        winner: { name, party, votes },
        runnerUp: stats.runnerUp
          ? {
              name: stats.runnerUp[0],
              party: stats.runnerUp[1],
              votes: stats.runnerUp[2],
            }
          : null,
        majority: stats.majority,
        share: votes / stats.valid,
        validVotes: stats.valid,
        was: seat.sitting,
      },
    ];
  });
  const national = nationalResult(results, ELECTION_ID);
  const seats = Object.entries(national.seats).sort((a, b) => b[1] - a[1]);
  const [first, second] = seats;
  return {
    seats,
    seatRows,
    winningParty: first && first[1] !== second?.[1] ? first[0] : null,
    turnout: results.national[ELECTION_ID]?.turnout ?? null,
    registered: national.registered,
    validVotes: national.total,
  };
}

/** The seats as the declared result leaves them: each constituency's member is its 2026 winner. */
export function declaredHouse(
  seats: SeatOutlook[],
  result: DeclaredResult
): SeatOutlook[] {
  return seats.map((seat) => {
    const won = result.seatRows.find((row) => row.code === seat.code);
    return won
      ? {
          ...seat,
          sitting: { name: won.winner.name, party: won.winner.party },
        }
      : seat;
  });
}

export interface PartyNote {
  /** Replaces `text` once the result is declared, where `text` would now be wrong. */
  declaredText?: string;
  /** Campaign source id for `text`, or "PEO" for official results. */
  source: string;
  text: string;
  /** Set when the fact still needs an official or primary source. */
  unverified?: string;
}

/**
 * One sourced line per party for the front page. Only facts our sources
 * record; nothing from memory.
 */
export const PARTY_NOTES: Record<"NDC" | "NNP" | "DPM", PartyNote> = {
  NDC: {
    text: "In government since winning the 2022 election.",
    source: "PEO",
  },
  NNP: {
    text: "In opposition. Emmalin Pierre became political leader in December 2024, succeeding Keith Mitchell.",
    source: "pierre",
    unverified:
      "From Wikipedia and NOW Grenada; to be confirmed from party or Gazette records.",
  },
  DPM: {
    text: "A new party, launched by Peter David in November 2025. It has not yet contested an election.",
    declaredText:
      "A new party, launched by Peter David in November 2025. It contested its first general election on 5 November 2026.",
    source: "dpmlaunch",
  },
};

/** Source id for a party's candidate in a seat: a later report if there is one, else the slate's source. */
export function candidateSource(
  campaign: CampaignFile,
  party: string,
  code: ConstituencyCode
): string | null {
  return (
    campaign.candidate_seat_sources?.[party]?.[code] ??
    campaign.candidate_sources[party] ??
    null
  );
}

/** The same uncertainty note wherever a named candidate is displayed. */
export function candidateNote(
  campaign: CampaignFile,
  party: string,
  code: ConstituencyCode
): string | undefined {
  return (
    campaign.candidate_seat_flags?.[party]?.[code] ??
    (party === "NNP" ? campaign.candidate_flags.NNP[code] : undefined)
  );
}

/** Every source id behind a party's named candidates, slate first. */
export function slateSources(campaign: CampaignFile, party: string): string[] {
  const ids = [
    campaign.candidate_sources[party],
    ...Object.values(campaign.candidate_seat_sources?.[party] ?? {}),
  ].filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}
