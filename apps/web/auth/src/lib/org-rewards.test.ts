import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw-server";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("./report-error", () => ({ reportError }));

import {
  canManageRewards,
  getVenueQrToken,
  listProgrammes,
  setProgrammePaused,
} from "./org-rewards";
import { classifyFailure, errorDetail } from "./org-rewards-errors";
import { checkAchievement, isUuid, sourceLabel } from "./org-rewards-options";

const BASE = "http://localhost:8000/api/v1";
const ID = "11111111-1111-4111-8111-111111111111";

describe("organisation rewards API calls", () => {
  it("send the bearer token and the organisation header on every call", async () => {
    const seen: Array<{
      auth: string | null;
      org: string | null;
      url: string;
    }> = [];
    server.use(
      http.get(`${BASE}/rewards/programs`, ({ request }) => {
        seen.push({
          auth: request.headers.get("authorization"),
          org: request.headers.get("x-barrels-organisation"),
          url: request.url,
        });
        return HttpResponse.json([]);
      }),
      http.post(`${BASE}/rewards/org/programs/${ID}/pause`, ({ request }) => {
        seen.push({
          auth: request.headers.get("authorization"),
          org: request.headers.get("x-barrels-organisation"),
          url: request.url,
        });
        return HttpResponse.json({});
      })
    );
    await listProgrammes("tok", "org_9");
    await setProgrammePaused("tok", "org_9", ID, true);
    expect(seen).toHaveLength(2);
    for (const call of seen) {
      expect(call.auth).toBe("Bearer tok");
      expect(call.org).toBe("org_9");
    }
  });

  it("fetches the venue code without it ever being in the URL", async () => {
    let requested = "";
    server.use(
      http.get(`${BASE}/rewards/org/venues/${ID}/qr-token`, ({ request }) => {
        requested = request.url;
        return HttpResponse.json({
          refresh_after_seconds: 30,
          token: "v1.abc.1.def",
          window_seconds: 60,
        });
      })
    );
    const code = await getVenueQrToken("tok", "org_9", ID);
    expect(code.token).toBe("v1.abc.1.def");
    expect(requested).not.toContain("v1.abc");
  });

  it("canManageRewards is false on 403 and true on success", async () => {
    server.use(
      http.get(`${BASE}/rewards/programs`, () =>
        HttpResponse.json(
          { detail: "This organisation is not entitled to this app" },
          { status: 403 }
        )
      )
    );
    expect(await canManageRewards("tok", "org_9")).toBe(false);
    server.use(
      http.get(`${BASE}/rewards/programs`, () => HttpResponse.json([]))
    );
    expect(await canManageRewards("tok", "org_9")).toBe(true);
  });

  it("canManageRewards still offers the link on an outage and reports it", async () => {
    server.use(
      http.get(`${BASE}/rewards/programs`, () =>
        HttpResponse.json({ detail: "down" }, { status: 500 })
      )
    );
    expect(await canManageRewards("tok", "org_9")).toBe(true);
    expect(reportError).toHaveBeenCalled();
  });
});

describe("failure classification", () => {
  const fail = (status: number, data: unknown) =>
    Object.assign(new Error("x"), { data, status });

  it("maps statuses to kinds", () => {
    expect(classifyFailure(fail(401, {}))).toBe("unauthorised");
    expect(classifyFailure(fail(403, { detail: "not entitled" }))).toBe(
      "not-entitled"
    );
    expect(classifyFailure(fail(403, { detail: "Forbidden" }))).toBe(
      "forbidden"
    );
    expect(classifyFailure(fail(404, {}))).toBe("not-found");
    expect(classifyFailure(fail(422, {}))).toBe("invalid");
    expect(classifyFailure(fail(503, {}))).toBe("unavailable");
    expect(classifyFailure(new Error("network"))).toBe("unknown");
  });

  it("reads the API's detail or validation messages", () => {
    expect(errorDetail(fail(400, { detail: "Plain text" }))).toBe("Plain text");
    expect(
      errorDetail(
        fail(422, {
          errors: [
            {
              loc: [],
              msg: "Value error, A required stop needs a venue",
              type: "x",
            },
          ],
        })
      )
    ).toBe("A required stop needs a venue");
    expect(errorDetail(fail(500, "html"))).toBeUndefined();
  });
});

describe("options", () => {
  it("labels catalogue sources and passes unknown ones through", () => {
    expect(sourceLabel("events.admission")).toBe("Event admission");
    expect(sourceLabel("other.thing")).toBe("other.thing");
  });

  it("recognises uuids", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("../x")).toBe(false);
  });

  const base = {
    days: "",
    key: "regular",
    n: "",
    name: "Regular",
    trailId: "",
  };

  it("validates parameters per rule type", () => {
    expect(
      checkAchievement({ ...base, n: "5", ruleType: "attended_n_events" })
    ).toEqual({ ok: true, parameters: { n: 5 } });
    expect(
      checkAchievement({ ...base, n: "1001", ruleType: "attended_n_events" }).ok
    ).toBe(false);
    expect(
      checkAchievement({ ...base, days: "1", ruleType: "streak_days" }).ok
    ).toBe(false);
    expect(
      checkAchievement({ ...base, days: "366", ruleType: "streak_days" }).ok
    ).toBe(false);
    expect(
      checkAchievement({ ...base, days: "7", ruleType: "streak_days" })
    ).toEqual({ ok: true, parameters: { days: 7 } });
    expect(
      checkAchievement({ ...base, ruleType: "visited_all_stops_of_trail" }).ok
    ).toBe(false);
    expect(
      checkAchievement({
        ...base,
        ruleType: "visited_all_stops_of_trail",
        trailId: ID,
      })
    ).toEqual({ ok: true, parameters: { trail_id: ID } });
    expect(checkAchievement({ ...base, ruleType: "nope" }).ok).toBe(false);
  });

  it("rejects a malformed key or a blank name", () => {
    expect(
      checkAchievement({
        ...base,
        key: "Bad Key",
        n: "1",
        ruleType: "attended_n_events",
      }).ok
    ).toBe(false);
    expect(
      checkAchievement({
        ...base,
        n: "1",
        name: " ",
        ruleType: "attended_n_events",
      }).ok
    ).toBe(false);
  });
});
