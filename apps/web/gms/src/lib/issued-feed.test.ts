import type { IssuedProducts } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { issuedFeedXml, xmlEscape } from "./issued-feed";

type Issued = IssuedProducts["products"][number];

const SITE = "https://weather.example.test/";
const ID = "11111111-1111-4111-8111-111111111111";

function product(overrides: Partial<Issued> = {}): Issued {
  return {
    id: ID,
    revision: 2,
    publishedAt: "2026-11-11T11:05:00Z",
    kind: "morning",
    values: {
      issuedAt: "2026-11-11T07:00",
      summary: "Partly cloudy with a few showers <later> & breezy.",
    },
    current: true,
    ...overrides,
  };
}

describe("issued products RSS", () => {
  it("links each item to its permanent page and PDF", () => {
    const xml = issuedFeedXml(
      [product()],
      SITE,
      new Date("2026-11-11T12:00:00Z")
    );
    expect(xml).toContain(
      `<link>https://weather.example.test/weather/issued/${ID}</link>`
    );
    expect(xml).toContain(
      `<enclosure url="https://weather.example.test/weather/issued/${ID}/pdf" type="application/pdf" length="0"/>`
    );
    expect(xml).toContain(`<guid isPermaLink="false">${ID}-r2</guid>`);
    expect(xml).toContain("<pubDate>Wed, 11 Nov 2026 11:05:00 GMT</pubDate>");
    expect(xml).toContain(
      "<title>Morning Forecast, 11 Nov 2026, 7:00 a.m.</title>"
    );
    expect(xml).toContain(
      'href="https://weather.example.test/weather/issued/feed.xml" rel="self"'
    );
  });

  it("escapes the summary and keeps it short", () => {
    const xml = issuedFeedXml([product()], SITE);
    expect(xml).toContain(
      "<description>Partly cloudy with a few showers &lt;later&gt; &amp; breezy.</description>"
    );
    const long = issuedFeedXml(
      [product({ values: { summary: "x".repeat(400) } })],
      SITE
    );
    expect(long).toContain(`<description>${"x".repeat(299)}…</description>`);
  });

  it("falls back to the publication time and a generic label", () => {
    const xml = issuedFeedXml(
      [product({ kind: "unknown-kind" as Issued["kind"], values: {} })],
      SITE
    );
    expect(xml).toContain(
      "<title>Weather product, 11 Nov 2026, 7:05 a.m.</title>"
    );
    const item = xml.slice(xml.indexOf("<item>"));
    expect(item).not.toContain("<description>");
  });

  it("is a valid empty channel when nothing is issued", () => {
    const xml = issuedFeedXml([], SITE);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });

  it("escapes every XML special character", () => {
    expect(xmlEscape(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;"
    );
  });
});
