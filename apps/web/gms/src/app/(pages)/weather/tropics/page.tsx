import { PageHeader } from "@/components/page-header";
import { PublishedProducts } from "@/components/pages/published-products";
export const metadata = { title: "Tropical Weather Outlook" };
export const dynamic = "force-dynamic";
export default function TropicalWeatherOutlookPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Tropical Weather Outlook issued by GMS with source attribution."
        title="Tropical Weather Outlook"
      />
      <PublishedProducts kinds={["outlook"]} />
    </div>
  );
}
