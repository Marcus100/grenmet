import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const desk = vi.hoisted(() => ({ props: vi.fn() }));
vi.mock("@/components/wxproducts/product-desk", () => ({
  ProductDesk: (props: unknown) => {
    desk.props(props);
    return null;
  },
}));

import { ImpactForecasts } from "./impact-forecasts";

it("gives the forecasts desk its own help text", () => {
  render(<ImpactForecasts />);
  expect(desk.props).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Forecasts",
      description:
        "Prepare today's forecasts. Check the preview, then publish; the published forecast stays live until the next issue.",
    })
  );
});
