import { describe, expect, it, vi } from "vitest";

// Only the metadata objects are read; the page and layout modules are not rendered.
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "", className: "" }),
  Noto_Sans: () => ({ variable: "", className: "" }),
}));
vi.mock("next/font/local", () => ({
  default: () => ({ variable: "", className: "" }),
}));
// The layout's runtime imports read env and render chrome; stub them so only
// the metadata object is loaded.
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://signal.example.test" },
}));
vi.mock("@/lib/auth-config", () => ({
  APP_LABEL: "Signal",
  signInEnabled: () => false,
}));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@barrelsgd/ui/components/posthog-provider", () => ({
  PostHogProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@barrelsgd/ui/components/public-env-script", () => ({
  PublicEnvScript: () => null,
}));
vi.mock("@/lib/content", () => ({
  getCurrentArticles: () => [],
  getLatestBrief: () => undefined,
}));

const OLD_TAGLINE = /know what going on/iu;

describe("Signal titles and share metadata", () => {
  it("uses the corrected tagline in the site title and the share fallback", async () => {
    const { metadata } = await import("./layout");
    const title = metadata.title;
    expect(title).toEqual({
      default: "Grenada Signal — Know what is going on.",
      template: "%s | Grenada Signal",
    });
    expect(JSON.stringify(metadata)).not.toMatch(OLD_TAGLINE);
    expect(metadata.openGraph).toMatchObject({ siteName: "Grenada Signal" });
    expect(metadata.twitter).toEqual({ card: "summary" });
  });

  it("uses the corrected tagline in the front page title", async () => {
    const { metadata } = await import("./page");
    expect(metadata.title).toBe("Grenada Signal: know what is going on");
    expect(JSON.stringify(metadata)).not.toMatch(OLD_TAGLINE);
  });
});
