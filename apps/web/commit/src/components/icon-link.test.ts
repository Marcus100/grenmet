import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IconLink } from "@/components/icon-link";

describe("IconLink", () => {
  // WCAG 2.5.5: every link is at least 44 px tall so phone taps land.
  it("renders a link with a 44 px minimum height in both densities", () => {
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(
        IconLink({ children: "RSS", compact, href: "/feed.xml" })
      );
      expect(html).toContain('href="/feed.xml"');
      expect(html).toContain("min-h-11");
    }
  });
});
