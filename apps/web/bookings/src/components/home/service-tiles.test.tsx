import type { BookingFeaturedService } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServiceTiles } from "./service-tiles";

const USD_PRICE = /^US\$25$/u;

const SERVICE: BookingFeaturedService = {
  id: "a",
  name: "Gel manicure",
  price_minor: 12_000,
  currency: "XCD",
  duration_min: 45,
};

describe("ServiceTiles", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<ServiceTiles services={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows only the first two of three services, with price, name and minutes", () => {
    render(
      <ServiceTiles
        services={[
          SERVICE,
          { ...SERVICE, id: "b", name: "Pedicure", price_minor: 8050 },
          { ...SERVICE, id: "c", name: "Third" },
        ]}
      />
    );
    expect(screen.getByText("EC$120")).toBeTruthy();
    expect(screen.getByText("EC$80.50")).toBeTruthy();
    expect(screen.getByText("Gel manicure")).toBeTruthy();
    expect(screen.getByText("Pedicure")).toBeTruthy();
    expect(screen.queryByText("Third")).toBeNull();
    expect(screen.getAllByText("45 min")).toHaveLength(2);
  });

  it("fills the width with one service", () => {
    const { container } = render(<ServiceTiles services={[SERVICE]} />);
    expect(container.firstElementChild?.getAttribute("class")).toContain(
      "grid-cols-1"
    );
    expect(container.firstElementChild?.children).toHaveLength(1);
  });

  it("formats other currencies with their code and clamps long names to two lines", () => {
    const { container } = render(
      <ServiceTiles
        services={[{ ...SERVICE, currency: "USD", price_minor: 2500 }]}
      />
    );
    expect(screen.getByText(USD_PRICE)).toBeTruthy();
    expect(container.querySelector(".line-clamp-2")?.textContent).toBe(
      "Gel manicure"
    );
  });

  it("has no interactive elements", () => {
    const { container } = render(
      <ServiceTiles services={[SERVICE, { ...SERVICE, id: "b" }]} />
    );
    expect(container.querySelector("a, button, input, select")).toBeNull();
  });
});
