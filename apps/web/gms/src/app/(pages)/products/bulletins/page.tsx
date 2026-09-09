import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import { PageHeader } from "@/components/page-header";
import { PublishedProducts } from "@/components/pages/published-products";
export const metadata = { title: "Bulletins" };
export const dynamic = "force-dynamic";
export default function BulletinProductsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Current bulletins issued by the Grenada Meteorological Service. Consult Current alerts for CAP warnings."
        title="Bulletins"
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
