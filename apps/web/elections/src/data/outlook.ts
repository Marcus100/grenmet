/**
 * The Elections Grenada outlook model, ported from the prototype. Pure
 * functions over the official results so every number on the Forecast page
 * can be recomputed and tested. The parameters stay visible on the page.
 *
 * Shares are the NDC share of the NDC–NNP vote (the "two-party share").
 */
// biome-ignore-all lint/suspicious/noBitwiseOperators: the seeded PRNG must match the prototype bit for bit so published simulations reproduce exactly.
import { CODES, divisionResults, generalResult } from "@/data/model";
import type { CandidateRow, ConstituencyCode, ResultsFile } from "@/data/types";

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

/* ---------- Do candidates matter? ---------- */

const NAME_TITLE = /^(Dr|Mr|Mrs|Ms|Hon|Sir|Dame)\.?\s+/i;
const STAR = /\*/g;
const SPACE = /\s+/;

/** "Dr Keith Mitchell" → "k|mitchell": first initial and surname. */
export function personKey(name: string): string {
  const t = name
    .replace(STAR, "")
    .replace(NAME_TITLE, "")
    .trim()
    .toLowerCase()
    .split(SPACE);
  return `${t[0]?.[0] ?? "x"}|${t.at(-1) ?? ""}`;
}

export interface CandidateRace {
  code: Seat;
  /** How far the candidate ran ahead (+) of what the national vote and the seat's lean predicted. */
  effect: number;
  key: string;
  name: string;
  party: "NDC" | "NNP";
  year: ModelYear;
}

export interface IncumbencyRace {
  code: Seat;
  name: string;
  party: string;
  /** Change toward the party that held the seat, beyond expectation. */
  relative: number;
  year: ModelYear;
}

export interface CandidateEffects {
  incumbency: {
    open: IncumbencyRace[];
    reran: IncumbencyRace[];
    switched: IncumbencyRace[];
  };
  people: { code: Seat; name: string; races: CandidateRace[] }[];
  races: CandidateRace[];
}

/** One constituency's NDC/NNP candidates and incumbency case for an election pair. */
function seatEffects(
  data: ResultsFile,
  a: ModelYear,
  b: ModelYear,
  code: Seat,
  out: { incumbency: CandidateEffects["incumbency"]; races: CandidateRace[] }
): void {
  const share = twoParty(data, b, code);
  if (share == null) return;
  const r = share - (nationalShare(data, b) + leanAt(data, a, code));
  const now = generalResult(data, b, code)?.c ?? [];
  for (const [name, party] of now)
    if (party === "NDC" || party === "NNP")
      out.races.push({
        year: b,
        code,
        name,
        key: personKey(name),
        party,
        effect: party === "NDC" ? r : -r,
      });
  const held = generalResult(data, a, code)?.c[0];
  if (!held || (held[1] !== "NDC" && held[1] !== "NNP")) return;
  const again = now.find((k) => personKey(k[0]) === personKey(held[0]));
  const entry = {
    year: b,
    code,
    name: held[0],
    party: held[1],
    relative: held[1] === "NDC" ? r : -r,
  };
  if (!again) out.incumbency.open.push(entry);
  else if (again[1] === held[1]) out.incumbency.reran.push(entry);
  else out.incumbency.switched.push(entry);
}

/** Each NDC/NNP candidate since 1995 against what the national vote and the seat's lean predicted. */
export function candidateEffects(data: ResultsFile): CandidateEffects {
  const out = {
    races: [] as CandidateRace[],
    incumbency: {
      reran: [],
      open: [],
      switched: [],
    } as CandidateEffects["incumbency"],
  };
  for (let i = 1; i < MODEL_YEARS.length; i++)
    for (const code of CODES)
      seatEffects(
        data,
        MODEL_YEARS[i - 1] as ModelYear,
        MODEL_YEARS[i] as ModelYear,
        code,
        out
      );
  const byPerson = new Map<
    string,
    { code: Seat; name: string; races: CandidateRace[] }
  >();
  for (const r of out.races) {
    const k = `${r.key}|${r.code}`;
    const p = byPerson.get(k) ?? { name: r.name, code: r.code, races: [] };
    p.races.push(r);
    byPerson.set(k, p);
  }
  return {
    races: out.races,
    incumbency: out.incumbency,
    people: [...byPerson.values()],
  };
}

