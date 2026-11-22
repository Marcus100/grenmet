import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublishedProducts } from "@/lib/products";
import { PublishedProducts } from "./published-products";

vi.mock("@/lib/products", () => ({
  fetchPublishedProducts: vi.fn(),
}));

const NOTICE = "No marine forecast or marine bulletin has been published yet.";

describe("<PublishedProducts> with no products", () => {
  beforeEach(() => {
    vi.mocked(fetchPublishedProducts).mockResolvedValue({
      status: "ok",
      products: [],
    });
  });

  it("shows the one empty message once when a page lists several categories", async () => {
    render(
      await PublishedProducts({
        emptyNotice: NOTICE,
        kinds: ["marine-forecast", "marine"],
      })
    );
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
    expect(
      screen.queryByText(
        "No current published product is available in this category."
      )
    ).toBeNull();
  });

  it("keeps a line under each category when no empty message is given", async () => {
    render(await PublishedProducts({ kinds: ["marine-forecast", "marine"] }));
    expect(
      screen.getAllByText(
        "No current published product is available in this category."
      )
    ).toHaveLength(2);
  });
});
