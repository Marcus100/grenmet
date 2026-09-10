import { type PublishedProduct, productTitle } from "@barrelsgd/gms/products";
import type { PublishedContent } from "@/lib/cms";
export interface ProductPost {
  href: string;
  id: string;
  imageUrl: string;
  issuedAt: string;
  paragraphs: string[];
  reference?: boolean;
  source: string;
  summary: string;
  title: string;
}
export const REFERENCE_POSTS: ProductPost[] = [
  {
    id: "evening-2026-09-08",
    imageUrl:
      "https://images.unsplash.com/photo-1504370805625-d32c54b16100?auto=format&fit=crop&w=1000&q=80",
    summary:
      "Showers turn heavier tonight, with isolated thunder. Watch for water pooling on roads; a Small Craft Advisory is also in the evening forecast.",
    title: "A wetter night ahead — here is the evening update",
    issuedAt: "2026-09-08T18:00",
    source: "Evening Forecast · Johnathan Pryce",
    reference: true,
    href: "/updates/evening-2026-09-08",
    paragraphs: [
      "Good evening, Grenada, Carriacou and Petite Martinique. Our September 8 report points to a cloudy night with showers, heavy at times, and isolated thunder. Tonight's minimum is 24.5°C.",
      "Winds are ENE to ESE at 12–22 mph, with higher gusts in showers. Seas are moderate, with waves of 5–7 feet in open water. The report includes a low chance of flash flooding and a Small Craft Advisory.",
      "The impacts highlighted in this issue are localized pooling or flooding on roads and possible land slippage. Read the full forecast and the current alerts before making plans.",
    ],
  },
  {
    id: "outlook-2026-09-08-14",
    imageUrl:
      "https://images.unsplash.com/photo-1561553543-e4c7b608b98d?auto=format&fit=crop&w=1000&q=80",
    summary:
      "Two tropical waves are on our watch. The nearer wave brings more showers tonight; cyclone formation is not expected in this 48-hour outlook.",
    title: "Two tropical waves on our afternoon watch",
    issuedAt: "2026-09-08T14:00",
    source: "Tropical Weather Outlook · Johnathan Pryce · courtesy NHC",
    reference: true,
    href: "/updates/outlook-2026-09-08-14",
    paragraphs: [
      "Here is our 2 p.m. tropical update for September 8. We are following two waves: one near 58°W, moving west at 10–15 knots, and another near 47°W, moving west at 15–20 knots.",
      "The wave nearer the islands is expected to bring more cloud, showers and possible isolated thunderstorms tonight into tomorrow. In this issue, tropical cyclone formation is not expected during the next 48 hours.",
      "Those are two different messages: the formation outlook describes the prospect of a cyclone; the local forecast describes the weather we can experience here. The next scheduled outlook is 8 p.m.",
    ],
  },
  {
    id: "midday-2026-09-08",
    imageUrl:
      "https://images.unsplash.com/photo-1428592953211-077101b2021b?auto=format&fit=crop&w=1000&q=80",
    summary:
      "31.9°C at MBIA at noon. A fair afternoon gives way to more cloud and overnight showers. Seas remain moderate, up to 7 feet.",
    title: "Your lunchtime weather check",
    issuedAt: "2026-09-08T12:00",
    source: "Midday Forecast · Vondi Cyrus",
    reference: true,
    href: "/updates/midday-2026-09-08",
    paragraphs: [
      "It was 31.9°C at MBIA at midday on September 8. Our updated forecast gives a maximum of 32.5°C and a minimum of 24.5°C tonight.",
      "Fair conditions give way to increasing evening cloud. Showers become more frequent overnight, with possible nighttime thunder. Winds are ENE to ESE at 12–22 mph, gusting higher with showers.",
      "Moderate seas reach up to 7 feet in easterly swells. This report carries a Small Craft Advisory. High tide is listed at 2:15 p.m., low tide at 6 p.m., and sunset at 6:12 p.m.",
    ],
  },
  {
    id: "morning-2026-09-08",
    imageUrl:
      "https://images.unsplash.com/photo-1504370805625-d32c54b16100?auto=format&fit=crop&w=1000&q=80",
    summary:
      "A fair, slightly hazy start across the islands. Keep an umbrella nearby for the overnight change; small craft should check the marine advisory.",
    title: "A fair start, with an overnight change to watch",
    issuedAt: "2026-09-08T07:00",
    source: "Morning Forecast · Vondi Cyrus",
    reference: true,
    href: "/updates/morning-2026-09-08",
    paragraphs: [
      "Good morning. Our September 8 forecast starts fair to partly cloudy and slightly hazy, with cloud and more frequent showers expected overnight.",
      "The morning issue forecasts 32.0°C for the daytime maximum and 24.5°C for tonight's minimum. Winds are ENE to ESE at 12–22 mph. A Small Craft Advisory accompanies moderate seas with waves up to 7 feet.",
      "We update the Impact-Based Forecast at 7 a.m., noon and 6 p.m. Look for the issue time when comparing reports: the midday and evening issues can refine this morning assessment.",
    ],
  },
  {
    id: "marine-2026-09-08",
    imageUrl:
      "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=1000&q=80",
    summary:
      "Heading out on the water? Our 5 a.m. bulletin gives waves of 5–7 feet. Showers can briefly reduce visibility—check later updates before departure.",
    title: "From the marine desk: winds, waves and visibility",
    issuedAt: "2026-09-08T05:00",
    source: "Marine Bulletin · Nicole Jones",
    reference: true,
    href: "/updates/marine-2026-09-08",
    paragraphs: [
      "Our 5 a.m. marine bulletin for September 8 describes moderate seas, with waves of 5–7 feet in open water, and ENE to ESE winds at 13–23 knots.",
      "Visibility is generally greater than 5 nautical miles, but showers can reduce it temporarily. A surge of low-level moisture is the main weather feature in this issue.",
      "This 24-hour bulletin was issued at Green, with minimal impact. Later daily forecasts carry a Small Craft Advisory, so use the latest relevant issue rather than assuming the early-morning assessment is unchanged.",
    ],
  },
];
export function productPost(product: PublishedProduct): ProductPost {
  const v = product.values;
  return {
    id: product.id,
    imageUrl:
      product.kind === "marine"
        ? REFERENCE_POSTS[4].imageUrl
        : REFERENCE_POSTS[0].imageUrl,
    summary:
      (
        v.summary ||
        v.synopsis ||
        v.systems ||
        productTitle(product.kind)
      ).slice(0, 180) +
      ((v.summary || v.synopsis || v.systems || "").length > 180 ? "…" : ""),
    title: productTitle(product.kind),
    issuedAt: v.issuedAt,
    source: `${productTitle(product.kind)} · ${v.forecaster}`,
    href: `/products/issued/${product.id}`,
    paragraphs: [
      `Here is our ${productTitle(product.kind).toLowerCase()} for ${v.area}.`,
      v.summary || v.synopsis || v.systems || "",
      v.formation || v.impacts || "",
      v.response || "",
      `Valid from ${v.validFrom.replace("T", " ")} until ${v.validTo.replace("T", " ")} (Grenada time).`,
    ].filter(Boolean),
  };
}
export interface WeatherArticle {
  body?: string;
  href: string;
  id: number | string;
  imageUrl: string;
  published: string;
  sections?: { heading: string; paragraphs: string[] }[];
  slug: string;
  sources?: { title: string; url: string }[];
  summary: string;
  title: string;
}
export const WEATHER_ARTICLES: WeatherArticle[] = [
  {
    id: 1,
    slug: "tropical-waves-and-local-weather",
    title: "No cyclone expected. So why are showers still in the forecast?",
    summary:
      "Our September 8 outlook and local forecast answer different questions. Here is how to read them together.",
    imageUrl:
      "https://images.unsplash.com/photo-1561553543-e4c7b608b98d?auto=format&fit=crop&w=800&q=80",
    published: "8 September 2026",
    href: "/news/tropical-waves-and-local-weather",
    sections: [
      {
        heading: "Two reports, two questions",
        paragraphs: [
          "At 2 p.m. on September 8, the GMS Tropical Weather Outlook described two westward-moving tropical waves. It also said tropical cyclone formation was not expected during the following 48 hours. Meanwhile, the local forecast called for cloud, showers and possible isolated thunder.",
          "There is no contradiction in those messages. The outlook is discussing cyclone formation. The local report is describing the weather expected across Grenada, Carriacou and Petite Martinique. A reader planning an evening journey needs the local forecast as well as the broader tropical picture.",
        ],
      },
      {
        heading: "The wave nearer the islands",
        paragraphs: [
          "The afternoon outlook placed one wave near 58°W and described its movement as westward at 10–15 knots. That issue expected the wave to affect the island chain overnight into the next day, increasing cloud, showers and the possibility of isolated thunderstorms.",
          "The second wave was farther east, near 47°W. The outlook recorded its position and movement separately. Keeping each system in its own paragraph makes it easier to see which feature is nearer and which is being followed farther upstream.",
        ],
      },
      {
        heading: "Start with the issue time",
        paragraphs: [
          "Our morning, midday and evening reports are successive assessments. The September 8 evening report described showers becoming heavy at times, with isolated thunder and localized flooding impacts. That later assessment is the relevant companion to the afternoon tropical outlook.",
          "When reading a shared screenshot or social post, check its date and time. Then read the current report and bulletin pages for any later issue. A statement about formation over a particular 48-hour period should not be carried forward as an unlimited all-clear.",
        ],
      },
    ],
  },
  {
    id: 2,
    slug: "reading-sea-state",
    title: "What does a wave-height forecast tell you?",
    summary:
      "Sea state, swell, wind and visibility each tell part of the story. A single wave-height number cannot describe the whole sea.",
    imageUrl:
      "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=800&q=80",
    published: "8 September 2026",
    href: "/news/reading-sea-state",
    sections: [
      {
        heading: "Read the conditions together",
        paragraphs: [
          "The September 8 marine bulletin listed moderate seas, waves of 5–7 feet in open water, wind at 13–23 knots, and generally good visibility. Those are separate pieces of information. The wind describes one part of the conditions; the wave and visibility descriptions add others.",
          "The bulletin also noted that precipitation could temporarily reduce horizontal visibility. That qualification matters: a general visibility description is not a promise that every shower will leave visibility unchanged.",
        ],
      },
      {
        heading: "Waves vary",
        paragraphs: [
          "The National Weather Service explains that significant wave height is an average of the highest third of waves. Individual waves can be larger, sometimes approaching twice the significant height. A forecast height therefore should not be interpreted as a rigid ceiling on every wave.",
          "This explanation describes the wave statistic. It does not change the numbers in a GMS bulletin or calculate conditions for a particular boat, crossing or harbour. Read the issued wording and its units carefully.",
        ],
      },
      {
        heading: "An early bulletin is one point in time",
        paragraphs: [
          "The 5 a.m. bulletin in the supplied reports was Green. Later daily forecasts included a Small Craft Advisory. The issue time helps readers understand that they are looking at different assessments rather than interchangeable labels.",
          "Our bulletin pages keep the issue time, validity, expected impacts and response visible together. The current alert panel remains a separate view of CAP warnings while these publication workflows are being developed.",
        ],
      },
    ],
    sources: [
      {
        title: "National Weather Service: Significant Wave Height",
        url: "https://www.weather.gov/key/marine_sigwave",
      },
    ],
  },
  {
    id: 3,
    slug: "inside-the-daily-forecast",
    title: "Three daily updates, one evolving forecast",
    summary:
      "What changes between the 7 a.m., noon and 6 p.m. reports—and how the four-day evening outlook fits in.",
    imageUrl:
      "https://images.unsplash.com/photo-1504370805625-d32c54b16100?auto=format&fit=crop&w=800&q=80",
    published: "8 September 2026",
    href: "/news/inside-the-daily-forecast",
    sections: [
      {
        heading: "The morning starting point",
        paragraphs: [
          "The morning report is issued at 7 a.m. It sets out the weather, wind and marine forecast, with expected impacts and the recommended response. Temperatures, tide information and sunrise and sunset times help readers put the forecast into their day's plans.",
          "On September 8, the morning report gave a maximum temperature of 32.0°C. It described a fair to partly cloudy and slightly hazy start, with an increase in cloud and showers overnight.",
        ],
      },
      {
        heading: "What the midday issue adds",
        paragraphs: [
          "The noon report updates that assessment. It also has a place for the midday temperature observed at MBIA, keeping an observation distinct from a forecast maximum. On September 8 those values were 31.9°C observed and 32.5°C forecast.",
          "That distinction is why the public page labels the observation with its time. A midday reading cannot truthfully remain labelled 'right now' through the evening or the next day.",
        ],
      },
      {
        heading: "Tonight plus four dated days",
        paragraphs: [
          "The evening report is issued at 6 p.m. The new form covers tonight and the following four calendar days. Each day has its own date, weather description, maximum and minimum temperature, wind and sea conditions.",
          "For a September 8 evening issue, those dates are September 9, 10, 11 and 12. The supplied example contains three future days; it does not supply a value for September 12. The website leaves that missing forecast unfilled rather than inventing a fourth day's weather.",
        ],
      },
      {
        heading: "A short update or the full report",
        paragraphs: [
          "Latest from us turns an issued report into a short, conversational update that can be read or shared easily. The full product remains available for its detailed fields. Weather news, like this article, gives us room to explain the reasoning and terminology behind those short updates.",
        ],
      },
    ],
  },
];
const PLACEHOLDER_ARTICLE_IMAGE = REFERENCE_POSTS[0].imageUrl;
export function contentToArticle(content: PublishedContent): WeatherArticle {
  return {
    id: content.id,
    slug: content.slug,
    title: content.title,
    summary: content.summary ?? "",
    imageUrl: content.imageUrl ?? PLACEHOLDER_ARTICLE_IMAGE,
    published: new Date(content.updatedAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    href: `/news/${content.slug}`,
    body: content.body,
  };
}
