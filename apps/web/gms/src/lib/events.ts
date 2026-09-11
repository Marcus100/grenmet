/**
 * Event forecast subjects. Static placeholder content: the venue, the window
 * and the thresholds are the parts an organiser decides against, so they are
 * modelled here even though no forecast is wired yet.
 */
export interface EventThreshold {
  /** What the organiser does when it is met. */
  action: string;
  /** The condition that would disrupt the event. */
  condition: string;
}

export interface EventForecast {
  description: string;
  name: string;
  outlook: readonly string[];
  period: string;
  sensitivities: readonly string[];
  slug: string;
  thresholds: readonly EventThreshold[];
  venue: string;
}

export const EVENT_FORECASTS: readonly EventForecast[] = [
  {
    slug: "sailing-week",
    name: "Grenada Sailing Week",
    venue: "Southern coast and offshore race courses",
    period: "Late January",
    description:
      "Multi-day regatta run on offshore courses along Grenada's southern coast.",
    sensitivities: [
      "Wind speed and direction on the race course",
      "Sea state, particularly on the outer marks",
      "Squall timing during racing hours",
    ],
    thresholds: [
      {
        condition: "Sustained wind above 25 kt on the course",
        action: "Race committee considers postponement or a shortened course",
      },
      {
        condition: "Seas above 2.5 m",
        action: "Review course area; smaller classes may be held ashore",
      },
      {
        condition: "Thunderstorm within 10 nm",
        action: "Suspend racing and return the fleet",
      },
    ],
    outlook: [
      "Moderate to fresh north-easterly trades are typical for the period, giving reliable racing conditions.",
      "The main disruption risk is a passing shower line rather than a sustained blow.",
    ],
  },
  {
    slug: "spicemas",
    name: "Spicemas",
    venue: "St. George's and parish road routes",
    period: "August",
    description:
      "Grenada's carnival, with road events, judging points and large outdoor crowds.",
    sensitivities: [
      "Heavy rain during road events",
      "Heat stress across long outdoor sessions",
      "Lightning at open assembly points",
    ],
    thresholds: [
      {
        condition: "Heavy rain during a road march",
        action: "Stewards manage footing and drainage at known problem points",
      },
      {
        condition: "Feels-like temperature above 40 °C",
        action: "Increase water points and shaded rest areas",
      },
      {
        condition: "Lightning within 10 km",
        action: "Clear open assembly areas and pause the programme",
      },
    ],
    outlook: [
      "August falls in the wet season, so short heavy showers are likely on any given day and rarely last long.",
      "Heat, not rain, is usually the greater risk to participants during daytime road events.",
    ],
  },
  {
    slug: "carriacou-regatta",
    name: "Carriacou Regatta Festival",
    venue: "Hillsborough Bay and the Grenada–Carriacou passage",
    period: "Late July to early August",
    description:
      "Workboat and yacht racing off Carriacou, with heavy small-craft traffic on the passage.",
    sensitivities: [
      "Conditions in the passage for spectator and support craft",
      "Wind strength for traditional workboats",
      "Tropical wave activity during the peak season",
    ],
    thresholds: [
      {
        condition: "Small craft advisory in effect",
        action: "Restrict spectator craft movements on the passage",
      },
      {
        condition: "Sustained wind above 25 kt",
        action: "Review workboat classes; consider postponement",
      },
      {
        condition: "Tropical cyclone watch for the tri-island state",
        action: "Suspend the programme and secure vessels",
      },
    ],
    outlook: [
      "The festival falls inside the most active part of the hurricane season, so the tropical outlook is briefed daily as well as the local forecast.",
      "Conditions in the passage are consistently rougher than in Hillsborough Bay.",
    ],
  },
  {
    slug: "chocolate-fest",
    name: "Grenada Chocolate Fest",
    venue: "Estate and outdoor venues across the island",
    period: "May",
    description:
      "Estate tours, outdoor tastings and workshops across several parishes.",
    sensitivities: [
      "Rain during outdoor estate sessions",
      "Access on unsealed estate roads after heavy rain",
    ],
    thresholds: [
      {
        condition: "Heavy rain during an estate session",
        action: "Move to covered space; review estate road access",
      },
      {
        condition: "Sustained heavy rainfall the previous day",
        action: "Check estate track conditions before transporting guests",
      },
    ],
    outlook: [
      "May sits at the transition from dry to wet season, so shower frequency increases through the month.",
      "Estate access rather than the weather itself is usually the limiting factor.",
    ],
  },
];

export function findEvent(slug: string): EventForecast | undefined {
  return EVENT_FORECASTS.find((event) => event.slug === slug);
}
