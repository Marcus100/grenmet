import type { ArchiveEdition } from "@barrelsgd/api-client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ArchiveBrowser } from "./archive-browser";

afterEach(cleanup);
function item(id: string): ArchiveEdition {
  return {
    id,
    title: `Chart ${id}`,
    source: "sfcana",
    product_key: "chart",
    nominal_time: "2026-09-17T12:00:00Z",
    observed_at: null,
    time_basis: "estimated_analysis",
    first_received_at: "2026-09-17T19:00:00Z",
    storage_path: null,
    verification_status: "missing",
    replica_state: "missing",
    sha256: null,
    byte_size: null,
  };
}
it("compares two editions and retains missing-file evidence", () => {
  render(
    <ArchiveBrowser
      archive={{
        items: [item("1"), item("2"), item("3")],
        has_more: true,
        offset: 0,
      }}
      history={null}
      query="source=sfcana"
    />
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Compare Chart 1 1" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Compare Chart 2 2" }));
  const compare = within(
    screen.getByRole("region", { name: "Edition comparison" })
  );
  expect(compare.getByText("Chart 1")).toBeInTheDocument();
  expect(compare.getByText("Chart 2")).toBeInTheDocument();
  expect(
    compare.getAllByText("Image unavailable. Its archive record is retained.")
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole("checkbox", { name: "Compare Chart 3 3" }));
  expect(compare.queryByText("Chart 1")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Next editions" })).toHaveAttribute(
    "href",
    "/wxwatch/archive?source=sfcana&offset=30"
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear comparison" }));
  expect(compare.getByText("Compare editions (0/2)")).toBeInTheDocument();
});
it("distinguishes empty results and unreconstructed retrieval history", () => {
  render(
    <ArchiveBrowser
      archive={{ items: [], has_more: false, offset: 0 }}
      edition="1"
      history={{ items: [], has_more: false, offset: 0 }}
      query=""
    />
  );
  expect(
    screen.getByText("No editions match these filters.")
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "No retrieval history recorded. Historical downloads were not reconstructed."
    )
  ).toBeInTheDocument();
  expect(screen.getByLabelText("From (UTC)")).toBeInTheDocument();
});

it("loads NHC text as plain text and keeps navigation in NHC Products", async () => {
  const bulletin = {
    ...item("nhc-1"),
    source: "nhc",
    has_bulletin: true,
    issued_at: "2026-09-17T12:00:00Z",
    storm_id: "al012026",
    bulletin_code: "TCPAT1",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        edition_id: "nhc-1",
        text: "<script>alert(1)</script> Advisory",
      })
    )
  );
  try {
    const { container } = render(
      <ArchiveBrowser
        archive={{ items: [bulletin], has_more: true, offset: 0 }}
        history={null}
        nhcOnly
        query="source=nhc"
      />
    );
    expect(
      screen.getByText("Issue time: 2026-09-17 12:00:00 UTC")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Image unavailable. Its archive record is retained.")
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("View bulletin"));
    fireEvent.click(screen.getByRole("button", { name: "Load bulletin text" }));
    expect(
      await screen.findByText("<script>alert(1)</script> Advisory")
    ).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("link", { name: "Next editions" })).toHaveAttribute(
      "href",
      "/wxproducts/nhc?source=nhc&offset=30"
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

it("displays NHC assets without legacy paths and opens originals at full size", () => {
  render(
    <ArchiveBrowser
      archive={{
        items: [
          {
            ...item("image-1"),
            source: "nhc",
            image_asset_id: "asset-1",
            replica_state: "verified",
            verification_status: "verified",
            time_basis: "unknown",
            nominal_time: null,
          },
        ],
        has_more: false,
        offset: 0,
      }}
      history={null}
      nhcOnly
      query="source=nhc"
    />
  );
  fireEvent.click(screen.getByText("View image"));
  expect(screen.getByText("Issue time: Unknown")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Chart image-1" })).toHaveAttribute(
    "src",
    expect.stringContaining("/_backend/wxwatch/assets/asset-1")
  );
  expect(
    screen.getByRole("link", { name: "Open full-size image" })
  ).toHaveAttribute("href", "/_backend/wxwatch/assets/asset-1");
  fireEvent.error(screen.getByRole("img", { name: "Chart image-1" }));
  expect(
    screen.getByText("Image unavailable. Its archive record is retained.")
  ).toBeInTheDocument();
});
