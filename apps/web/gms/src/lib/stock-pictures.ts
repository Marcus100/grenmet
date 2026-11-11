import type { CardPicture } from "@/lib/desk-feed";

/**
 * Standard photos for homepage cards that have no picture of their own
 * (owner, 10 Nov 2026). A pinned desk post's picture always wins on an
 * official card. Real Grenada and regional weather subjects only, each free
 * to reuse and credited with its licence (GMS design rules: imagery).
 * Files live in `public/images/home/`, resized to 1200 px.
 */
export const STOCK_PICTURES = {
  briefing: {
    alt: "Fair-weather clouds over the turquoise bay at Hillsborough, Carriacou.",
    credit: "Photo: Vlad Podvorny, CC BY 2.0, via Wikimedia Commons",
    src: "/images/home/forecast-carriacou-clouds.jpg",
  },
  outlook: {
    alt: "Satellite view of the Windward Islands down to Grenada under scattered cloud.",
    credit: "Image: NASA MODIS Rapid Response Team (public domain)",
    src: "/images/home/outlook-lesser-antilles-modis.jpg",
  },
  marine: {
    alt: "A trimaran sailing off Grenada on a windy day, with breaking waves in front.",
    credit: "Photo: Paul Harrison, CC BY-SA 4.0, via Wikimedia Commons",
    src: "/images/home/marine-trimaran-off-grenada.jpg",
  },
  climate: {
    alt: "Sunlight breaking through a bank of cumulus clouds over the Caribbean Sea.",
    credit: "Photo: Paul Harrison, CC BY-SA 4.0, via Wikimedia Commons",
    src: "/images/home/climate-caribbean-cloud-bank.jpg",
  },
  week: {
    alt: "Boats in the Carenage, St. George's, Grenada.",
    credit: "Photo: David Stanley, CC BY 2.0, via Wikimedia Commons",
    src: "/images/home/week-st-georges-carenage.jpg",
  },
  explained: {
    alt: "Storm clouds rising over the Caribbean Sea, seen from the International Space Station.",
    credit: "Image: NASA (public domain)",
    src: "/images/home/explained-storm-clouds-iss.jpg",
  },
} as const satisfies Record<string, CardPicture>;
