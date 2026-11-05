import { describe, expect, it } from "vitest";
import { SITE_DESCRIPTION, SITE_METADATA } from "@/lib/site-metadata";
import { SITE_NAME } from "@/lib/site-name";

describe("SITE_METADATA", () => {
  it("names each page with the site name template", () => {
    expect(SITE_METADATA.title).toEqual({
      default: SITE_NAME,
      template: `%s | ${SITE_NAME}`,
    });
  });

  it("points each page's canonical address at its own path", () => {
    // "./" is resolved per page against metadataBase, so no page is canonical to the home page.
    expect(SITE_METADATA.alternates).toEqual({ canonical: "./" });
  });

  it("gives shared links the site's Open Graph name, locale and description", () => {
    expect(SITE_METADATA.openGraph).toEqual({
      type: "website",
      locale: "en_GB",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    });
  });
});
