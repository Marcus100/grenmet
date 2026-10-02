/**
 * The Elections Grenada outlook model, ported from the prototype. Pure
 * functions over the official results so every number on the Forecast page
 * can be recomputed and tested. The parameters stay visible on the page.
 *
 * Shares are the NDC share of the NDC–NNP vote (the "two-party share").
 */
// biome-ignore-all lint/suspicious/noBitwiseOperators: the seeded PRNG must match the prototype bit for bit so published simulations reproduce exactly.
import { CODES, generalResult } from "@/data/model";
import type { ConstituencyCode, ResultsFile } from "@/data/types";

/** Elections the model learns from: the NDC and the NNP have both stood since 1990. */
export const MODEL_YEARS = [
  "1990",
  "1995",
  "1999",
  "2003",
  "2008",
  "2013",
  "2018",
  "2022",
] as const;
export type ModelYear = (typeof MODEL_YEARS)[number];

type Seat = ConstituencyCode;
type ByCode<T> = Record<Seat, T>;

function partyVotes(data: ResultsFile, year: string, code: Seat) {
  const contest = generalResult(data, year, code);
  if (!contest) return null;
  const sum = (party: string) =>
    contest.c.filter((r) => r[1] === party).reduce((a, r) => a + r[2], 0);
  return { ndc: sum("NDC"), nnp: sum("NNP") };
}

/** NDC two-party share in a seat; null when either party didn't stand. */
export function twoParty(
  data: ResultsFile,
  year: string,
  code: Seat
): number | null {
  const v = partyVotes(data, year, code);
  return v && v.ndc > 0 && v.nnp > 0 ? v.ndc / (v.ndc + v.nnp) : null;
}

/** National two-party share over the given seats where both parties stood. */
export function nationalShare(
  data: ResultsFile,
  year: string,
  codes: readonly Seat[] = CODES
): number {
  let a = 0;
  let b = 0;
  for (const code of codes) {
    if (twoParty(data, year, code) == null) continue;
    const v = partyVotes(data, year, code);
    if (!v) continue;
    a += v.ndc;
    b += v.nnp;
  }
  return a / (a + b);
}

/** Whether the NDC out-polled the NNP in a seat. */
export function ndcLed(data: ResultsFile, year: string, code: Seat): boolean {
  const v = partyVotes(data, year, code);
  return v ? v.ndc > v.nnp : false;
}

/**
 * Grenada Lean Index as of an election: 75% that election and 25% the one
 * before, each relative to the nation (after the Cook Partisan Voting Index).
 */
export function leanAt(data: ResultsFile, year: ModelYear, code: Seat): number {
  const i = MODEL_YEARS.indexOf(year);
  const prev = i > 0 ? MODEL_YEARS[i - 1] : undefined;
  const a = twoParty(data, year, code);
  const b = prev ? twoParty(data, prev, code) : null;
  const la = a == null ? null : a - nationalShare(data, year);
  const lb = b == null || !prev ? null : b - nationalShare(data, prev);
  if (la != null && lb != null) return 0.75 * la + 0.25 * lb;
  return la ?? lb ?? 0;
}

export function leanTable(data: ResultsFile, year: ModelYear): ByCode<number> {
  return Object.fromEntries(
    CODES.map((code) => [code, leanAt(data, year, code)])
  ) as ByCode<number>;
}

