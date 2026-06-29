import type { Metadata } from "next";
import { HomeMetricCards } from "./_components/home-metric-cards";
import { RainfallChart } from "./_components/rainfall-chart";

export const metadata: Metadata = {
  title: "Home",
  description: "Grenada Meteorological Service — operations dashboard",
};

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <HomeMetricCards />
      <RainfallChart />
    </div>
  );
}
