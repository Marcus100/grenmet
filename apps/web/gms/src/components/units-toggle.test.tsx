import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Measure, Temperature } from "@/components/measure";
import { UnitsToggle } from "@/components/units-toggle";

const captureEvent = vi.hoisted(() => vi.fn());
vi.mock("@barrelsgd/ui/lib/analytics-runtime", () => ({ captureEvent }));

afterEach(() => {
  document.documentElement.removeAttribute("data-units");
  window.localStorage.clear();
  captureEvent.mockClear();
});

describe("UnitsToggle", () => {
  it("starts metric, switches the page to imperial and remembers it", () => {
    render(<UnitsToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-units")).toBe(
      "imperial"
    );
    expect(window.localStorage.getItem("gm-units")).toBe("imperial");
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-units")).toBe("metric");
  });

  it("reports each switch as a counts-only units_switched event", () => {
    render(<UnitsToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(captureEvent).toHaveBeenLastCalledWith("units_switched", {
      to: "imperial",
    });
    fireEvent.click(screen.getByRole("button"));
    expect(captureEvent).toHaveBeenLastCalledWith("units_switched", {
      to: "metric",
    });
    expect(captureEvent).toHaveBeenCalledTimes(2);
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
