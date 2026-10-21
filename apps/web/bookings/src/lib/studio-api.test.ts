import { inspect } from "node:util";
import { ResponseError } from "@barrelsgd/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError } from "@/test/studio";
import { studioFailure } from "./studio-errors";

vi.mock("@/env", () => ({
  env: {
    AUTH_API_URL: "http://localhost:8000",
    AUTH_API_V1_STR: "/api/v1",
    AUTH_APP_URL: "http://localhost:3000",
    BOOKINGS_SESSION_COOKIE_NAME: "bookings_session",
  },
}));

import {
  findOrganisation,
  getAgenda,
  getBooking,
  listMyOrganisations,
} from "./studio-api";

const ORG = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";

interface Seen {
  auth: string | null;
  org: string | null;
  url: string;
}

function stubFetch(status: number, body: unknown) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: Request | string | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      seen.push({
        auth: request.headers.get("authorization"),
        org: request.headers.get("x-barrels-organisation"),
        url: request.url,
      });
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        })
      );
    })
  );
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("studio API reads", () => {
  it("lists organisations with the bearer token and no organisation header", async () => {
    const seen = stubFetch(200, [
      { id: ORG, name: "Sea Salt Spa", slug: "sea-salt-spa", role: "owner" },
    ]);
    const result = await listMyOrganisations("tok-list");
    expect(result).toHaveLength(1);
    expect(seen[0]?.auth).toBe("Bearer tok-list");
    expect(seen[0]?.org).toBeNull();
    expect(seen[0]?.url).toContain("/api/v1/bookings/me/organisations");
  });

  it("finds an organisation only from the person's own list", async () => {
    stubFetch(200, [
      { id: ORG, name: "Sea Salt Spa", slug: "sea-salt-spa", role: "member" },
    ]);
    expect((await findOrganisation("tok-find", "sea-salt-spa"))?.id).toBe(ORG);
    expect(await findOrganisation("tok-find", "someone-else")).toBeNull();
  });

  it("sends the bearer token, organisation header and range on the agenda", async () => {
    const seen = stubFetch(200, {
      timezone: "America/Grenada",
      from_date: "2026-10-21",
      to_date: "2026-10-27",
      total: 0,
      limit: 500,
      offset: 0,
      days: [],
    });
    await getAgenda("tok", ORG, {
      fromDate: "2026-10-21",
      toDate: "2026-10-27",
      providerId: BOOKING,
    });
    expect(seen[0]?.auth).toBe("Bearer tok");
    expect(seen[0]?.org).toBe(ORG);
    const url = new URL(seen[0]?.url ?? "");
    expect(url.pathname).toBe("/api/v1/bookings/org/agenda");
    expect(url.searchParams.get("from_date")).toBe("2026-10-21");
    expect(url.searchParams.get("to_date")).toBe("2026-10-27");
    expect(url.searchParams.get("provider_id")).toBe(BOOKING);
  });

  it("returns null for an unknown booking", async () => {
    const seen = stubFetch(404, { detail: "Not found" });
    expect(await getBooking("tok", ORG, BOOKING)).toBeNull();
    expect(seen[0]?.org).toBe(ORG);
  });

  it("lets a server fault reach the caller", async () => {
    stubFetch(500, { detail: "boom" });
    await expect(getBooking("tok", ORG, BOOKING)).rejects.toBeInstanceOf(
      ResponseError
    );
  });
});

describe("studioFailure", () => {
  it.each([
    [401, "signed_out"],
    [403, "forbidden"],
    [404, "not_found"],
    [422, "invalid"],
    [500, "unavailable"],
  ] as const)("maps %s to %s with a next step", (status, kind) => {
    const failure = studioFailure(apiError(status));
    expect(failure.kind).toBe(kind);
    expect(failure.nextStep.length).toBeGreaterThan(0);
  });

  it("rethrows anything that is not an API response", () => {
    expect(() => studioFailure(new TypeError("network"))).toThrow(TypeError);
  });
});

describe("studio errors", () => {
  it("never carry the bearer token when inspected", async () => {
    stubFetch(500, { detail: "boom" });
    const error = await listMyOrganisations("bearer-token-xyz-secret").then(
      () => null,
      (caught: unknown) => caught
    );
    vi.unstubAllGlobals();
    expect(ResponseError.is(error)).toBe(true);
    expect(inspect(error, { depth: 6 })).not.toContain("bearer-token-xyz");
  });
});
