import { ProductDesk } from "@/components/wxproducts/product-desk";
export function ImpactForecasts() {
  return (
    <ProductDesk
      description="Prepare today's forecasts. Check the preview, then publish; the published forecast stays live until the next issue."
      kinds={["morning", "midday", "evening", "marine-forecast"]}
      title="Forecasts"
    />
  );
}
