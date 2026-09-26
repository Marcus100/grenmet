import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getJanitorialAccess: vi.fn(),
  getJanitorialCatalogue: vi.fn(),
}));
vi.mock("@/db/janitorial/queries", () => queries);
vi.mock("@/env", () => ({
  env: { JANITOR_APP_URL: "https://janitor.example.com" },
}));

import { catalogue, viewerAccess } from "@/lib/janitorial/test-fixtures";
import JanitorLabelsPage from "./page";

async function renderPage(params: Record<string, string> = {}) {
  queries.getJanitorialAccess.mockResolvedValue(viewerAccess);
  queries.getJanitorialCatalogue.mockResolvedValue(catalogue);
  render(await JanitorLabelsPage({ searchParams: Promise.resolve(params) }));
}

describe("JanitorLabelsPage", () => {
  it("renders a QR label for every active area", async () => {
    await renderPage();

    expect(
      screen.getByText("3 labels on 1 Letter pages.", { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("img", { name: "QR code for GND-A0010" }).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("GND-A0012")).toBeNull();
    expect(
      screen.getByText("Each label opens the area in the janitor app.")
    ).toBeInTheDocument();
  });

  it("limits labels to one building", async () => {
    await renderPage({ building: "3" });

    expect(
      screen.getByText("1 labels on 1 Letter pages.", { exact: false })
    ).toBeInTheDocument();
  });
});
