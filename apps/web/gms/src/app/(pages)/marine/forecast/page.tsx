import { PageHeader } from "@/components/page-header";
import { PublishedProducts } from "@/components/pages/published-products";
export const metadata = { title: "Marine forecast" };
export const dynamic = "force-dynamic";
export default function MarineForecastPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="The daily Marine Forecast (05:00 to 05:00) and current marine bulletins from the Grenada Meteorological Service."
        title="Marine forecast"
      />
      <PublishedProducts kinds={["marine-forecast", "marine"]} />
    </div>
  );
}
