import { expect, it } from "vitest";
import robots from "@/app/robots";
import { env } from "@/lib/env";

it("lets every crawler index every page and names the sitemap", () => {
  const rules = robots();
  expect(rules.rules).toEqual({ userAgent: "*", allow: "/" });
  expect(rules.sitemap).toBe(
    new URL("/sitemap.xml", env.NEXT_PUBLIC_SITE_URL).toString()
  );
});
