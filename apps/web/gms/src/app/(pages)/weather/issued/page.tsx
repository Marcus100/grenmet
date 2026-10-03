import { PageHeader } from "@/components/page-header";
import { PublishedProducts } from "@/components/pages/published-products";
export const metadata = { title: "Impact-Based Forecasts" };
export const dynamic = "force-dynamic";
export default function ForecastProductsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Morning, midday and evening reports. The evening report covers tonight and the following four days."
        title="Impact-Based Forecasts"
      />
      <PublishedProducts kinds={["morning", "midday", "evening"]} />
    </div>
  );
}
