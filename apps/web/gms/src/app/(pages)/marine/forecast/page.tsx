import { PageHeader } from "@/components/page-header";
import { PublishedProducts } from "@/components/pages/published-products";
export const metadata = { title: "Marine forecast" };
export const dynamic = "force-dynamic";
export default function MarineForecastPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Current marine bulletins issued by the Grenada Meteorological Service."
        title="Marine forecast"
      />
      <PublishedProducts kinds={["marine"]} />
    </div>
  );
}
