import type { Metadata } from "next";
import { ForecastEditor } from "@/components/wxproducts/forecast-editor";

export const metadata: Metadata = {
  title: "Midday Forecast",
  description: "Midday weather forecast — edit and preview",
};

export default function MiddayForecastPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Midday Weather Forecast
        </h1>
        <p className="text-muted-foreground text-sm">
          Fill in the form to preview the forecast, then print or export.
        </p>
      </div>
      <ForecastEditor period="Midday" />
    </div>
  );
}
