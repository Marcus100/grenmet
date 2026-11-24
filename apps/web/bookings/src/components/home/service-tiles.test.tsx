import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatPrice, ServiceTiles } from "./service-tiles";

const SERVICE = {
  id: "a",
  name: "Gel manicure",
  priceMinor: 6500,
  currency: "XCD",
  durationMinutes: 45,
};

describe("ServiceTiles", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<ServiceTiles services={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the price pill, name and minutes of each service, at most two", () => {
    render(
      <ServiceTiles
        services={[
          SERVICE,
          { ...SERVICE, id: "b", name: "Pedicure", priceMinor: 8050 },
          { ...SERVICE, id: "c", name: "Third" },
        ]}
      />
    );
    expect(screen.getByText("EC$65")).toBeTruthy();
    expect(screen.getByText("EC$80.50")).toBeTruthy();
    expect(screen.getByText("Gel manicure")).toBeTruthy();
    expect(screen.getByText("Pedicure")).toBeTruthy();
    expect(screen.queryByText("Third")).toBeNull();
    expect(screen.getAllByText("45 min")).toHaveLength(2);
  });
});

describe("formatPrice", () => {
  it("prefixes EC$ for XCD and the code for others", () => {
    expect(formatPrice(1200, "XCD")).toBe("EC$12");
    expect(formatPrice(1250, "USD")).toBe("USD 12.50");
  });
});
