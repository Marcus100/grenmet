import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
export function bulletinHref(name: string) {
  const category = Object.entries(BULLETIN_CATEGORIES).find(
    ([, label]) => label === name
  )?.[0];
  return category ? `/bulletins/${category}` : "/products/bulletins";
}
export const BULLETIN_GUIDANCE: Record<
  keyof typeof BULLETIN_CATEGORIES,
  string
> = {
  cyclone:
    "Follow the system's position, movement, expected track and timing, together with the impacts and actions stated in each bulletin.",
  marine:
    "Read wind, visibility, sea state and wave height together. Each bulletin identifies its validity period, expected impacts and recommended response.",
  flood:
    "Flood and heavy rain bulletins describe the expected rainfall, affected areas, timing and potential impacts on roads, rivers and communities.",
  thunderstorm:
    "Thunderstorm bulletins cover storm timing and coverage, lightning, gusts and rainfall, with a response suited to the affected areas.",
  wind: "Wind bulletins describe direction, sustained wind and gusts, the period of strongest winds, affected areas and the recommended response.",
  heat: "Heat bulletins distinguish the event type, operational product and severity. They record daytime heat, nighttime conditions and how long the event is expected to last.",
  dust: "Dust and haze bulletins describe the affected area, visibility and duration, alongside any supporting guidance issued by GMS.",
  coastal:
    "Coastal hazard bulletins cover swell, coastal inundation and tide timing, identifying the coastlines expected to be affected.",
  tsunami:
    "Tsunami bulletins identify the event source, official references, expected arrival information and instructions for the affected coastline.",
};
