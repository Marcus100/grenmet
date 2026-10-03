/**
 * Uniform-swing arithmetic for "How close was it?": move votes between the
 * NDC and the NNP by the same number of points everywhere and see what
 * changes. Other parties' votes stay as they were.
 */
import type { CandidateRow, Verification } from "@/data/types";

/** A seat for swing purposes: each party's share of valid votes. */
export interface SwingSeat {
  code: string;
  /** [party, share of valid votes], one entry per candidate. */
  shares: [string, number][];
}

export function swingSeat(code: string, rows: CandidateRow[]): SwingSeat {
  const valid = rows.reduce((a, r) => a + r[2], 0) || 1;
  return { code, shares: rows.map((r) => [r[1], r[2] / valid]) };
}

/** Winner after a uniform swing of `s` points (+ toward the NDC). */
export function winnerAt(seat: SwingSeat, s: number): string {
  let best = "";
  let top = -1;
  for (const [party, share] of seat.shares) {
    let v = share;
    if (party === "NDC") v = Math.max(0, share + s / 100);
    if (party === "NNP") v = Math.max(0, share - s / 100);
    if (v > top) {
      top = v;
      best = party;
    }
  }
  return best;
}

/** Swing (+ toward NDC, in points) at which the NDC and NNP swap order in a seat. */
export function swingToFlip(seat: SwingSeat): number {
  const share = (p: string) =>
    seat.shares.filter(([q]) => q === p).reduce((a, [, v]) => a + v, 0);
  return ((share("NNP") - share("NDC")) * 100) / 2;
}

export function seatsAt(seats: SwingSeat[], s: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seat of seats) {
    const w = winnerAt(seat, s);
    out[w] = (out[w] ?? 0) + 1;
  }
  return out;
}

/** The party with 8+ seats at a swing, or "hung". */
export function governmentAt(seats: SwingSeat[], s: number): string {
  const [party, n] = Object.entries(seatsAt(seats, s)).sort(
    (a, b) => b[1] - a[1]
  )[0] ?? ["", 0];
  return n >= 8 ? party : "hung";
}

/** The smallest uniform swing (either way, 0.1-point steps) that changes who governs. */
export function tippingPoint(
  seats: SwingSeat[]
): { from: string; s: number; to: string } | null {
  const from = governmentAt(seats, 0);
  for (let k = 1; k <= 300; k++) {
    for (const s of [k / 10, -k / 10]) {
      const to = governmentAt(seats, s);
      if (to !== from) return { s, from, to };
    }
  }
  return null;
}

/** Gallagher least-squares index of disproportionality (0 = seats match votes). */
export function gallagher(
  votes: Record<string, number>,
  seats: Record<string, number>,
  seatTotal: number
): number {
  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
  const parties = new Set([...Object.keys(votes), ...Object.keys(seats)]);
  let sum = 0;
  for (const p of parties)
    sum +=
      (((votes[p] ?? 0) / totalVotes) * 100 -
        ((seats[p] ?? 0) / seatTotal) * 100) **
      2;
  return Math.sqrt(0.5 * sum);
}

export type ResultQuality =
  | "official"
  | "corroborated"
  | "partly"
  | "unverified"
  | "conflict"
  | "none";

/** How a contest's figures were verified, from its candidates' marks. */
export function resultQuality(rows: CandidateRow[]): ResultQuality {
  const marks: Verification[] = rows.map((r) => r[3] ?? "official");
  if (!marks.length) return "none";
  if (marks.includes("check")) return "conflict";
  if (marks.every((m) => m === "official")) return "official";
  if (marks.every((m) => m === "official" || m === "corroborated"))
    return "corroborated";
  if (marks.includes("official")) return "partly";
  return "unverified";
}
