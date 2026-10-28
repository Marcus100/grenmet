import { describe, expect, it } from "vitest";
import { escapeXml, renderFeed } from "@/lib/feed";

describe("escapeXml", () => {
  it("escapes the five XML special characters", () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;"
    );
  });
});

describe("renderFeed", () => {
  const xml = renderFeed("https://commit.barrels.gd", [
    {
      date: "2026-10-27",
      draft: false,
      release: "1.0.0",
      slug: "v1-0-0",
      summary: "Alerts & sign-in",
      title: "First <release>",
    },
  ]);

  it("links each item to its anchor on the home page", () => {
    expect(xml).toContain("<link>https://commit.barrels.gd/#v1-0-0</link>");
  });

  it("prefixes the release and escapes text", () => {
    expect(xml).toContain("<title>1.0.0: First &lt;release&gt;</title>");
    expect(xml).toContain("<description>Alerts &amp; sign-in</description>");
  });

  it("uses an RFC 822 date", () => {
    expect(xml).toContain("<pubDate>Tue, 27 Oct 2026 00:00:00 GMT</pubDate>");
  });
});
