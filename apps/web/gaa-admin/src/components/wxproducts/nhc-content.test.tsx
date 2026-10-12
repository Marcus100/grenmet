import type { NhcContent } from "@barrelsgd/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NhcContentView, RecordTable } from "./nhc-content";

vi.mock("@/components/cap/cap-map", () => ({
  CapMap: () => <div>Vector map</div>,
}));
vi.mock("react-map-gl/maplibre", () => ({
  Layer: () => null,
  Source: () => null,
}));
afterEach(cleanup);
const edition: NhcContent["edition"] = {
  id: "cb95d558-8202-4c97-a29e-2194b14b7d2b",
  product_key: "nhc:storms",
  title: "Atlantic storms",
  family: "active_cyclones",
  kind: "storms",
  sha256: "a".repeat(64),
  first_received_at: "2026-10-12T12:00:00Z",
  status: "success",
  active: true,
  assets: [],
};
it("displays an explicit no-active-cyclone result from a decoded storm edition", () => {
  render(<NhcContentView content={{ edition, decoded: { storms: [] } }} />);
  expect(
    screen.getByText(
      "No active Atlantic cyclones are reported in this source edition."
    )
  ).toBeInTheDocument();
});
it("renders reconnaissance values safely and retains qualified text and ranges", () => {
  render(
    <RecordTable
      rows={[
        {
          pressure: "1008 mb",
          formation: "near zero percent",
          movement: { minimum: 10, maximum: 15, units: "kt" },
          source: "<script>alert(1)</script>",
        },
      ]}
    />
  );
  expect(screen.getByText("near zero percent")).toBeInTheDocument();
  expect(
    screen.getByText('{"minimum":10,"maximum":15,"units":"kt"}')
  ).toBeInTheDocument();
  expect(document.querySelector("script")).toBeNull();
});
it("uses the authenticated asset route for original downloads", () => {
  render(
    <NhcContentView
      content={{
        edition: {
          ...edition,
          assets: [
            {
              asset_id: "original",
              role: "original",
              media_type: "text/plain",
              byte_size: 100,
            },
          ],
        },
        text: "Original text",
        decoded: {},
      }}
    />
  );
  expect(
    screen.getByRole("link", { name: "Download original (1 KB)" })
  ).toHaveAttribute("href", "/_backend/wxwatch/assets/original");
});
