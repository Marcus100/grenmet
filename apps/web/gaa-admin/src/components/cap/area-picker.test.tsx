import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AreaPicker } from "./area-picker";

vi.mock("react-map-gl/maplibre", () => ({
  Map: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="cap-map">{children}</div>
  ),
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
  NavigationControl: () => null,
  ScaleControl: () => null,
  AttributionControl: () => null,
}));

describe("AreaPicker", () => {
  it("defaults to the parish (geocode) mode with nothing selected", () => {
    const onAreasChange = vi.fn();
    render(<AreaPicker onAreasChange={onAreasChange} severity="Severe" />);
    expect(screen.getByRole("button", { name: "Parishes" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(onAreasChange).toHaveBeenLastCalledWith([]);
  });

  it("emits a GEOCODE area when a parish is toggled on, and clears it when toggled off", () => {
    const onAreasChange = vi.fn();
    render(<AreaPicker onAreasChange={onAreasChange} severity="Severe" />);

    fireEvent.click(screen.getByRole("button", { name: "St. Andrew" }));
    expect(onAreasChange).toHaveBeenLastCalledWith([
      {
        kind: "GEOCODE",
        area_desc: "Saint Andrew",
        geocodes: [{ value_name: "ISO3166-2:GD", value: "GD-01" }],
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "St. Andrew" }));
    expect(onAreasChange).toHaveBeenLastCalledWith([]);
  });

  it("switches to circle mode and reports no centre until the map is clicked", () => {
    const onAreasChange = vi.fn();
    render(<AreaPicker onAreasChange={onAreasChange} severity="Moderate" />);

    fireEvent.click(screen.getByRole("button", { name: "Circle" }));
    expect(screen.getByText("No centre placed yet.")).toBeInTheDocument();
    expect(onAreasChange).toHaveBeenLastCalledWith([]);
  });

  it("switches to polygon mode and reports the current vertex count", () => {
    render(<AreaPicker onAreasChange={vi.fn()} severity="Minor" />);
    fireEvent.click(screen.getByRole("button", { name: "Polygon" }));
    expect(screen.getByText("0 points")).toBeInTheDocument();
  });
});
