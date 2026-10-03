import type { PublicPublishedProduct } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  readSourceBulletinLink,
  sourceBulletinParameters,
} from "@/lib/cap-bulletin-link";

const bulletin = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "marine",
  revision: 3,
  publishedAt: "2026-09-24T12:00:00Z",
  values: { issuedAt: "2026-09-24T05:00" },
} as PublicPublishedProduct;

describe("source bulletin link", () => {
  it("records an exact published revision in CAP parameters", () => {
    expect(readSourceBulletinLink(sourceBulletinParameters(bulletin))).toEqual({
      id: bulletin.id,
      kind: "marine",
      revision: 3,
    });
  });

  it("rejects incomplete or repeated links", () => {
    const parameters = sourceBulletinParameters(bulletin);
    expect(readSourceBulletinLink(parameters.slice(0, 2))).toBeNull();
    expect(readSourceBulletinLink([...parameters, parameters[0]])).toBeNull();
  });

  it("does not label a forecast as a source bulletin", () => {
    expect(() =>
      sourceBulletinParameters({ ...bulletin, kind: "morning" })
    ).toThrow("Only a hazard bulletin");
  });
});
