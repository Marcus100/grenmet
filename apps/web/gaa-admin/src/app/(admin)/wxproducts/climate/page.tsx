import { ProductDesk } from "@/components/wxproducts/product-desk";

export const metadata = { title: "Climate Bulletin" };

export default function ClimateBulletinPage() {
  return (
    <ProductDesk
      description="Prepare the monthly Climate Bulletin. Check the preview, then publish; the published bulletin stays live until the next issue."
      kinds={["climate-bulletin"]}
      title="Climate Bulletin"
    />
  );
}
