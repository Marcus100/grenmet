import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { reportError } from "@/lib/report-error";
import {
  fetchAdminAlerts,
  formatDateTime,
  getAlertByIdentifier,
  getLatestActiveAlerts,
  getPastAlerts,
} from "./cap-api";

vi.mock("@/lib/auth-config", () => ({
  getCapApiBaseUrl: () => "http://localhost:8000",
  getAuthApiPrefix: () => "/api/v1",
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const LATEST_URL = "http://localhost:8000/api/cap/latest-active";
const PAST_URL = "http://localhost:8000/api/cap/past";
const EMPTY_LIST = { count: 0, data: [] };
const GRENADA_EVENING = /^Oct 29, 2026, 10:30\s?PM AST$/;

const ALERTS_URL = "http://localhost:8000/api/v1/cap/alerts";
const LOAD_FAILURE = /Failed to load CAP alerts \(403\)/;

const ALERTS = {
  count: 1,
  data: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      identifier: "GD-2026-001",
      created_by_user_id: "22222222-2222-4222-8222-222222222222",
      created_at: "2026-07-06T00:00:00Z",
      updated_at: "2026-07-06T00:00:00Z",
      incidents: [],
      info: [],
      lifecycle_state: "DRAFT",
      msg_type: "Alert",
      note: null,
      scope: "Public",
      sender: "cap@example.com",
      sent: "2026-07-06T00:00:00Z",
      status: "Draft",
      xml_url: null,
    },
  ],
};

let capturedAuthHeader: string | null = null;

const server = setupServer(
  http.get(ALERTS_URL, ({ request }) => {
    capturedAuthHeader = request.headers.get("authorization");
    return HttpResponse.json(ALERTS);
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  capturedAuthHeader = null;
});
afterAll(() => server.close());

describe("fetchAdminAlerts", () => {
  it("sends the Bearer access token and returns the alert list", async () => {
    const result = await fetchAdminAlerts("test-access-token");

    expect(capturedAuthHeader).toBe("Bearer test-access-token");
    expect(result.count).toBe(1);
    expect(result.data[0]?.identifier).toBe("GD-2026-001");
  });

  it("throws when the backend rejects the request", async () => {
    server.use(
      http.get(ALERTS_URL, () =>
        HttpResponse.json({ detail: "Forbidden" }, { status: 403 })
      )
    );

    await expect(fetchAdminAlerts("test-access-token")).rejects.toThrow(
      LOAD_FAILURE
    );
  });

  it("rejects a successful response that does not match the CAP schema", async () => {
    server.use(
      http.get(ALERTS_URL, () =>
        HttpResponse.json({ count: 1, data: [{ identifier: "incomplete" }] })
      )
    );

    await expect(fetchAdminAlerts("test-access-token")).rejects.toThrow();
  });
});

describe("getAlertByIdentifier", () => {
  it("encodes reserved characters in the identifier", async () => {
    let requested = "";
    server.use(
      http.get("http://localhost:8000/api/cap/alerts/*", ({ request }) => {
        requested = request.url;
        return HttpResponse.json({ detail: "Not found" }, { status: 404 });
      })
    );

    await getAlertByIdentifier("GD/2026#1?x y").catch(() => undefined);

    expect(requested).toBe(
      "http://localhost:8000/api/cap/alerts/GD%2F2026%231%3Fx%20y"
    );
  });
});

describe("public CAP feeds", () => {
  it("returns the alerts when the feed answers", async () => {
    server.use(http.get(LATEST_URL, () => HttpResponse.json(EMPTY_LIST)));
    const feed = await getLatestActiveAlerts();
    expect(feed).toMatchObject({
      status: "ok",
      value: { count: EMPTY_LIST.count, data: EMPTY_LIST.data },
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("is unavailable, never an empty list, when the feed answers with an error", async () => {
    server.use(
      http.get(LATEST_URL, () =>
        HttpResponse.json({ detail: "down" }, { status: 503 })
      )
    );
    expect(await getLatestActiveAlerts()).toEqual({ status: "unavailable" });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), "cap-feed");
  });

  it("is unavailable, and reported, when the feed cannot be reached", async () => {
    server.use(http.get(PAST_URL, () => HttpResponse.error()));
    expect(await getPastAlerts()).toEqual({ status: "unavailable" });
    expect(reportError).toHaveBeenCalledWith(expect.anything(), "cap-feed");
  });

  it("is unavailable when the feed answers with the wrong shape", async () => {
    server.use(
      http.get(LATEST_URL, () => HttpResponse.json({ unexpected: true }))
    );
    expect((await getLatestActiveAlerts()).status).toBe("unavailable");
  });
});

describe("formatDateTime", () => {
  it("shows the time in Grenada time, labelled AST", () => {
    // 02:30 UTC on 30 Oct is 10:30 p.m. on 29 Oct in Grenada (UTC-4).
    expect(formatDateTime("2026-10-30T02:30:00Z")).toMatch(GRENADA_EVENING);
  });

  it("says when no time is set", () => {
    expect(formatDateTime(null)).toBe("Not set");
  });
});
