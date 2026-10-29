import { describe, expect, it } from "vitest";
import { DeskUpdates } from "../collections/desk-updates";
import { optionLabel, toLivePost } from "./public-feed";

describe("optionLabel", () => {
  it("reads labels from the schema", () => {
    expect(optionLabel(DeskUpdates, "kind", "service-notice")).toBe(
      "Service notice"
    );
    expect(optionLabel(DeskUpdates, "kind", "tropical-outlook")).toBe(
      "Tropical weather outlook"
    );
    // The old values are gone from the list; the migration moved them.
    expect(optionLabel(DeskUpdates, "kind", "public-notice")).toBeNull();
    expect(optionLabel(DeskUpdates, "kind", "unknown")).toBeNull();
    expect(optionLabel(DeskUpdates, "kind", undefined)).toBeNull();
  });
});

describe("live post media", () => {
  const post = (kind: string) =>
    toLivePost({
      id: 1,
      kind,
      title: "Post",
      mediaUrl: "https://youtu.be/abc123",
      updatedAt: "2026-10-28T00:00:00.000Z",
    } as never);
  it("carries a media link only for video and audio", () => {
    expect(post("video").mediaUrl).toBe("https://youtu.be/abc123");
    expect(post("audio").mediaUrl).toBe("https://youtu.be/abc123");
    for (const kind of ["update", "satellite", "radar", "wind", "seas"])
      expect(post(kind).mediaUrl).toBeNull();
  });
});
