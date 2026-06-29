import { GeistPixelSquare } from "geist/font/pixel";
import {
  DM_Sans,
  Figtree,
  Geist,
  Geist_Mono,
  Inter,
  JetBrains_Mono,
  Lora,
  Merriweather,
  Noto_Sans,
  Noto_Serif,
  Nunito_Sans,
  Outfit,
  Playfair_Display,
  Public_Sans,
  Raleway,
  Roboto,
  Roboto_Slab,
} from "next/font/google";

/**
 * Font switcher registry (ported from the Studio Admin template).
 *
 * Every font is loaded here and its CSS variable applied to `<html>` via
 * `fontVars`. The active one is chosen by the `data-font` attribute (set by
 * `@grenmet/theme`'s preferences system) through the `html[data-font="…"] body`
 * rules in `globals.css`. The default is Inter (GrenMet brand); printed
 * documents always use `--gm-font-document` (Noto Sans), independent of this.
 */

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// display: swap — backs the --gm-font-document token used by print documents.
const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
});
const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});
const raleway = Raleway({ subsets: ["latin"], variable: "--font-raleway" });
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});
const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--font-noto-serif",
});
const robotoSlab = Roboto_Slab({
  subsets: ["latin"],
  variable: "--font-roboto-slab",
});
const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-merriweather",
});
const lora = Lora({ subsets: ["latin"], variable: "--font-lora" });
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
});

export const fontRegistry = {
  inter: { label: "Inter", font: inter },
  geist: { label: "Geist", font: geist },
  notoSans: { label: "Noto Sans", font: notoSans },
  outfit: { label: "Outfit", font: outfit },
  roboto: { label: "Roboto", font: roboto },
  dmSans: { label: "DM Sans", font: dmSans },
  figtree: { label: "Figtree", font: figtree },
  nunitoSans: { label: "Nunito Sans", font: nunitoSans },
  publicSans: { label: "Public Sans", font: publicSans },
  raleway: { label: "Raleway", font: raleway },
  geistMono: { label: "Geist Mono", font: geistMono },
  jetBrainsMono: { label: "JetBrains Mono", font: jetBrainsMono },
  geistPixelSquare: { label: "Geist Pixel Square", font: GeistPixelSquare },
  notoSerif: { label: "Noto Serif", font: notoSerif },
  robotoSlab: { label: "Roboto Slab", font: robotoSlab },
  merriweather: { label: "Merriweather", font: merriweather },
  lora: { label: "Lora", font: lora },
  playfairDisplay: { label: "Playfair Display", font: playfairDisplay },
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
