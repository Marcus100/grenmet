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
import { fetchAdminAlerts, getAlertByIdentifier } from "./cap-api";

vi.mock("@/lib/auth-config", () => ({
  getCapApiBaseUrl: () => "http://localhost:8000",
  getAuthApiPrefix: () => "/api/v1",
}));

const ALERTS_URL = "http://localhost:8000/api/v1/cap/alerts";
const LOAD_FAILURE = /Failed to load CAP alerts \(403\)/u;

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
