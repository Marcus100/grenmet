import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { StatFigure } from "@/components/home/stat-figure";

it("renders nothing for a figure not reported yet, never a dash or 0", () => {
  const { container } = render(
    <StatFigure
      stat={{ detail: "", label: "Strongest gust", unit: "km/h", value: null }}
    />
  );
  expect(container).toBeEmptyDOMElement();
});

it("renders a plain count with its unit", () => {
  const { container } = render(
    <StatFigure
      stat={{ detail: "", label: "Heavy rain days", unit: "days", value: "3" }}
    />
  );
  expect(container).toHaveTextContent("3days");
});
