import { ProductDesk } from "@/components/wxproducts/product-desk";
export function ImpactForecasts() {
  return (
    <ProductDesk kinds={["morning", "midday", "evening"]} title="Forecasts" />
  );
}
