/**
 * Starter "Sky, history and a little fun" entries drafted by the Barrels
 * team from public NOAA, WMO and Met Office material. GMS checks each fact
 * (especially dates and figures) before publishing.
 */
type Topic = "tropical" | "rain" | "sky" | "safety" | "climate";

export type DiscoverSeed =
  | {
      type: "on-this-day";
      title: string;
      day: number;
      month: number;
      year: number;
      whatHappened: string;
      topics: Topic[];
    }
  | {
      type: "quiz";
      title: string;
      intro: string;
      questions: {
        prompt: string;
        options: string[];
        correct: number;
        explanation: string;
      }[];
      topics: Topic[];
    }
  | {
      type: "fact";
      title: string;
      fact: string;
      source: string;
      sourceUrl: string;
      topics: Topic[];
    };

export const DISCOVER_SEEDS: DiscoverSeed[] = [
  {
    type: "on-this-day",
    title: "Hurricane Janet crosses Grenada",
    day: 22,
    month: 9,
    year: 1955,
    whatHappened:
      "Hurricane Janet swept across Grenada and Carriacou, taking lives and flattening homes and much of the nutmeg and cocoa crop. It was the worst storm in living memory until Ivan.",
    topics: ["tropical"],
  },
  {
    type: "on-this-day",
    title: "Hurricane Ivan strikes Grenada",
    day: 7,
    month: 9,
    year: 2004,
    whatHappened:
      "Ivan struck Grenada as a major hurricane, killing 39 people and damaging or destroying around nine in ten buildings. It changed how the islands prepare for every season since.",
    topics: ["tropical", "safety"],
  },
  {
    type: "on-this-day",
    title: "Hurricane Emily passes over the north",
    day: 14,
    month: 7,
    year: 2005,
    whatHappened:
      "Less than a year after Ivan, Hurricane Emily brought damaging winds and flooding to Carriacou and northern Grenada, a reminder that early-season storms reach us too.",
    topics: ["tropical"],
  },
  {
    type: "on-this-day",
    title: "Hurricane Beryl hits Carriacou",
    day: 1,
    month: 7,
    year: 2024,
    whatHappened:
      "Beryl made landfall on Carriacou as a Category 4 hurricane, devastating Carriacou and Petite Martinique. It became the earliest Category 5 hurricane on record in the Atlantic.",
    topics: ["tropical", "safety"],
  },
  {
    type: "quiz",
    title: "Can you name these five clouds?",
    intro: "Five questions, about two minutes. Look up before you start.",
    topics: ["sky"],
    questions: [
      {
        prompt: "Which cloud brings thunder and lightning?",
        options: ["Cumulonimbus", "Cirrus", "Stratus", "Altocumulus"],
        correct: 1,
        explanation:
          "Cumulonimbus clouds tower many kilometres high. Their strong updrafts separate electric charge, which produces lightning and thunder.",
      },
      {
        prompt:
          "Thin, wispy streaks high in the sky, made of ice crystals, are…",
        options: ["Cumulus", "Cirrus", "Nimbostratus", "Stratus"],
        correct: 2,
        explanation:
          "Cirrus form so high that they are made of ice. They often appear ahead of changing weather.",
      },
      {
        prompt: "A flat, grey sheet of low cloud that can bring drizzle is…",
        options: ["Cirrocumulus", "Cumulonimbus", "Stratus", "Cirrus"],
        correct: 3,
        explanation:
          "Stratus is a low, even layer. It can bring drizzle but rarely heavy rain.",
      },
      {
        prompt: "Puffy, fair-weather clouds with flat bases are…",
        options: ["Cumulus", "Altostratus", "Nimbostratus", "Cirrostratus"],
        correct: 1,
        explanation:
          "Cumulus grow on sunny days as warm air rises. Their flat bases mark the height where the rising air starts to condense.",
      },
      {
        prompt: "A halo around the sun or moon means you are looking through…",
        options: ["Stratus", "Cumulus", "Cumulonimbus", "Cirrostratus"],
        correct: 4,
        explanation:
          "Cirrostratus is a thin veil of ice crystals. The crystals bend light into a ring around the sun or moon.",
      },
    ],
  },
  {
    type: "fact",
    title: "The busiest weeks",
    fact: "The Atlantic hurricane season runs from 1 June to 30 November, and its busiest stretch is usually mid-August to mid-October.",
    source: "NOAA National Hurricane Center",
    sourceUrl: "https://www.nhc.noaa.gov/climo/",
    topics: ["tropical"],
  },
  {
    type: "fact",
    title: "Dust from Africa",
    fact: "Saharan dust can cross the Atlantic to the Caribbean in about a week, turning our skies milky and our sunsets red.",
    source: "NOAA",
    sourceUrl: "https://www.aoml.noaa.gov/hrd-faq/",
    topics: ["sky"],
  },
  {
    type: "fact",
    title: "Where rainbows are",
    fact: "You can only see a rainbow with the sun behind you and the rain in front of you.",
    source: "Met Office",
    sourceUrl:
      "https://weather.metoffice.gov.uk/learn-about/weather/optical-effects/rainbows",
    topics: ["sky", "rain"],
  },
  {
    type: "fact",
    title: "When thunder roars",
    fact: "Lightning can strike about 16 km (10 miles) from a storm. If you can hear thunder, you are close enough to be struck, so go indoors.",
    source: "US National Weather Service",
    sourceUrl: "https://www.weather.gov/safety/lightning",
    topics: ["safety"],
  },
  {
    type: "fact",
    title: "Pressure in the eye",
    fact: "Normal air pressure at sea level is about 1013 hPa. In the eye of a strong hurricane it can fall below 940 hPa.",
    source: "NOAA National Hurricane Center",
    sourceUrl: "https://www.nhc.noaa.gov/aboutsshws.php",
    topics: ["tropical"],
  },
];
