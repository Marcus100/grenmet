import type { ArticleLike } from "./content-utils";
export const COLLECTIONS = [
  {
    slug: "october-in-grenada",
    title: "October in Grenada",
    description:
      "Cinema, music and time outdoors. Explore the people and events shaping this month’s island life.",
    kicker: "Your month ahead · Editorial preview",
    paths: [
      "culture-life/soundleap-sound-fest-2026",
      "weather-ready/dive-conservation-festival-2026",
      "culture-life/grenada-film-festival-october-2026",
    ],
  },
  {
    slug: "weather-and-everyday-life",
    title: "Weather & everyday life",
    description:
      "From hazy skies to conditions at sea: a sample reading collection about the weather around us.",
    kicker: "Seasonal reading · Demo collection",
    paths: ["weather-ready/saharan-dust", "weather-ready/small-craft-advisory"],
  },
];
export const HOME_LEAD_PATHS = [
  "news-community/parliament-dissolved-2026",
  "culture-life/grenada-film-festival-october-2026",
  "opportunity/chevening-grenada-deadline-2026",
  "news-community/grenada-transport-changes-2026",
  "sport/grenada-home-football-trinidad-2026",
];
export const GUIDE_PATHS = [
  "news-community/parliament-dissolved-2026",
  "news-community/grenada-transport-changes-2026",
  "opportunity/chevening-grenada-deadline-2026",
];
export function selectStories<T extends ArticleLike>(
  articles: T[],
  paths: string[]
): T[] {
  return paths.flatMap((path) => {
    const article = articles.find(
      (item) => !item.draft && `${item.section}/${item.slug}` === path
    );
    return article ? [article] : [];
  });
}
export interface SearchEntry {
  description: string;
  href: string;
  label: string;
  title: string;
}
const WORD_SEPARATOR = /\s+/;
export function searchEntries(
  entries: SearchEntry[],
  query: string
): SearchEntry[] {
  const words = query
    .trim()
    .toLocaleLowerCase()
    .split(WORD_SEPARATOR)
    .filter(Boolean);
  return words.length
    ? entries.filter((entry) =>
        words.every((word) =>
          `${entry.title} ${entry.description} ${entry.label}`
            .toLocaleLowerCase()
            .includes(word)
        )
      )
    : [];
}
