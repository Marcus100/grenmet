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
import { fetchAdminAlerts } from "./cap-api";

vi.mock("@/lib/auth-config", () => ({
  getCapApiBaseUrl: () => "http://localhost:8000",
  getAuthApiPrefix: () => "/api/v1",
}));

const ALERTS_URL = "http://localhost:8000/api/v1/cap/alerts";
const LOAD_FAILURE = /Failed to load CAP alerts \(403\)/;

const ALERTS = {
  count: 1,
  data: [
    {
      id: "alert_1",
      identifier: "GD-2026-001",
      incidents: [],
      info: [],
      lifecycle_state: "DRAFT",
      msg_type: "Alert",
      note: null,
      scope: "Public",
      sender: "cap@weather.gd",
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
});
