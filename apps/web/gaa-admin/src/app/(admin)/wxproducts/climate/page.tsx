import { ProductDesk } from "@/components/wxproducts/product-desk";

export const metadata = { title: "Climate Bulletin" };

export default function ClimateBulletinPage() {
  return <ProductDesk kinds={["climate-bulletin"]} title="Climate Bulletin" />;
}
