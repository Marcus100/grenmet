import { describe, expect, it } from "vitest";
import {
  BodyTooLargeError,
  isSameOrigin,
  MAX_BODY_BYTES,
  readLimitedBody,
} from "./request-guards";

function post(body: string | Uint8Array, headers: Record<string, string> = {}) {
  return new Request("https://cap.barrels.gd/desk/api/x", {
    body: body as BodyInit,
    headers,
    method: "POST",
  });
}

describe("isSameOrigin", () => {
  it("accepts this host's own origin", () => {
    expect(
      isSameOrigin(
        new Headers({
          host: "cap.barrels.gd",
          origin: "https://cap.barrels.gd",
        })
      )
    ).toBe(true);
  });

  it("refuses another barrels.gd host, a missing Origin and a lookalike", () => {
    const host = "cap.barrels.gd";
    expect(
      isSameOrigin(new Headers({ host, origin: "https://events.barrels.gd" }))
    ).toBe(false);
    expect(isSameOrigin(new Headers({ host }))).toBe(false);
    expect(
      isSameOrigin(
        new Headers({ host, origin: "https://cap.barrels.gd.evil.test" })
      )
    ).toBe(false);
  });
});

describe("readLimitedBody", () => {
  it("returns a body within the limit", async () => {
    const body = await readLimitedBody(post("hello"));
    expect(new TextDecoder().decode(body)).toBe("hello");
  });

  it("refuses by Content-Length before reading", async () => {
    const request = post("x", { "content-length": String(MAX_BODY_BYTES + 1) });
    await expect(readLimitedBody(request)).rejects.toBeInstanceOf(
      BodyTooLargeError
    );
  });

  it("refuses while reading when the declared length is missing or wrong", async () => {
    const big = new Uint8Array(2000);
    await expect(
      readLimitedBody(post(big, { "content-length": "10" }), 1000)
    ).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("accepts a body exactly at the limit", async () => {
    const body = await readLimitedBody(post(new Uint8Array(1000)), 1000);
    expect(body.byteLength).toBe(1000);
  });
});
