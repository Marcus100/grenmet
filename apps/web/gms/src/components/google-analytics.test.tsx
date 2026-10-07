import { configForOrigin } from "@barrelsgd/ui/lib/analytics-policy";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { GoogleAnalytics } from "./google-analytics";

it("collects only on production Weather, never staging or unrelated origins", () => {
  expect(
    configForOrigin("gms", "https://weather.staging.barrels.gd")
  ).toBeNull();
  expect(configForOrigin("gms", "https://weather.barrels.gd")?.ga4).toBe(
    "G-DV1WPSG2CF"
  );
  expect(
    configForOrigin("signal", "https://weather.staging.barrels.gd")
  ).toBeNull();
  expect(configForOrigin("gms", "http://localhost:3003")).toBeNull();
});

it("legacy environment-wide GA settings cannot enable collection", () => {
  const { container } = render(
    <GoogleAnalytics environment="staging" measurementId="G-6PY9N83HCP" />
  );
  expect(container.innerHTML).toBe("");
});
