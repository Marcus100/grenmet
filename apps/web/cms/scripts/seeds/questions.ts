/**
 * Starter questions drafted by the Barrels team from existing GMS site pages
 * and public WMO/NOAA material. GMS checks each before publishing.
 */
type Topic =
  | "tropical"
  | "rain"
  | "heat"
  | "marine"
  | "climate"
  | "sky"
  | "safety"
  | "agriculture"
  | "aviation"
  | "gms";

export interface QuestionSeed {
  body: string[];
  links?: {
    category: "source" | "forecast" | "cap";
    title: string;
    url: string;
  }[];
  question: string;
  shortAnswer: string;
  topics: Topic[];
}

export const QUESTION_SEEDS: QuestionSeed[] = [
  {
    question: "What do Outlook, Watch and Warning mean?",
    shortAnswer:
      "They say how close and how certain a hazard is. An Outlook looks ahead to a possible hazard, a Watch says get ready, and a Warning says act now. The colour beside each says how serious the expected impacts are.",
    topics: ["safety", "gms"],
    body: [
      "GMS alerts answer two separate questions. The product name says how near and how likely the hazard is. The colour says how serious the expected impacts could be.",
      "An Outlook looks ahead. It tells you a hazard such as heavy rain or a tropical storm is possible in the coming days, so you can keep an eye on updates. An Outlook can be green, yellow, orange or red.",
      "A Watch means the hazard is possible in your area. It is the time to prepare: check supplies, secure loose items and know where you would go.",
      "A Warning means the hazard is expected or already happening. Follow the instructions in the warning and from the National Disaster Management Agency (NaDMA).",
      "A Watch or Warning is always yellow, orange or red. Green means no Watch or Warning is in force. The colour is always given in words too, so the message never depends on colour alone.",
    ],
  },
  {
    question: "How do I read a warning?",
    shortAnswer:
      "Check five things: what the hazard is, where, when it starts and ends, what it could do, and what you should do. Then check the issue time, because a newer update replaces it.",
    topics: ["safety", "gms"],
    body: [
      "Start with the hazard and the colour. They tell you what is coming and how serious the impacts could be.",
      "Next, read the area. Warnings can cover Grenada, Carriacou and Petite Martinique together, or only some parts or coastal waters.",
      "Then the timing: when the conditions are expected to start and when the warning expires. Conditions can arrive before the worst of a system.",
      "The impacts section says what could happen, such as flooding on roads, landslides or dangerous seas. The instructions say what to do about it.",
      "Finally, look at the issue time. GMS updates warnings as a situation changes. A screenshot shared hours ago may no longer be correct, so check the Alerts page for the latest issue.",
    ],
  },
  {
    question: "What is Saharan dust, and why is it hazy?",
    shortAnswer:
      "Dust lifted from the Sahara Desert travels about 5,000 km across the Atlantic in a dry layer of air. When it reaches us the sky turns milky and visibility drops, most often between May and August.",
    topics: ["sky", "heat", "safety"],
    body: [
      "Strong winds over North Africa lift fine desert dust high into the air. It travels west across the Atlantic in a hot, dry layer known as the Saharan Air Layer, and can reach the Caribbean within about a week.",
      "The tiny particles scatter sunlight, so the sky looks pale or milky instead of blue, and distant hills fade from view. Sunrises and sunsets can look especially red.",
      "Dust episodes are most common from late spring into summer. The dry air can also make it harder for tropical storms to form while the dust is present.",
      "Dust can irritate the eyes and airways. People with asthma or other breathing conditions may want to limit time outdoors on hazy days and follow advice from health authorities.",
    ],
    links: [
      {
        category: "source",
        title: "NOAA: What is the Saharan Air Layer?",
        url: "https://www.aoml.noaa.gov/hrd-faq/",
      },
    ],
  },
  {
    question: "How are hurricanes named?",
    shortAnswer:
      "The World Meteorological Organization keeps six lists of names for the Atlantic, used in turn. Names of especially deadly or costly storms are retired, which is why there will never be another Ivan or Beryl.",
    topics: ["tropical"],
    body: [
      "Names make storms easier to talk about and to warn people about than numbers or positions. Atlantic names come from six lists kept by a committee of the World Meteorological Organization (WMO), which includes Caribbean countries.",
      "The lists are used in rotation, so a list comes back every six years. Names run in alphabetical order through the season, alternating between men's and women's names.",
      "When a storm causes so much loss that reusing its name would be insensitive, the committee retires it and chooses a replacement. Ivan (2004) and Beryl (2024) have both been retired.",
      "If a busy season runs out of names, forecasters now use a supplementary list of names instead of the Greek alphabet.",
    ],
    links: [
      {
        category: "source",
        title: "WMO: Tropical cyclone naming",
        url: "https://wmo.int/topics/tropical-cyclone/tropical-cyclone-naming",
      },
    ],
  },
  {
    question: "What do the words in a forecast mean?",
    shortAnswer:
      "Words like isolated, scattered and numerous say how much of the area will see showers, not how heavy they are. Sea state words such as slight, moderate and rough describe wave heights.",
    topics: ["rain", "marine", "gms"],
    body: [
      "Isolated showers means only a few places are likely to get rain. Scattered means a fair share of the area will see showers at some point. Numerous or widespread means most places will.",
      "These words describe coverage, not intensity. A single isolated shower can still be heavy where it falls.",
      "Fair means little cloud and no rain of note. Partly cloudy means sunny spells between clouds.",
      "At sea, slight means waves of roughly half a metre to just over a metre, moderate means about one to two and a half metres, and rough means higher still. The forecast gives the wave heights in feet and metres as well.",
      "The glossary on this site lists more of the terms GMS uses.",
    ],
  },
  {
    question: "Can a hurricane hit Grenada?",
    shortAnswer:
      "Yes. Grenada lies near the southern edge of the Atlantic hurricane belt, so it is hit less often than islands further north, but Janet in 1955, Ivan in 2004 and Beryl in 2024 show the risk is real every season.",
    topics: ["tropical", "safety", "climate"],
    body: [
      "Grenada sits at roughly 12°N, near the southern edge of the Atlantic hurricane belt. Most Atlantic systems track further north, which is why the islands are struck less often than the northern Windward and Leeward Islands.",
      "Less often is not never. Janet in 1955, Ivan in 2004 and Beryl in 2024 all brought severe damage. A long quiet run tells you nothing about the coming season.",
      "Prepare every year before the season starts on 1 June, and follow GMS outlooks, watches and warnings when a system approaches.",
    ],
  },
  {
    question: "Why do the two coasts of Grenada have different weather?",
    shortAnswer:
      "The trade winds push moist air up the mountains, where it cools and rains on the windward side. By the time it sinks on the western side it is drier, so the leeward coast gets less rain.",
    topics: ["rain", "climate"],
    body: [
      "Grenada's mountainous interior forces the prevailing north-easterly trade winds upward as they reach the island. Air rising over the windward side cools, condenses and rains, which is why Grand Etang is far wetter than the coast.",
      "By the time that air descends on the leeward western side it has lost much of its moisture and is warming again, which suppresses cloud. The result is a rain shadow: two places a few kilometres apart with different climates.",
    ],
  },
  {
    question: "What is a tropical wave?",
    shortAnswer:
      "A tropical wave is a ripple in the trade winds, often starting over Africa, that brings a spell of cloud and showers as it passes. Most pass in a day or two; a few grow into storms.",
    topics: ["tropical", "rain"],
    body: [
      "A tropical wave is a westward-moving trough in the trade wind flow, often originating over Africa. Waves carry the moisture and converging winds behind many of Grenada's showery spells.",
      "Most never become anything more. They pass over, deliver a wet day or two, and move on.",
      "A handful each season organise further and become depressions, storms and hurricanes, which is why GMS follows every wave in its tropical weather outlook.",
    ],
  },
];
