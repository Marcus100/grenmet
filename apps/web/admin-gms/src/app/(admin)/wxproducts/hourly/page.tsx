import type { Metadata } from "next";
import { HourlyEditor } from "@/components/wxproducts/hourly-editor";

export const metadata: Metadata = {
  title: "Hourly Forecast",
  description: "Hourly weather forecast — edit and preview",
};

export default function HourlyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Hourly Weather Forecast
        </h1>
        <p className="text-muted-foreground text-sm">
          Add hours to preview the forecast, then print or export.
        </p>
      </div>
      <HourlyEditor />
    </div>
  );
}
