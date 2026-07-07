import {
  Geist,
  Geist_Mono,
  Inter,
  JetBrains_Mono,
  Noto_Sans,
  Schibsted_Grotesk,
} from "next/font/google";

/**
 * Font switcher registry — trimmed to the GrenMet brand set.
 *
 * Every font listed here is loaded in the root layout and its CSS variable
 * applied to `<html>` via `fontVars`, so each additional family is downloaded
 * on every cold compile — keep this list small. The active one is chosen by
 * the `data-font` attribute (set by `@grenmet/theme`'s preferences system)
 * through the `html[data-font="…"] body` rules in `globals.css`. The default
 * is Inter (GrenMet brand); printed documents always use `--gm-font-document`
 * (Noto Sans), independent of this. Stale saved preferences for removed fonts
 * fall back to the base body font.
 */

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
// display: swap — backs the --gm-font-document token used by print documents.
const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});
const schibstedGrotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted-grotesk",
});

export const fontRegistry = {
  inter: { label: "Inter", font: inter },
  geist: { label: "Geist", font: geist },
  schibstedGrotesk: { label: "Schibsted Grotesk", font: schibstedGrotesk },
  notoSans: { label: "Noto Sans", font: notoSans },
  geistMono: { label: "Geist Mono", font: geistMono },
  jetBrainsMono: { label: "JetBrains Mono", font: jetBrainsMono },
} as const;

export type FontKey = keyof typeof fontRegistry;

/** Space-joined next/font className list — apply to `<html className>`. */
export const fontVars = Object.values(fontRegistry)
  .map((f) => f.font.variable)
  .join(" ");

/** `{ key, label }[]` for the font-switcher dropdown. */
export const fontOptions = Object.entries(fontRegistry).map(([key, f]) => ({
  key: key as FontKey,
  label: f.label,
}));
