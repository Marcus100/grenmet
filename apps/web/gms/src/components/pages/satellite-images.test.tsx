import type { PublicSatelliteImage } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SatelliteImages } from "@/components/pages/satellite-images";

const NOW = new Date("2026-10-18T16:00:00Z");
const image = (id: number, observed: string): PublicSatelliteImage => ({
  id,
  product: "ir.png",
  title: "ir",
  observed_at: observed,
  image_url: `/api/v1/wxwatch/public/images/${id}`,
  media_type: "image/png",
  width: 800,
  height: 600,
  source: "NOAA/NESDIS GOES-19",
  attribution: "Public domain",
});

describe("<SatelliteImages>", () => {
  it("shows the honest notice when nothing has been ingested", () => {
    render(<SatelliteImages images={[]} status="ok" />);
    expect(screen.getByText("Not yet available from GMS")).toBeTruthy();
  });

  it("says the feed is unavailable rather than showing nothing", () => {
    render(<SatelliteImages images={[]} status="unavailable" />);
    expect(
      screen.getByText((content) =>
        content.includes("cannot be retrieved right now")
      )
    ).toBeTruthy();
  });

  it("serves images through the site and flags a stale one", () => {
    render(
      <SatelliteImages
        images={[
          image(7, "2026-10-18T15:50:00Z"),
          image(8, "2026-10-18T14:00:00Z"),
        ]}
        now={NOW}
        status="ok"
      />
    );
    const sources = screen
      .getAllByRole("img")
      .map((img) => img.getAttribute("src"));
    expect(sources).toEqual(["/api/satellite/7", "/api/satellite/8"]);
    expect(
      screen.getAllByText((content) => content.includes("Not a GMS product"))
    ).toHaveLength(2);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
