import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { GoogleAnalytics } from "./google-analytics";

it("legacy environment-wide GA settings cannot enable collection", () => {
  const { container } = render(
    <GoogleAnalytics environment="staging" measurementId="G-6PY9N83HCP" />
  );
  expect(container.innerHTML).toBe("");
});
