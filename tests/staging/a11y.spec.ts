import AxeBuilder from "@axe-core/playwright";
import { expect, host, test } from "./staging";

/**
 * Automated WCAG 2.1 A/AA checks (axe-core) on the pages the public and staff
 * reach first. Automation finds roughly a third of WCAG issues; it does not
 * replace a manual keyboard and screen-reader pass.
 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const PAGES = [
  ["weather homepage", "weather", "/"],
  ["weather alerts", "weather", "/alerts"],
  ["issued forecasts", "weather", "/weather/issued"],
  ["sign-in", "auth", "/"],
] as const;

for (const [name, app, path] of PAGES) {
  test(`${name} has no WCAG 2.1 A/AA violations axe can find`, async ({
    page,
    stagingDomain,
  }) => {
    await page.goto(host(stagingDomain, app, path));
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    const summary = results.violations.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}, ${violation.nodes.length} element(s), e.g. ${violation.nodes[0]?.target.join(" ")}`
    );
    expect(summary).toEqual([]);
  });
}
