import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LinkedProduct } from "@/components/linked-product";
import { fetchPublishedProduct } from "@/lib/products";

vi.mock("@/lib/products", () => ({ fetchPublishedProduct: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const VALID_UNTIL = /Valid until 2026-10-01 07:00/;

const ID = "0b3c6f1e-1111-4a2b-9c3d-222233334444";
const product = (current: boolean) =>
  ({
    status: "ok",
    product: {
      id: ID,
      revision: 1,
      publishedAt: "2026-09-30T16:00:00Z",
      kind: "midday",
      values: {
        issuedAt: "2026-09-30T12:00",
        validTo: "2026-10-01T07:00",
        summary: "Showers ease by mid-afternoon.",
      },
      current,
    },
  }) as const;

it("shows the product's own words, live from FastAPI, and links to it", async () => {
  vi.mocked(fetchPublishedProduct).mockResolvedValue(product(true));
  render(await LinkedProduct({ productId: ID }));
  expect(
    screen.getByText("Showers ease by mid-afternoon.")
  ).toBeInTheDocument();
  expect(screen.getByText("In force")).toBeInTheDocument();
  expect(screen.getByText(VALID_UNTIL)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Read the product" })
  ).toHaveAttribute("href", `/weather/issued/${ID}`);
});

it("marks an expired product as no longer in force", async () => {
  vi.mocked(fetchPublishedProduct).mockResolvedValue(product(false));
  render(await LinkedProduct({ productId: ID }));
  expect(screen.getByText("No longer in force")).toBeInTheDocument();
});

it.each([
  ["not-found", "has been withdrawn"],
  ["unavailable", "can't be loaded right now"],
] as const)("says so when the product is %s", async (status, text) => {
  vi.mocked(fetchPublishedProduct).mockResolvedValue({ status });
  render(await LinkedProduct({ productId: ID }));
  expect(screen.getByRole("status")).toHaveTextContent(text);
  expect(screen.queryByText("In force")).not.toBeInTheDocument();
});
