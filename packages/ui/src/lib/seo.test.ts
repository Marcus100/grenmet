import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  breadcrumbList,
  jsonLdText,
  robotsRules,
  websiteJsonLd,
} from "./seo";

describe("robotsRules", () => {
  it("allows the site, disallows the private prefixes and names the sitemap on the same host", () => {
    const result = robotsRules({
      siteUrl: "https://events.barrels.gd/",
      disallow: ["/me", "/api/"],
    });
    expect(result.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/me", "/api/"],
    });
    expect(result.sitemap).toBe("https://events.barrels.gd/sitemap.xml");
  });

  it("does not share the disallow array with the caller", () => {
    const disallow = ["/auth/"];
    const result = robotsRules({ siteUrl: "https://x.test", disallow });
    disallow.push("/other");
    expect(result.rules.disallow).toEqual(["/auth/"]);
  });
});

describe("absoluteUrl", () => {
  it("joins a path onto the site without doubling slashes", () => {
    expect(absoluteUrl("https://signal.barrels.gd/", "/briefs")).toBe(
      "https://signal.barrels.gd/briefs"
    );
    expect(absoluteUrl("https://signal.barrels.gd", "briefs")).toBe(
      "https://signal.barrels.gd/briefs"
    );
  });

  it("gives the home page a trailing slash", () => {
    expect(absoluteUrl("https://cap.barrels.gd", "/")).toBe(
      "https://cap.barrels.gd/"
    );
  });
});

describe("jsonLdText", () => {
  it("escapes characters that could close the script tag", () => {
    const text = jsonLdText({
      name: "</script><script>alert(1)</script> & co",
    });
    expect(text).not.toContain("<");
    expect(text).not.toContain(">");
    expect(text).not.toContain("&");
    expect(JSON.parse(text)).toEqual({
      name: "</script><script>alert(1)</script> & co",
    });
  });

  it("round-trips line separators as valid JSON", () => {
    const value = { name: "a b c" };
    expect(JSON.parse(jsonLdText(value))).toEqual(value);
  });
});

describe("breadcrumbList", () => {
  it("numbers the trail and gives each item an absolute URL", () => {
    const data = breadcrumbList("https://signal.barrels.gd", [
      { name: "Home", path: "/" },
      { name: "Sport", path: "/sport" },
    ]);
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://signal.barrels.gd/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Sport",
          item: "https://signal.barrels.gd/sport",
        },
      ],
    });
  });
});

describe("websiteJsonLd", () => {
  it("names the site and its home URL", () => {
    expect(
      websiteJsonLd({
        name: "Barrels Events",
        siteUrl: "https://events.barrels.gd",
        description: "What is on",
      })
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Barrels Events",
      url: "https://events.barrels.gd/",
      description: "What is on",
    });
  });
});
