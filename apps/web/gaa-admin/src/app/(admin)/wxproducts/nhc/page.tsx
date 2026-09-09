import { ProductDesk } from "@/components/wxproducts/product-desk";
export const metadata = { title: "NHC Products" };
export default function NhcProductsPage() {
  return <ProductDesk kinds={["outlook"]} title="NHC Products" />;
}
