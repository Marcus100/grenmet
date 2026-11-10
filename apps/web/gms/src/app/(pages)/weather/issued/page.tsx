import { PRODUCT_KINDS } from "@barrelsgd/gms/products";
import { PageHeader } from "@/components/page-header";
import { PublishedProducts } from "@/components/pages/published-products";
export const metadata = { title: "Impact-Based Forecasts" };
export const dynamic = "force-dynamic";
export default function ForecastProductsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Every forecast and bulletin GMS has issued: morning, midday and evening forecasts, the marine forecast, the Climate Bulletin and the tropical and hazard products."
        title="Impact-Based Forecasts"
      />
      <PublishedProducts
        kinds={Object.keys(PRODUCT_KINDS) as (keyof typeof PRODUCT_KINDS)[]}
      />
    </div>
  );
}
