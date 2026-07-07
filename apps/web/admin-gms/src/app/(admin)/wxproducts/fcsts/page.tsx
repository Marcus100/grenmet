import type { Metadata } from "next";
import { ImpactForecasts } from "@/components/wxproducts/impact-forecasts";

export const metadata: Metadata = {
  title: "Impact Based Forecasts",
  description:
    "Morning, midday and evening impact-based forecast products for the Grenada Meteorological Service.",
};

export default function ImpactForecastsPage() {
  return <ImpactForecasts />;
}
