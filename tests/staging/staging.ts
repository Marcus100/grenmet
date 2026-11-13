import { test as base, type Page } from "@playwright/test";

/**
 * Shared fixtures for the staging journeys. playwright.config.ts reads the
 * environment once and passes it in as options, so specs never read it and no
 * helper prints a credential. Hosts are always on the staging domain.
 */
export interface StagingOptions {
  /** The signed-in journeys' test account; undefined skips them. */
  account: { email: string; password: string } | undefined;
  /** "staging.barrels.gd" unless a rehearsal overrides it. */
  stagingDomain: string;
}

export const test = base.extend<StagingOptions>({
  account: [undefined, { option: true }],
  stagingDomain: ["staging.barrels.gd", { option: true }],
});

export { expect } from "@playwright/test";

export function host(domain: string, app: string, path = "/"): string {
  return `https://${app}.${domain}${path}`;
}

/**
 * Collects uncaught page errors while a journey runs; a journey fails on any.
 * Console warnings are not errors and are ignored.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 200)));
  return errors;
}

/** Images that finished loading but have no pixels (a broken src). */
export function brokenImages(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.images]
      .filter(
        (image) =>
          image.complete && image.naturalWidth === 0 && image.loading !== "lazy"
      )
      .map((image) => image.currentSrc.slice(0, 120))
  );
}
