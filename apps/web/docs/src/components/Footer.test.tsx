import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "./Footer";

const HELP_TAP_BOX = /min-h-11[^>]*href="\/errors"/u;
const SUPPORT_TAP_BOX = /min-h-11[^>]*href="mailto:support@barrels\.gd"/u;

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

  it("gives small-print links a 44 px minimum tap box", () => {
    const html = renderToStaticMarkup(<Footer />);
    expect(html).toMatch(HELP_TAP_BOX);
    expect(html).toMatch(SUPPORT_TAP_BOX);
  });
});
