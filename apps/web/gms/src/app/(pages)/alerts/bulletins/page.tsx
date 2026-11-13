import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import { PageHeader } from "@/components/page-header";
import { PublishedProducts } from "@/components/pages/published-products";
export const metadata = { title: "GMS alerts" };
export const dynamic = "force-dynamic";
export default function BulletinProductsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Green-level alerts issued by the Grenada Meteorological Service. Yellow, orange and red notices are warnings: see Alerts in effect."
        title="GMS alerts"
      />
      <PublishedProducts
        kinds={
          Object.keys(
            BULLETIN_CATEGORIES
          ) as (keyof typeof BULLETIN_CATEGORIES)[]
        }
      />
    </div>
  );
}
