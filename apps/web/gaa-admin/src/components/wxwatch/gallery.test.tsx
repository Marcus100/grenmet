import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_WXWATCH_OBJECT_STORAGE: "false" },
}));

import type { ImagesBySynoptic } from "@/db/wxwatch/queries";
import type { WeatherImage } from "@/db/wxwatch/schema";
import { Gallery } from "./gallery";

afterEach(cleanup);

const FRAME_BUTTON = /GOES19 IR/;

const EMPTY_SLOTS = {
  "00": null,
  "03": null,
  "06": null,
  "09": null,
  "12": null,
  "15": null,
  "18": null,
  "21": null,
};

/** Only the columns the gallery reads; the row has 20-odd more. */
function weatherImage(overrides: Partial<WeatherImage>): WeatherImage {
  return { ...overrides } as WeatherImage;
}

const image = weatherImage({
  fetchedAt: new Date("2026-09-09T06:05:00Z"),
  fileFormat: "png",
  height: 600,
  id: 1,
  isAnimated: false,
  name: "GOES19 IR",
  observationTime: new Date("2026-09-09T06:00:00Z"),
  spiderName: "goes19_ir",
  storagePath: "goes19/ir.png",
  width: 800,
});

const groups: ImagesBySynoptic = [
  { name: "GOES19", synopticImages: { ...EMPTY_SLOTS, "06": image } },
];

describe("wxwatch gallery", () => {
  it("prompts for another date when nothing was collected", () => {
    render(<Gallery imagesBySynoptic={[]} />);
    expect(screen.getByText("No images for this date")).toBeInTheDocument();
  });

  it("marks empty synoptic slots and opens a frame in the lightbox", () => {
    render(<Gallery imagesBySynoptic={groups} />);

    // Seven of the eight slots are unfilled, and each names its hour.
    expect(screen.getAllByText("No image")).toHaveLength(7);

    fireEvent.click(screen.getByRole("button", { name: FRAME_BUTTON }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("GOES19 IR");
    expect(dialog).toHaveTextContent("goes19 ir");
    expect(dialog).toHaveTextContent("800 × 600");
    expect(dialog).toHaveTextContent("PNG");
    expect(dialog).toHaveTextContent("Still image");
  });
});
