import { AviationDraft } from "@/components/wxproducts/aviation-draft";
import { WeatherReference } from "@/components/wxproducts/weather-reference";
export const metadata = { title: "TAF / METAR Composer" };
export default function AviationPage() {
  return (
    <div className="space-y-6">
      <AviationDraft />
      <WeatherReference />
    </div>
  );
}
