import { describe, expect, it } from "vitest";
import {
  PREVIEW_TTL_MS,
  previewHref,
  readPreviewToken,
  signPreviewToken,
} from "./preview-link";

const SECRET = "cms-test-only-secret-with-at-least-32-characters";
const OTHER_SECRET = "a-different-test-secret-of-at-least-32-chars";
const NOW = new Date("2026-10-29T12:00:00.000Z");

const sign = (
  overrides: Partial<Parameters<typeof signPreviewToken>[0]> = {}
) =>
  signPreviewToken({
    collection: "stories",
    id: 42,
    now: NOW,
    secret: SECRET,
    ...overrides,
  });

describe("preview tokens", () => {
  it("reads back the one document it names, while it is fresh", () => {
    expect(readPreviewToken(sign(), { now: NOW, secret: SECRET })).toEqual({
      collection: "stories",
      id: "42",
    });
  });
  it("expires after the preview window", () => {
    const token = sign();
    const justBefore = new Date(NOW.getTime() + PREVIEW_TTL_MS - 1);
    const after = new Date(NOW.getTime() + PREVIEW_TTL_MS);
    expect(
      readPreviewToken(token, { now: justBefore, secret: SECRET })
    ).not.toBeNull();
    expect(readPreviewToken(token, { now: after, secret: SECRET })).toBeNull();
  });
  it("refuses a token signed with another secret", () => {
    expect(
      readPreviewToken(sign({ secret: OTHER_SECRET }), {
        now: NOW,
        secret: SECRET,
      })
    ).toBeNull();
  });
  it("refuses a token whose document has been changed", () => {
    const [body, signature] = sign().split(".");
    const forged = Buffer.from(
      JSON.stringify({ c: "stories", i: "999", e: NOW.getTime() + 1000 })
    ).toString("base64url");
    expect(body).not.toBe(forged);
    expect(
      readPreviewToken(`${forged}.${signature}`, { now: NOW, secret: SECRET })
    ).toBeNull();
  });
  it("refuses a correctly signed token for a collection outside the preview list", () => {
    // The signer does not check the name; the reader must.
    const token = signPreviewToken({
      collection: "users" as never,
      id: 1,
      now: NOW,
      secret: SECRET,
    });
    expect(readPreviewToken(token, { now: NOW, secret: SECRET })).toBeNull();
  });
  it("refuses malformed input", () => {
    for (const token of ["", "nodot", "a.b.c", ".", "x."]) {
      expect(readPreviewToken(token, { now: NOW, secret: SECRET })).toBeNull();
    }
  });
  it("never puts the secret in the token", () => {
    expect(sign()).not.toContain(SECRET);
  });
});

describe("the preview address", () => {
  it("is built only when the weather site's address is configured", () => {
    expect(
      previewHref({
        collection: "live-posts",
        id: 3,
        now: NOW,
        secret: SECRET,
        siteUrl: undefined,
      })
    ).toBeNull();
    const href = previewHref({
      collection: "live-posts",
      id: 3,
      now: NOW,
      secret: SECRET,
      siteUrl: "https://weather.barrels.gd/preview",
    });
    const url = new URL(href ?? "");
    expect(url.origin + url.pathname).toBe(
      "https://weather.barrels.gd/preview"
    );
    const token = url.searchParams.get("token") ?? "";
    expect(readPreviewToken(token, { now: NOW, secret: SECRET })).toEqual({
      collection: "live-posts",
      id: "3",
    });
  });
});
