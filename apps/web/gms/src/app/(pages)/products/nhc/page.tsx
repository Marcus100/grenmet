import { PageHeader } from "@/components/page-header";
import { PublishedProducts } from "@/components/pages/published-products";
export const metadata = { title: "NHC Products" };
export const dynamic = "force-dynamic";
export default function NhcProductsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Tropical Weather Outlook issued by GMS with source attribution."
        title="NHC Products"
      />
      <PublishedProducts kinds={["outlook"]} />
    </div>
  );
}
