/**
 * How the Results atlas encodes a contest as colour and height, per map
 * mode. Colours come from the site's `--el-*` tokens, read at runtime, so
 * the encodings never hard-code a value.
 */
import type { AtlasContest, AtlasEvent } from "@/data/atlas";
import { contestStats } from "@/data/model";
import { partyInfo } from "@/data/parties";

export type Rgb = [number, number, number];
export type Palette = Record<string, Rgb>;
export type MapMode = "winner" | "margin" | "turnout" | "share" | "swing";

export const PALETTE_KEYS = [
  "land",
  "sea",
  "paper",
  "ink",
  "div-mid",
  "seq-0",
  "seq-1",
  "ndc",
  "ndc-tint",
  "nnp",
  "nnp-tint",
  "dpm",
  "dpm-tint",
  "gulp",
  "gulp-tint",
  "hist",
  "hist-tint",
  "other",
  "other-tint",
  "yes",
  "yes-tint",
  "no",
  "no-tint",
] as const;

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/** Parse "#rrggbb" into [r, g, b] in 0–1. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace("#", "");
  const channel = (i: number) => Number.parseInt(h.slice(i, i + 2), 16) / 255;
  return [channel(0), channel(2), channel(4)];
}

export function rgbCss([r, g, b]: Rgb): string {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function party(p: Palette, code: string, tint = false): Rgb {
  const hue = partyInfo(code).hue;
  return p[tint ? `${hue}-tint` : hue] ?? p.other ?? [0.6, 0.6, 0.6];
}

function diverge(p: Palette, x: number, pair: [string, string]): Rgb {
  const mid = p["div-mid"] ?? [0.8, 0.8, 0.8];
  return x >= 0
    ? mix(mid, party(p, pair[0]), clamp(x))
    : mix(mid, party(p, pair[1]), clamp(-x));
}

/** Which modes make sense for an event. */
export function modeAvailable(e: AtlasEvent, mode: MapMode): boolean {
  if (mode === "swing") return e.kind === "general" && e.year >= 1995;
  if (mode === "share") return e.kind === "ref" || e.year >= 1990;
  if (mode === "turnout") return e.national.turnout != null;
  return true;
}

export interface Encoded {
  height: number;
  rgb: Rgb;
}

type Contest = Pick<AtlasContest, "c" | "cast" | "reg">;
type Stats = ReturnType<typeof contestStats>;

function winnerEncoding(
  p: Palette,
  s: Stats,
  referendum: boolean,
  scale: "cons" | "div"
): Encoded {
  let ceiling = scale === "div" ? 900 : 7500;
  if (referendum) ceiling = scale === "div" ? 3000 : 20_000;
  return {
    rgb: party(p, s.winner[1]),
    height: 0.25 + 2.4 * clamp(s.valid / ceiling),
  };
}

function turnoutEncoding(
  p: Palette,
  s: Stats,
  referendum: boolean,
  land: Rgb
): Encoded {
  if (s.turnout == null) return { rgb: land, height: 0.1 };
  const lo = referendum ? 0.15 : 0.55;
  const hi = referendum ? 0.5 : 0.9;
  const t = clamp((s.turnout - lo) / (hi - lo));
  return {
    rgb: mix(p["seq-0"] ?? land, p["seq-1"] ?? land, t),
    height: 0.25 + 3.2 * t,
  };
}

function swingEncoding(
  p: Palette,
  s: Stats,
  previous: Contest | null,
  mid: Rgb
): Encoded {
  const before = previous?.c[0] ? contestStats(previous).twoParty : null;
  if (s.twoParty == null || before == null) return { rgb: mid, height: 0.15 };
  const d = s.twoParty - before;
  return {
    rgb: diverge(p, d / 0.15, ["NDC", "NNP"]),
    height: 0.25 + 12 * Math.min(Math.abs(d), 0.25),
  };
}

/**
 * Colour and height for a contest. `scale` is "cons" or "div": divisions
 * are smaller, so their heights use a smaller vote ceiling.
 */
export function encode(
  p: Palette,
  contest: Contest | null,
  previous: Contest | null,
  mode: MapMode,
  referendum: boolean,
  scale: "cons" | "div"
): Encoded {
  const land = p.land ?? [0.84, 0.85, 0.87];
  const mid = p["div-mid"] ?? land;
  if (!contest?.c[0]) return { rgb: land, height: 0.08 };
  const s = contestStats(contest);
  switch (mode) {
    case "winner":
      return winnerEncoding(p, s, referendum, scale);
    case "margin":
      return {
        rgb: mix(
          party(p, s.winner[1], true),
          party(p, s.winner[1]),
          0.2 + 0.8 * clamp(s.margin / 0.4)
        ),
        height: 0.25 + 4 * clamp(s.margin, 0, 0.7),
      };
    case "turnout":
      return turnoutEncoding(p, s, referendum, land);
    case "share":
      if (s.twoParty == null) return { rgb: mid, height: 0.15 };
      return {
        rgb: diverge(p, (s.twoParty - 0.5) / 0.25, s.twoPartyPair),
        height: 0.25 + 5 * Math.abs(s.twoParty - 0.5),
      };
    default:
      return swingEncoding(p, s, previous, mid);
  }
}

/** Legend text for a mode. */
export function modeLegend(
  mode: MapMode,
  referendum: boolean,
  prev: string | null
): { title: string; ends: [string, string]; height: string } {
  switch (mode) {
    case "winner":
      return {
        title: referendum ? "Side that led" : "Winning party",
        ends: ["", ""],
        height: referendum ? "votes cast" : "ballots cast",
      };
    case "margin":
      return {
        title: referendum ? "Lead" : "Winning margin",
        ends: ["Close", "40+ pts"],
        height: "margin",
      };
    case "turnout":
      return {
        title: "Turnout",
        ends: referendum ? ["15%", "50%"] : ["55%", "90%"],
        height: "turnout",
      };
    case "share":
      return referendum
        ? {
            title: "Yes vs No",
            ends: ["No +25", "Yes +25"],
            height: "size of lead",
          }
        : {
            title: "NDC vs NNP, two-party share",
            ends: ["NNP +25", "NDC +25"],
            height: "size of lead",
          };
    default:
      return {
        title: `Swing since ${prev ?? "the previous election"}`,
        ends: ["To NNP 15", "To NDC 15"],
        height: "size of swing",
      };
  }
}
