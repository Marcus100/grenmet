import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  GMS_SITE_URL: undefined as string | undefined,
}));
vi.mock("../env", () => ({ getEnv: () => env }));

import GlobalNotFound from "./global-not-found";

describe("global 404", () => {
  beforeEach(() => {
    env.GMS_SITE_URL = undefined;
  });

  it("links to the weather site when this deployment knows its address", () => {
    env.GMS_SITE_URL = "https://weather.example.test";
    const html = renderToStaticMarkup(<GlobalNotFound />);
    expect(html).toContain('href="https://weather.example.test"');
    expect(html).toContain(">weather site</a>");
    expect(html).toContain("Page not found");
  });

  it("still explains itself without the link when the address is not set", () => {
    const html = renderToStaticMarkup(<GlobalNotFound />);
    expect(html).not.toContain("weather site</a>");
    expect(html).toContain("GMS content is on the weather site.");
    expect(html).toContain("Page not found");
  });
});
