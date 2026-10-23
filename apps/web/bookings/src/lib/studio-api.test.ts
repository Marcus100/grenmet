import { inspect } from "node:util";
import { ResponseError } from "@barrelsgd/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError } from "@/test/studio";
import { actionFailure, studioFailure } from "./studio-errors";

vi.mock("@/env", () => ({
  env: {
    AUTH_API_URL: "http://localhost:8000",
    AUTH_API_V1_STR: "/api/v1",
    AUTH_APP_URL: "http://localhost:3000",
    BOOKINGS_SESSION_COOKIE_NAME: "bookings_session",
  },
}));

import {
  cancelBooking,
  confirmBooking,
  declineBooking,
  findOrganisation,
  getAgenda,
  getBooking,
  getBusinessTimezone,
  listMyOrganisations,
  markCompleted,
  markNoShow,
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

  it("reads the business timezone from its profile", async () => {
    const seen = stubFetch(200, { timezone: "Pacific/Auckland" });
    expect(await getBusinessTimezone("tok", ORG)).toBe("Pacific/Auckland");
    expect(seen[0]?.org).toBe(ORG);
    expect(new URL(seen[0]?.url ?? "").pathname).toBe(
      "/api/v1/bookings/org/profile"
    );
  });

  it("falls back to the default zone when there is no profile yet", async () => {
    stubFetch(404, { detail: "No profile" });
    expect(await getBusinessTimezone("tok", ORG)).toBe("America/Grenada");
  });

  it("rethrows other timezone read failures", async () => {
    stubFetch(500, { detail: "boom" });
    await expect(getBusinessTimezone("tok", ORG)).rejects.toBeInstanceOf(
      ResponseError
    );
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

describe("studio API actions", () => {
  function stubJson() {
    const calls: {
      body: string;
      method: string;
      org: string | null;
      url: string;
    }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        calls.push({
          body: await input.clone().text(),
          method: input.method,
          org: input.headers.get("x-barrels-organisation"),
          url: input.url,
        });
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );
    return calls;
  }

  it("posts each action to its own route with the organisation header", async () => {
    const calls = stubJson();
    await confirmBooking("tok", ORG, BOOKING);
    await markNoShow("tok", ORG, BOOKING);
    await markCompleted("tok", ORG, BOOKING);
    await declineBooking("tok", ORG, BOOKING, "Full");
    await cancelBooking("tok", ORG, BOOKING, { reason: "Ill" });
    await cancelBooking("tok", ORG, BOOKING, {
      reason: "Ill",
      refundDeposit: false,
    });
    expect(calls.map((call) => call.method)).toEqual([
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
    ]);
    expect(calls.every((call) => call.org === ORG)).toBe(true);
    expect(calls.every((call) => call.url.includes(BOOKING))).toBe(true);
    expect(calls.map((call) => call.url.split(BOOKING)[1])).toEqual([
      "/confirm",
      "/no-show",
      "/complete",
      "/decline",
      "/cancel",
      "/cancel",
    ]);
    expect(JSON.parse(calls[3]?.body ?? "{}")).toEqual({ reason: "Full" });
    expect(JSON.parse(calls[4]?.body ?? "{}")).toEqual({ reason: "Ill" });
    expect(JSON.parse(calls[5]?.body ?? "{}")).toEqual({
      reason: "Ill",
      refund_deposit: false,
    });
  });

  it("keeps the bearer token out of a failed action", async () => {
    stubFetch(409, {});
    const error = await confirmBooking(
      "bearer-token-act-secret",
      ORG,
      BOOKING
    ).then(
      () => null,
      (caught: unknown) => caught
    );
    expect(actionFailure(error).kind).toBe("conflict");
    expect(inspect(error, { depth: 6 })).not.toContain("bearer-token-act");
  });
});

describe("actionFailure", () => {
  it.each([
    [401, "signed_out"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "conflict"],
    [422, "invalid"],
    [500, "unavailable"],
  ] as const)("maps %s to %s", (status, kind) => {
    expect(actionFailure(apiError(status)).kind).toBe(kind);
  });

  it("says admin access is needed on a 403", () => {
    expect(actionFailure(apiError(403)).message).toBe(
      "You need admin access to change bookings."
    );
  });

  it("treats a non-API error as unavailable", () => {
    expect(actionFailure(new TypeError("network")).kind).toBe("unavailable");
  });
});
