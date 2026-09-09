import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import { ProductDesk } from "@/components/wxproducts/product-desk";
export const metadata = { title: "Bulletins" };
export default function BulletinsPage() {
  return (
    <ProductDesk
      initialKind="marine"
      kinds={
        Object.keys(BULLETIN_CATEGORIES) as (keyof typeof BULLETIN_CATEGORIES)[]
      }
      title="Bulletins"
    />
  );
}
