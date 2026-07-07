"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@grenmet/ui/components/ui/tabs";
import { ForecastEditor } from "./forecast-editor";

const PERIODS = ["Morning", "Midday", "Evening"] as const;

export function ImpactForecasts() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Impact Based Forecasts
        </h1>
        <p className="text-muted-foreground text-sm">
          Morning, midday and evening forecast products — edit the impact
          outlook, preview and export.
        </p>
      </div>

      <Tabs className="flex flex-col gap-4" defaultValue="Morning">
        <TabsList
          className="h-auto w-full justify-start gap-6 border-b"
          variant="line"
        >
          {PERIODS.map((period) => (
            <TabsTrigger
              className="pb-2.5 text-base"
              key={period}
              value={period}
            >
              {period}
            </TabsTrigger>
          ))}
        </TabsList>
        {PERIODS.map((period) => (
          <TabsContent key={period} value={period}>
            <ForecastEditor period={period} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