/** Sample standard deviation. */
export function sd(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export interface Spreads {
  /** Degrees of freedom for the national swing (pairs − 1). */
  df: number;
  /** National swings between consecutive elections. */
  nat: number[];
  /** Typical local deviation from the national swing (recent elections). */
  sL: number;
  /** Local deviation over all pairs, for comparison. */
  sLall: number;
  /** Typical national swing. */
  sN: number;
}

/**
 * How far the national vote moves between elections, and how far seats move
 * apart from it. One target election can be left out (for backtesting).
 * Local noise uses the three most recent pairs up to `upto`: it fell from
 * about 10 points in the 1990s to about 4 since 2013.
 */
export function spreads(
  data: ResultsFile,
  exclude: string | null,
  upto: ModelYear = "2022"
): Spreads {
  const nat: number[] = [];
  const loc: number[] = [];
  const recent: number[] = [];
  const iu = MODEL_YEARS.indexOf(upto);
  for (let i = 1; i < MODEL_YEARS.length; i++) {
    const a = MODEL_YEARS[i - 1] as ModelYear;
    const b = MODEL_YEARS[i] as ModelYear;
    if (b === exclude) continue;
    const both = CODES.filter(
      (c) => twoParty(data, a, c) != null && twoParty(data, b, c) != null
    );
    nat.push(nationalShare(data, b, both) - nationalShare(data, a, both));
    const nb = nationalShare(data, b);
    for (const c of both) {
      const d = (twoParty(data, b, c) ?? 0) - nb - leanAt(data, a, c);
      loc.push(d);
      if (i <= iu && iu - i <= 2) recent.push(d);
    }
  }
  return {
    sN: sd(nat),
    df: nat.length - 1,
    sL: sd(recent.length >= 15 ? recent : loc),
    sLall: sd(loc),
    nat,
  };
}

export interface Rng {
  /** Standard normal. */
  n: () => number;
  /** Uniform on [0, 1). */
  u: () => number;
}

/** Seeded random numbers (mulberry32 + Box–Muller), so every reader sees the same simulation. */
export function rng(seed: number): Rng {
  let s = seed >>> 0;
  const u = () => {
    s = (s + 0x6d_2b_79_f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    u,
    n: () => {
      let a = 0;
      while (!a) a = u();
      return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
    },
  };
}

/** Standard normal CDF (Abramowitz–Stegun). */
export function phi(z: number): number {
  const t = 1 / (1 + 0.231_641_9 * Math.abs(z));
  const d = 0.398_942_3 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.319_381_5 +
      t * (-0.356_563_8 + t * (1.781_478 + t * (-1.821_256 + t * 1.330_274))));
  return z > 0 ? 1 - p : p;
}

/** Student-t predictive draw: with few past swings, the next can exceed any seen. */
function tDraw(r: Rng, df: number): number {
  let c = 0;
  for (let j = 0; j < df; j++) c += r.n() ** 2;
  return (r.n() / Math.sqrt(c / df)) * Math.sqrt(1 + 1 / (df + 1));
}

export interface TwoWaySim {
  /** hist[k] = simulations where the NDC led in k seats. */
  hist: number[];
  n: number;
}

/** NDC-against-NNP simulation, used by the backtest. */
export function simulate(
  start: number,
  sN: number,
  sL: number,
  lean: ByCode<number>,
  n = 10_000,
  seed = 7,
  df = 0
): TwoWaySim {
  const r = rng(seed);
  const hist = new Array<number>(16).fill(0);
  for (let i = 0; i < n; i++) {
    const nat = start + sN * (df ? tDraw(r, df) : r.n());
    const values = CODES.map((c) => ({ c, v: nat + lean[c] + sL * r.n() }));
    const k = values.filter((x) => x.v > 0.5).length;
    hist[k] = (hist[k] ?? 0) + 1;
  }
  return { hist, n };
}

/** The smallest seat count reached by a share q of simulations. */
export function percentile(hist: number[], n: number, q: number): number {
  let a = 0;
  for (let k = 0; k < hist.length; k++) {
    a += hist[k] ?? 0;
    if (a >= q * n) return k;
  }
  return hist.length - 1;
}

export interface DpmSettings {
  /** Share of DPM votes taken from the NNP (the rest from the NDC). */
  fromNnp: number;
  /** Personal vote moving from the NNP to the DPM, by seat (Peter David in the Town). */
  personal: Partial<ByCode<number>>;
  /** Seats where the DPM has a candidate. */
  seats: Partial<ByCode<string>>;
  /** DPM share of the vote where it stands. */
  share: number;
}

export interface SeatChance {
  DPM: number;
  NDC: number;
  NNP: number;
}

/**
 * Three-way seat chances. `mu` is the expected NDC two-party share before the
 * DPM; the DPM takes `fromNnp` of its share from the NNP and the rest from the
 * NDC; `personal` moves straight from the NNP to the DPM.
 */
export function seatChance(
  mu: number,
  sL: number,
  dpm = 0,
  fromNnp = 0.5,
  personal = 0
): SeatChance {
  if (!(dpm || personal)) {
    const p = phi((mu - 0.5) / sL);
    return { NDC: p, NNP: 1 - p, DPM: 0 };
  }
  const t1 = 0.5 + (dpm * (1 - 2 * fromNnp) - personal) / 2;
  const tD = (2 - fromNnp) * dpm + personal;
  const t3 = 1 - (1 + fromNnp) * dpm - 2 * personal;
  const pN = 1 - phi((Math.max(t1, tD) - mu) / sL);
  const pP = phi((Math.min(t1, t3) - mu) / sL);
  return { NDC: pN, NNP: pP, DPM: Math.max(0, 1 - pN - pP) };
}

export interface ThreeWaySim {
  /** dpmSeats[k] = simulations where the DPM won k seats. */
  dpmSeats: number[];
  /** hist[k] = simulations where the NDC won k seats. */
  hist: number[];
  hung: number;
  n: number;
  ndcMajority: number;
  nnpMajority: number;
  /** How often each seat was the tipping point (the eighth by NDC−NNP margin). */
  tipping: Partial<ByCode<number>>;
}

/**
 * One seat in one simulated election. Draw order matters for the seeded
 * results: local swing, then the DPM's local strength (only where it stands),
 * then the personal vote.
 */
function drawSeat(
  r: Rng,
  c: Seat,
  nat: number,
  sL: number,
  lean: ByCode<number>,
  dpm: DpmSettings,
  dpmStrength: number
): { margin: number; winner: "NDC" | "NNP" | "DPM" } {
  const p = nat + lean[c] + sL * r.n();
  const d = dpm.seats[c]
    ? dpm.share * dpmStrength * Math.exp(0.25 * r.n() - 0.03)
    : 0;
  const pv = (dpm.personal[c] ?? 0) * Math.exp(0.3 * r.n() - 0.045);
  const ndc = p - (1 - dpm.fromNnp) * d;
  const nnp = 1 - p - dpm.fromNnp * d - pv;
  const dp = d + pv;
  let winner: "NDC" | "NNP" | "DPM" = "DPM";
  if (ndc > nnp && ndc > dp) winner = "NDC";
  else if (nnp > dp) winner = "NNP";
  return { winner, margin: ndc - nnp };
}

/** The full simulation, with the DPM's own strength uncertain. */
export function simulateThreeWay(
  start: number,
  sN: number,
  sL: number,
  lean: ByCode<number>,
  dpm: DpmSettings,
  n = 10_000,
  seed = 7,
  df = 0
): ThreeWaySim {
  const r = rng(seed);
  const hist = new Array<number>(16).fill(0);
  const dpmSeats = new Array<number>(16).fill(0);
  const tipping: Partial<ByCode<number>> = {};
  let ndcMajority = 0;
  let nnpMajority = 0;
  let hung = 0;
  for (let i = 0; i < n; i++) {
    const nat = start + sN * (df ? tDraw(r, df) : r.n());
    const strength = Math.exp(0.4 * r.n() - 0.08);
    const won = { NDC: 0, NNP: 0, DPM: 0 };
    const margins: { c: Seat; v: number }[] = [];
    for (const c of CODES) {
      const seat = drawSeat(r, c, nat, sL, lean, dpm, strength);
      won[seat.winner]++;
      margins.push({ c, v: seat.margin });
    }
    hist[won.NDC] = (hist[won.NDC] ?? 0) + 1;
    dpmSeats[won.DPM] = (dpmSeats[won.DPM] ?? 0) + 1;
    if (won.NDC >= 8) ndcMajority++;
    else if (won.NNP >= 8) nnpMajority++;
    else hung++;
    margins.sort((a, b) => b.v - a.v);
    const tip = margins[7]?.c;
    if (tip) tipping[tip] = (tipping[tip] ?? 0) + 1;
  }
  return { hist, dpmSeats, ndcMajority, nnpMajority, hung, tipping, n };
}

export interface BacktestRow {
  /** NDC seats (by who led the NDC–NNP contest) in the predicted election. */
  actual: number;
  from: ModelYear;
  hi: number;
  hist: number[];
  inside: boolean;
  lo: number;
  /** Seats called correctly when the national vote is known. */
  right: number;
  to: ModelYear;
}

export interface Calibration {
  code: Seat;
  p: number;
  won: boolean;
  year: ModelYear;
}

/** Run the method from each election to the next, without the target result. */
export function backtest(data: ResultsFile): {
  calibration: Calibration[];
  rows: BacktestRow[];
} {
  const rows: BacktestRow[] = [];
  const calibration: Calibration[] = [];
  for (let i = 1; i < MODEL_YEARS.length; i++) {
    const a = MODEL_YEARS[i - 1] as ModelYear;
    const b = MODEL_YEARS[i] as ModelYear;
    const { sN, sL, df } = spreads(data, b, a);
    const lean = leanTable(data, a);
    const sim = simulate(
      nationalShare(data, a),
      sN,
      sL,
      lean,
      4000,
      11 + i,
      df
    );
    const lo = percentile(sim.hist, sim.n, 0.1);
    const hi = percentile(sim.hist, sim.n, 0.9);
    const actual = CODES.filter((c) => ndcLed(data, b, c)).length;
    const nb = nationalShare(data, b);
    let right = 0;
    for (const c of CODES) {
      const p = phi((nb + lean[c] - 0.5) / sL);
      const won = ndcLed(data, b, c);
      calibration.push({ p, won, year: b, code: c });
      if (p > 0.5 === won) right++;
    }
    rows.push({
      from: a,
      to: b,
      lo,
      hi,
      actual,
      inside: actual >= lo && actual <= hi,
      right,
      hist: sim.hist,
    });
  }
  return { rows, calibration };
}

/** Party in government going into each election. */
const GOVERNMENT: Record<string, "NDC" | "NNP"> = {
  1990: "NDC",
  1995: "NNP",
  1999: "NNP",
  2003: "NNP",
  2008: "NDC",
  2013: "NNP",
  2018: "NNP",
  2022: "NDC",
};

/** Change in the governing party's two-party share at each next election. */
export function governmentChange(data: ResultsFile): number[] {
  const out: number[] = [];
  for (let i = 1; i < MODEL_YEARS.length; i++) {
    const a = MODEL_YEARS[i - 1] as ModelYear;
    const b = MODEL_YEARS[i] as ModelYear;
    const both = CODES.filter(
      (c) => twoParty(data, a, c) != null && twoParty(data, b, c) != null
    );
    const d = nationalShare(data, b, both) - nationalShare(data, a, both);
    out.push(GOVERNMENT[a] === "NDC" ? d : -d);
  }
  return out;
}

export type Rating =
  | "Safe NNP"
  | "Likely NNP"
  | "Lean NNP"
  | "Toss-up"
  | "Lean NDC"
  | "Likely NDC"
  | "Safe NDC";

export const RATING_COLUMNS: Rating[] = [
  "Safe NNP",
  "Likely NNP",
  "Lean NNP",
  "Toss-up",
  "Lean NDC",
  "Likely NDC",
  "Safe NDC",
];

/** Safe 95%+, Likely 80–95%, Lean 60–80%; a toss-up if the leader is under 60% or is the DPM. */
export function rate(chance: SeatChance): Rating {
  const top = leader(chance);
  const q = chance[top];
  if (q < 0.6 || top === "DPM") return "Toss-up";
  if (q >= 0.95) return `Safe ${top}`;
  return q >= 0.8 ? `Likely ${top}` : `Lean ${top}`;
}

/** Leader in a seat's chances, NDC/NNP/DPM order on ties. */
export function leader(chance: SeatChance): "NDC" | "NNP" | "DPM" {
  return (["NDC", "NNP", "DPM"] as const).reduce((best, p) =>
    chance[p] > chance[best] ? p : best
  );
}

export interface ModelSettings {
  /** DPM share of the vote where it stands. */
  dpm: number;
  /** Share of DPM votes taken from the NNP. */
  fromNnp: number;
  /** National NDC two-party share. */
  national: number;
  /** Peter David's personal vote in the Town of St. George. */
  personal: number;
}

export interface ModelInputs {
  defaults: ModelSettings;
  /** Average change in the governing party's two-party share. */
  governmentSwing: number;
  /** Starting points for the national share. */
  presets: {
    dpb: number;
    even: number;
    government: number;
    result2022: number;
  };
}

/**
 * Defaults and presets. The DPM figures are assumptions (✱) until a poll or
 * result gives them; the personal vote is the Town's lean that moved with
 * Peter David between 2008 and 2018.
 */
export function modelInputs(
  data: ResultsFile,
  dpb: { NDC: [number, number]; NNP: [number, number] }
): ModelInputs {
  const n22 = nationalShare(data, "2022");
  const changes = governmentChange(data);
  const governmentSwing = changes.reduce((a, b) => a + b, 0) / changes.length;
  const dpbNdc = (dpb.NDC[0] + dpb.NDC[1]) / 2;
  const town = (year: string) =>
    (twoParty(data, year, "G") ?? 0) - nationalShare(data, year);
  const personal = Math.max(0, town("2008") - town("2018"));
  return {
    governmentSwing,
    presets: {
      result2022: n22,
      government: n22 + governmentSwing,
      dpb: dpbNdc / (dpbNdc + dpb.NNP[0]),
      even: 0.5,
    },
    defaults: {
      national: n22,
      dpm: 0.05,
      fromNnp: 0.6,
      personal: Math.round(personal * 200) / 200,
    },
  };
}

/** Seat chances for every constituency under the given settings. */
export function seatChances(
  lean: ByCode<number>,
  sL: number,
  settings: ModelSettings,
  dpmSeats: Partial<ByCode<string>>
): ByCode<SeatChance> {
  return Object.fromEntries(
    CODES.map((c) => [
      c,
      seatChance(
        settings.national + lean[c],
        sL,
        dpmSeats[c] ? settings.dpm : 0,
        settings.fromNnp,
        c === "G" && dpmSeats.G ? settings.personal : 0
      ),
    ])
  ) as ByCode<SeatChance>;
}
