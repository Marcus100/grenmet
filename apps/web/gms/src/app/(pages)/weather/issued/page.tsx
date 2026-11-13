import { PRODUCT_KINDS } from "@barrelsgd/gms/products";
import { PageHeader } from "@/components/page-header";
import { PublishedProducts } from "@/components/pages/published-products";
export const metadata = {
  title: "Issued forecasts",
  alternates: {
    types: { "application/rss+xml": "/weather/issued/feed.xml" },
  },
};
export const dynamic = "force-dynamic";
export default function ForecastProductsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Every forecast and bulletin GMS has issued: morning, midday and evening forecasts, the marine forecast, the Climate Bulletin and the tropical and hazard products."
        title="Issued forecasts"
      />
      <PublishedProducts
        kinds={Object.keys(PRODUCT_KINDS) as (keyof typeof PRODUCT_KINDS)[]}
      />
      <p className="text-body-sm leading-body-sm">
        Every issued product keeps its own page and PDF.{" "}
        <a
          className="text-gm-blue-ink hover:underline"
          href="/weather/issued/feed.xml"
        >
          Follow new issues by RSS
        </a>
        .
      </p>
    </div>
  );
}
