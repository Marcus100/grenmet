/**
 * The rating scale readers use to make their own prediction: Solid, Likely
 * and Lean for each party, plus Toss-up. DPM ratings are only offered where
 * the DPM has named a candidate.
 */
import type { ConstituencyCode } from "@/data/types";

export const PARTIES = ["NDC", "NNP", "DPM"] as const;
export type Party = (typeof PARTIES)[number];
export type Strength = "Solid" | "Likely" | "Lean";
export type UserRating = `${Strength} ${Party}` | "Toss-up";

/** Display order: NDC strongest to weakest, Toss-up, NNP weakest to strongest, then DPM. */
export const RATING_ORDER: UserRating[] = [
  "Solid NDC",
  "Likely NDC",
  "Lean NDC",
  "Toss-up",
  "Lean NNP",
  "Likely NNP",
  "Solid NNP",
  "Lean DPM",
  "Likely DPM",
  "Solid DPM",
];

/** Ratings a constituency can take: DPM only where it stands. */
export function ratingsFor(dpmStands: boolean): UserRating[] {
  return RATING_ORDER.filter((r) => dpmStands || !r.endsWith("DPM"));
}

export function ratingParty(rating: UserRating): Party | null {
  return rating === "Toss-up" ? null : (rating.split(" ")[1] as Party);
}

// One letter per rating keeps a shared map to 15 characters in the link.
const LETTERS = "abcdefghij";

export function encodeMap(
  codes: readonly ConstituencyCode[],
  map: Record<ConstituencyCode, UserRating>
): string {
  return codes
    .map((c) => LETTERS[RATING_ORDER.indexOf(map[c])] ?? "d")
    .join("");
}

/** Read a shared map; null if the text isn't a valid map for these constituencies. */
export function decodeMap(
  codes: readonly ConstituencyCode[],
  text: string,
  dpmSeats: ReadonlySet<ConstituencyCode>
): Record<ConstituencyCode, UserRating> | null {
  if (text.length !== codes.length) return null;
  const out: Partial<Record<ConstituencyCode, UserRating>> = {};
  for (const [i, code] of codes.entries()) {
    const rating = RATING_ORDER[LETTERS.indexOf(text[i] ?? "")];
    if (!rating) return null;
    if (rating.endsWith("DPM") && !dpmSeats.has(code)) return null;
    out[code] = rating;
  }
  return out as Record<ConstituencyCode, UserRating>;
}

export interface Tally {
  /** Seats at each rating. */
  byRating: Record<UserRating, number>;
  /** Party with 8 or more seats rated Lean or better, if any. */
  majority: Party | null;
  /** Seats rated Lean or better for each party. */
  seats: Record<Party, number>;
  tossUps: number;
}

export function tally(map: Record<ConstituencyCode, UserRating>): Tally {
  const byRating = Object.fromEntries(
    RATING_ORDER.map((r) => [r, 0])
  ) as Record<UserRating, number>;
  const seats: Record<Party, number> = { NDC: 0, NNP: 0, DPM: 0 };
  for (const rating of Object.values(map)) {
    byRating[rating]++;
    const party = ratingParty(rating);
    if (party) seats[party]++;
  }
  const majority = PARTIES.find((p) => seats[p] >= 8) ?? null;
  return { byRating, seats, tossUps: byRating["Toss-up"], majority };
}

/** A rating from a seat's chances on the model's bands (Safe → Solid). */
export function ratingFromChances(chance: Record<Party, number>): UserRating {
  const top = PARTIES.reduce((best, p) =>
    chance[p] > chance[best] ? p : best
  );
  const q = chance[top];
  if (q < 0.6) return "Toss-up";
  if (q >= 0.95) return `Solid ${top}`;
  return q >= 0.8 ? `Likely ${top}` : `Lean ${top}`;
}
