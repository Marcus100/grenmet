import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import { ProductDesk } from "@/components/wxproducts/product-desk";
export const metadata = { title: "Bulletins" };
type BulletinKind = keyof typeof BULLETIN_CATEGORIES;
const BULLETIN_KINDS = Object.keys(BULLETIN_CATEGORIES) as [
  BulletinKind,
  ...BulletinKind[],
];
export default function BulletinsPage() {
  return (
    <ProductDesk
      initialKind="marine"
      kinds={BULLETIN_KINDS}
      title="Bulletins"
    />
  );
}
