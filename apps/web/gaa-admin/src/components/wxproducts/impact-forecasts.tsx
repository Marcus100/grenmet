import { ProductDesk } from "@/components/wxproducts/product-desk";
export function ImpactForecasts() {
  return (
    <ProductDesk
      kinds={["morning", "midday", "evening", "marine-forecast"]}
      title="Forecasts"
    />
  );
}
