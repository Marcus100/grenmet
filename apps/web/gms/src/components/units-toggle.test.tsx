import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Measure, Temperature } from "@/components/measure";
import { UnitsToggle } from "@/components/units-toggle";

afterEach(() => {
  document.documentElement.removeAttribute("data-units");
  window.localStorage.clear();
});

describe("UnitsToggle", () => {
  it("starts imperial, switches the page to metric and remembers it", () => {
    render(<UnitsToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-units")).toBe("metric");
    expect(window.localStorage.getItem("gm-units")).toBe("metric");
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-units")).toBe(
      "imperial"
    );
  });
});

describe("Measure", () => {
  it("renders both unit systems for CSS to choose between", () => {
    const { container } = render(
      <Measure measure={{ low: 1013.25, quantity: "pressure" }} />
    );
    expect(
      container.querySelector('[data-units-only="imperial"]')?.textContent
    ).toBe("29.92 inHg");
    expect(
      container.querySelector('[data-units-only="metric"]')?.textContent
    ).toBe("1013.3 hPa");
  });

  it("renders nothing without a figure, and a temperature dash", () => {
    const { container } = render(
      <Measure measure={{ low: null, quantity: "rain" }} />
    );
    expect(container).toBeEmptyDOMElement();
    render(<Temperature value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