/* ---------- Election night, replayed: 2022 ---------- */

export interface ReplayDivision {
  /** NDC two-party share expected from 2018 (the division's, else its constituency's). */
  base: number;
  code: Seat;
  division: string;
  ndc: number;
  nnp: number;
  place: string;
  /** Expected NDC+NNP votes, used for divisions not yet counted. */
  weight: number;
}

export interface ReplayInputs {
  divisions: ReplayDivision[];
  /** Spread of constituency swings around the national swing (2013 → 2018). */
  sC: number;
  /** Spread of division swings within a constituency (2013 → 2018). */
  sE: number;
  sN: number;
}

function divisionTwoParty(rows: CandidateRow[]): {
  ndc: number;
  nnp: number;
  share: number | null;
} {
  const ndc = rows.filter((r) => r[1] === "NDC").reduce((a, r) => a + r[2], 0);
  const nnp = rows.filter((r) => r[1] === "NNP").reduce((a, r) => a + r[2], 0);
  return { ndc, nnp, share: ndc + nnp ? ndc / (ndc + nnp) : null };
}

/**
 * What the replay needs: every 2022 division with its 2018 baseline, and how
 * much divisions and constituencies strayed from the national swing in the
 * previous pair of elections (2013 → 2018, not the replayed one).
 */
export function replayInputs(data: ResultsFile): ReplayInputs {
  const by = (year: string) =>
    Object.fromEntries(
      CODES.flatMap((c) => divisionResults(data, year, c)).map((d) => [
        d.division,
        d,
      ])
    );
  const d13 = by("2013");
  const d18 = by("2018");
  const ns = nationalShare(data, "2018") - nationalShare(data, "2013");
  const groups = new Map<string, number[]>();
  for (const d of Object.values(d18)) {
    const o = d13[d.division];
    const now = divisionTwoParty(d.c).share;
    const before = o ? divisionTwoParty(o.c).share : null;
    if (now == null || before == null) continue;
    const code = d.division.slice(0, 1);
    groups.set(code, [...(groups.get(code) ?? []), now - before - ns]);
  }
  const lists = [...groups.values()];
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const sC = sd(lists.map(mean));
  const sE = sd(lists.flatMap((a) => a.map((v) => v - mean(a))));

  const divisions: ReplayDivision[] = CODES.flatMap((code) =>
    divisionResults(data, "2022", code).map((d) => {
      const now = divisionTwoParty(d.c);
      const o = d18[d.division];
      const before = o ? divisionTwoParty(o.c) : null;
      return {
        division: d.division,
        code,
        place: d.places[0] ?? "",
        ndc: now.ndc,
        nnp: now.nnp,
        base: before?.share ?? twoParty(data, "2018", code) ?? 0.5,
        weight: before ? before.ndc + before.nnp : Number.NaN,
      };
    })
  );
  for (const code of CODES) {
    const inSeat = divisions.filter((d) => d.code === code);
    const known = inSeat.filter((d) => !Number.isNaN(d.weight));
    const avg = known.reduce((a, d) => a + d.weight, 0) / (known.length || 1);
    for (const d of inSeat) if (Number.isNaN(d.weight)) d.weight = avg;
  }
  return { divisions, sC, sE, sN: spreads(data, null).sN };
}

export interface ReplayEstimate {
  hi: number;
  lo: number;
  median: number;
  /** Chance the NDC wins 8+ seats. */
  ndcMajority: number;
  /** Chance the NDC wins each seat. */
  seatChance: Record<string, number>;
  swing: number;
  swingSd: number;
}

