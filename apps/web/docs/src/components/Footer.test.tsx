import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "./Footer";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@barrelsgd/ui/components/posthog-provider", () => ({
  CookieSettingsButton: () => null,
}));

describe("docs Footer", () => {
  it("links the Barrels support mailbox in the small print", () => {
    const html = renderToStaticMarkup(<Footer />);
    expect(html).toContain('href="mailto:support@barrels.gd"');
    expect(html).toContain(">Contact support</a>");
  });
});
