import { isAuthApiError } from "@barrelsgd/auth";
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
import { getMyBookings } from "./my-bookings-api";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const URL_BOOKINGS = "http://localhost:8000/api/v1/bookings/me/bookings";
const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "confirmed",
  starts_at: "2030-01-10T14:00:00Z",
  ends_at: "2030-01-10T15:00:00Z",
  service_name: "Bridal makeup",
  business_name: "Babydoll Beauty Bar",
  business_slug: "babydoll",
};

const server = setupServer();
let seen: URL[] = [];
let reply: () => Response = () =>
  HttpResponse.json({ data: [ROW], count: 1, page: 1, size: 10 });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  seen = [];
  reply = () => HttpResponse.json({ data: [ROW], count: 1, page: 1, size: 10 });
});
afterAll(() => server.close());

function serve() {
  server.use(
    http.get(URL_BOOKINGS, ({ request }) => {
      seen.push(new URL(request.url));
      return reply();
    })
  );
}

describe("getMyBookings", () => {
  it("sends the bearer token and the upcoming filter and paging", async () => {
    serve();
    const list = await getMyBookings("tok-1", {
      upcoming: false,
      page: 3,
      size: 10,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.searchParams.get("upcoming")).toBe("false");
    expect(seen[0]?.searchParams.get("page")).toBe("3");
    expect(seen[0]?.searchParams.get("size")).toBe("10");
    expect(list.data[0]?.business_slug).toBe("babydoll");
    expect(list.count).toBe(1);
  });

  it("leaves page out when none is given", async () => {
    serve();
    await getMyBookings("tok-1", { upcoming: true, size: 1000 });
    expect(seen[0]?.searchParams.has("page")).toBe(false);
    expect(seen[0]?.searchParams.get("upcoming")).toBe("true");
  });

  it("throws the API status for a refused call", async () => {
    reply = () => HttpResponse.json({ detail: "Nope." }, { status: 401 });
    serve();
    const error: unknown = await getMyBookings("tok-1", {
      upcoming: true,
      size: 10,
    }).catch((caught: unknown) => caught);
    expect(isAuthApiError(error)).toBe(true);
    expect(isAuthApiError(error) && error.status).toBe(401);
  });
});
