import { describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({
  getEnv: () => ({ AUTH_API_URL: "http://api.test" }),
}));
vi.mock("../lib/link-titles", () => ({
  labelFor: vi.fn((link: { type: string }) =>
    Promise.resolve({ title: `Name of ${link.type}`, category: "bulletin" })
  ),
}));

import { DeskUpdates } from "../collections/desk-updates";
import { ReportNotes } from "../collections/report-notes";
import { validateRelatedLinks } from "./common";

const PRODUCT = "0b3c6f1e-1111-4a2b-9c3d-222233334444";
const run = (
  relatedLinks: unknown[],
  options?: { requireMainProduct?: boolean }
) =>
  validateRelatedLinks(options)({
    data: { relatedLinks },
    originalDoc: undefined,
  } as never) as Promise<{ relatedLinks: Record<string, unknown>[] }>;

describe("related links hook", () => {
  it("fills in only what the editor left blank, and keeps row ids", async () => {
    const { relatedLinks } = await run([
      { id: "a", url: `/weather/issued/${PRODUCT}`, isMain: true },
      {
        id: "b",
        url: "/weather/radar",
        title: "Live radar",
        category: "forecast",
      },
    ]);
    expect(relatedLinks[0]).toMatchObject({
      id: "a",
      title: "Name of product",
      category: "bulletin",
      isMain: true,
    });
    expect(relatedLinks[1]).toMatchObject({
      id: "b",
      title: "Live radar",
      category: "forecast",
      isMain: false,
    });
  });

  it("refuses a bad address with a plain message", async () => {
    await expect(run([{ url: "javascript:alert(1)" }])).rejects.toThrow(
      "Paste a full HTTP or HTTPS address"
    );
  });

  it("requires a main issued product for report write-ups only when asked", async () => {
    const outside = [{ url: "https://example.test/", title: "Source" }];
    await expect(run(outside, { requireMainProduct: true })).rejects.toThrow(
      "tick Main link"
    );
    await expect(
      run([{ url: "/weather/radar", isMain: true }], {
        requireMainProduct: true,
      })
    ).rejects.toThrow("tick Main link");
    await expect(
      run([{ url: `/weather/issued/${PRODUCT}`, isMain: true }], {
        requireMainProduct: true,
      })
    ).resolves.toBeDefined();
    await expect(run(outside)).resolves.toBeDefined();
  });
});

describe("post form order", () => {
  const order = (config: { fields: { name?: string }[] }) =>
    config.fields.map((field) => field.name);
  it("puts related links before sharing and search settings", () => {
    for (const config of [DeskUpdates, ReportNotes]) {
      const names = order(config as never);
      expect(names.indexOf("relatedLinks")).toBeGreaterThan(
        names.indexOf("body")
      );
      expect(names.indexOf("relatedLinks")).toBeLessThan(
        names.indexOf("social")
      );
    }
  });
});

describe("social sharing", () => {
  it("has a download panel, a custom image and the captions", () => {
    const social = (
      DeskUpdates.fields as {
        name?: string;
        fields?: { name?: string; type?: string }[];
      }[]
    ).find((field) => field.name === "social");
    const names = social?.fields?.map((field) => field.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "attachments",
        "image",
        "caption",
        "facebookText",
      ])
    );
    expect(social?.fields?.find((f) => f.name === "attachments")?.type).toBe(
      "ui"
    );
    expect(social?.fields?.find((f) => f.name === "image")?.type).toBe(
      "upload"
    );
  });
});
