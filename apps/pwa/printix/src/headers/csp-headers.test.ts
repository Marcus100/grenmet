import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  headersForApi,
  httpsOriginOf,
  PRODUCTION_API_ORIGIN,
} from "@/headers/csp-headers";

const template = readFileSync(
  path.resolve(import.meta.dirname, "../../public/_headers"),
  "utf8"
);

describe("headersForApi", () => {
  it("keeps the production file naming only the production API", () => {
    expect(template).toContain(`connect-src 'self' ${PRODUCTION_API_ORIGIN};`);
  });

  it("leaves the file untouched for the production origin or no origin", () => {
    expect(headersForApi(template, PRODUCTION_API_ORIGIN)).toBe(template);
    expect(headersForApi(template, undefined)).toBe(template);
    expect(headersForApi(template, "")).toBe(template);
  });

  it("swaps only the API origin for a staging build", () => {
    const out = headersForApi(template, "https://api.staging.barrels.gd/");
    expect(out).toContain("connect-src 'self' https://api.staging.barrels.gd;");
    const csp = out
      .split("\n")
      .filter((line) => line.includes("Content-Security-Policy"));
    expect(csp.join("")).not.toContain(PRODUCTION_API_ORIGIN);
    expect(out.replace("api.staging.barrels.gd", "api.barrels.gd")).toBe(
      template
    );
  });

  it("never writes plain http or a bad value into the policy", () => {
    expect(headersForApi(template, "http://localhost:8000")).toBe(template);
    expect(headersForApi(template, "not a url")).toBe(template);
    expect(httpsOriginOf("http://api.example.test")).toBeNull();
  });

  it("fails loudly when the template has no connect-src origin", () => {
    expect(() =>
      headersForApi("/*\n  X-Frame-Options: DENY\n", "https://a.test")
    ).toThrow("connect-src");
  });
});
