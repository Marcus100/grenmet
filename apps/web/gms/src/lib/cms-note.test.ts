import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { CMS_API_URL: "http://cms.example.test" },
}));

import { fetchHomeContent } from "@/lib/cms";

afterEach(() => {
  vi.unstubAllGlobals();
});

const note = {
  text: "Showers ease by mid-afternoon.",
  postedAt: "2026-10-29T14:00:00Z",
  expiresAt: "2026-10-29T16:00:00Z",
  alertUrl: null,
};

const homeWith = (weatherNow: unknown) =>
  vi.fn().mockResolvedValue(
    Response.json({
      deskUpdates: { status: "ok", items: [] },
      stories: { status: "ok", items: [] },
      questions: { status: "ok", items: [] },
      weatherNow,
      discover: { status: "unavailable" },
      settings: { discoverCards: [], hiddenSections: [] },
    })
  );

describe("the duty forecaster's note from the CMS", () => {
  it("reads a note with its related links", async () => {
    vi.stubGlobal(
      "fetch",
      homeWith({
        status: "ok",
        items: {
          note: {
            ...note,
            relatedLinks: [
              {
                title: "Evening Forecast",
                category: "forecast",
                url: "https://weather.barrels.gd/weather/issued/0b3c6f1e-1111-4a2b-9c3d-222233334444",
                type: "product",
                ref: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
                isMain: true,
              },
            ],
          },
        },
      })
    );
    const home = await fetchHomeContent();
    expect(home.weatherNow?.note?.relatedLinks).toHaveLength(1);
    expect(home.weatherNow?.note?.relatedLinks?.[0]?.isMain).toBe(true);
  });

  it("still reads an older CMS note without related links", async () => {
    vi.stubGlobal("fetch", homeWith({ status: "ok", items: { note } }));
    const home = await fetchHomeContent();
    expect(home.weatherNow?.note?.text).toBe("Showers ease by mid-afternoon.");
    expect(home.weatherNow?.note?.relatedLinks).toBeUndefined();
    // The rest of the homepage still loads with that older note.
    expect(home.deskUpdates.status).toBe("ok");
  });

  it("reads no note when the CMS has none posted", async () => {
    vi.stubGlobal("fetch", homeWith({ status: "ok", items: { note: null } }));
    const home = await fetchHomeContent();
    expect(home.weatherNow).toEqual({ note: null });
  });
});
