import { describe, expect, it } from "vitest";
import { renderTemplate } from "./render";

const base = {
  alerts: [],
  dateLabel: "28 Oct 2026",
  forecastLines: ["2026-10-28: high 31 °C, low 24 °C"],
  headline: "Today's update",
  hurricaneMode: false,
  listName: "GMS climate newsletter",
  posts: [],
  projectName: "Barrels Grenada",
  unsubscribeLink:
    "https://api.example.test/api/v1/subscriptions/unsubscribe?token=t",
};

describe("newsletter template", () => {
  it("renders the forecast and the one-click unsubscribe link", async () => {
    const { html, subject } = await renderTemplate("newsletter", base);
    expect(html).toContain("2026-10-28: high 31 °C, low 24 °C");
    expect(html).toContain(base.unsubscribeLink);
    expect(html).toContain("GMS climate newsletter");
    expect(html).not.toContain("Weather alerts in effect");
    expect(subject).toBe("GMS climate newsletter: Today's update");
  });

  it("links to the preferences page when one is given", async () => {
    const link =
      "https://gms.example.test/climate/newsletter/preferences?token=t";
    const { html } = await renderTemplate("newsletter", {
      ...base,
      preferencesLink: link,
    });
    expect(html).toContain("manage your subscriptions");
    expect(html).toContain(link.replace(/&/g, "&amp;"));
  });

  it("omits the preferences sentence for mail that has no link", async () => {
    const { html } = await renderTemplate("newsletter", base);
    expect(html).not.toContain("manage your subscriptions");
  });

  it("puts the alerts block before the forecast when there are alerts", async () => {
    const { html } = await renderTemplate("newsletter", {
      ...base,
      alerts: [
        {
          areas: "Grenada",
          event: "Heavy rain",
          expires: "28 Oct 2026, 18:00",
          headline: "Yellow heavy rain warning",
          link: "https://weather.example.test/alerts/x",
        },
      ],
    });
    const alertsAt = html.indexOf("Weather alerts in effect");
    const forecastAt = html.indexOf("2026-10-28: high 31");
    expect(alertsAt).toBeGreaterThan(-1);
    expect(alertsAt).toBeLessThan(forecastAt);
    expect(html).toContain("Yellow heavy rain warning");
    expect(html).toContain("https://weather.example.test/alerts/x");
  });

  it("uses the digest subject the caller supplies", async () => {
    const { subject } = await renderTemplate("newsletter", {
      ...base,
      subject: "Weather alert: Flood - 28 Oct 2026",
    });
    expect(subject).toBe("Weather alert: Flood - 28 Oct 2026");
  });

  it("shows the test notice only when there is one", async () => {
    const plain = await renderTemplate("newsletter", base);
    expect(plain.html).not.toContain("This is a test copy");
    const test = await renderTemplate("newsletter", {
      ...base,
      testNotice:
        "This is a test copy for staff. It was not sent to subscribers.",
    });
    expect(test.html).toContain("This is a test copy for staff");
  });

  it("escapes post text", async () => {
    const { html } = await renderTemplate("newsletter", {
      ...base,
      posts: [
        {
          summary: "<img src=x onerror=alert(1)>",
          title: "<script>alert(1)</script>",
          url: "https://weather.example.test/stories/a",
        },
      ],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
  });

  it("refuses to render without an unsubscribe link", async () => {
    await expect(
      renderTemplate("newsletter", { ...base, unsubscribeLink: "" })
    ).rejects.toThrow("newsletter requires");
  });
});