/** Counted divisions' swings since 2018, grouped by constituency. */
function countedSwings(
  inputs: ReplayInputs,
  reported: ReadonlySet<string>
): Map<string, number[]> {
  const byCode = new Map<string, number[]>();
  for (const d of inputs.divisions)
    if (reported.has(d.division))
      byCode.set(d.code, [
        ...(byCode.get(d.code) ?? []),
        d.ndc / (d.ndc + d.nnp || 1) - d.base,
      ]);
  return byCode;
}

/** National swing estimate: constituency means pooled with a prior from past national swings. */
function pooledSwing(
  inputs: ReplayInputs,
  byCode: Map<string, number[]>
): { swing: number; swingSd: number } {
  const { sN, sC, sE } = inputs;
  let precision = 1 / sN ** 2;
  let num = 0;
  for (const a of byCode.values()) {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    const v = sC ** 2 + sE ** 2 / a.length;
    precision += 1 / v;
    num += m / v;
  }
  return { swing: num / precision, swingSd: Math.sqrt(1 / precision) };
}

/** One simulated finish to the count; returns the seats the NDC wins. Draw order is fixed. */
function simulateCount(
  inputs: ReplayInputs,
  reported: ReadonlySet<string>,
  byCode: Map<string, number[]>,
  sw: number,
  r: Rng
): string[] {
  const { sC, sE } = inputs;
  const totals = new Map<string, { a: number; b: number; local: number }>();
  for (const c of CODES) {
    const a = byCode.get(c);
    const n = a ? a.length : 0;
    const resid = a ? a.reduce((x, y) => x + y, 0) / n - sw : 0;
    const vU = 1 / (1 / sC ** 2 + n / sE ** 2);
    const u = n ? (resid * vU * n) / sE ** 2 : 0;
    totals.set(c, { a: 0, b: 0, local: u + Math.sqrt(vU) * r.n() });
  }
  for (const d of inputs.divisions) {
    const t = totals.get(d.code);
    if (!t) continue;
    if (reported.has(d.division)) {
      t.a += d.ndc;
      t.b += d.nnp;
      continue;
    }
    const s = Math.max(0, Math.min(1, d.base + sw + t.local + sE * r.n()));
    t.a += d.weight * s;
    t.b += d.weight * (1 - s);
  }
  return CODES.filter((c) => {
    const t = totals.get(c);
    return t ? t.a > t.b : false;
  });
}

/**
 * The needle: pool the counted divisions' swings since 2018 (constituency
 * effects shrunk toward the national swing), then simulate the rest.
 */
export function replayEstimate(
  inputs: ReplayInputs,
  reported: ReadonlySet<string>
): ReplayEstimate {
  const byCode = countedSwings(inputs, reported);
  const { swing, swingSd } = pooledSwing(inputs, byCode);
  const r = rng(99);
  const runs = 800;
  const seats = new Array<number>(16).fill(0);
  const wins: Record<string, number> = Object.fromEntries(
    CODES.map((c) => [c, 0])
  );
  for (let i = 0; i < runs; i++) {
    const won = simulateCount(
      inputs,
      reported,
      byCode,
      swing + swingSd * r.n(),
      r
    );
    for (const c of won) wins[c] = (wins[c] ?? 0) + 1;
    seats[won.length] = (seats[won.length] ?? 0) + 1;
  }
  return {
    ndcMajority: seats.slice(8).reduce((a, b) => a + b, 0) / runs,
    swing,
    swingSd,
    lo: percentile(seats, runs, 0.1),
    hi: percentile(seats, runs, 0.9),
    median: percentile(seats, runs, 0.5),
    seatChance: Object.fromEntries(
      CODES.map((c) => [c, (wins[c] ?? 0) / runs])
    ),
  };
}

/** A seeded counting order, since the real 2022 reporting order isn't published (✱). */
export function countingOrder(divisions: string[], seed: number): string[] {
  const a = [...divisions];
  const r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r.u() * (i + 1));
    [a[i], a[j]] = [a[j] as string, a[i] as string];
  }
  return a;
}
