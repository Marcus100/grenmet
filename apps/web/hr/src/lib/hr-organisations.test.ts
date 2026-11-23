import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { reportError } from "@/lib/report-error";
import { fetchMyOrganisations, loadMyOrganisations } from "./hr-organisations";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const URL_ORGANISATIONS = "http://localhost:8000/api/v1/hr/me/organisations";
const ORG = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "gaa",
  name: "Grenada Airports Authority",
  scope: "ALL",
};

const server = setupServer();
let seen: Request[] = [];
let reply: () => Response = () => HttpResponse.json([ORG]);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  server.use(
    http.get(URL_ORGANISATIONS, ({ request }) => {
      seen.push(request);
      return reply();
    })
  );
});
afterEach(() => {
  server.resetHandlers();
  seen = [];
  reply = () => HttpResponse.json([ORG]);
  vi.mocked(reportError).mockClear();
});
afterAll(() => server.close());

describe("fetchMyOrganisations", () => {
  it("sends the bearer token and returns the parsed list", async () => {
    const list = await fetchMyOrganisations("tok-1");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer tok-1");
    expect(list).toEqual([ORG]);
  });

  it("returns an empty list as an empty list, not an error", async () => {
    reply = () => HttpResponse.json([]);
    expect(await fetchMyOrganisations("tok-1")).toEqual([]);
  });

  it("rejects a response that does not match the generated schema", async () => {
    reply = () => HttpResponse.json([{ slug: "gaa" }]);
    await expect(fetchMyOrganisations("tok-1")).rejects.toThrow();
  });
});

describe("loadMyOrganisations", () => {
  it("returns the organisations when the read works", async () => {
    const load = await loadMyOrganisations("tok-1");
    expect(load).toEqual({ ok: true, organisations: [ORG] });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports a failed read and does not present it as an empty list", async () => {
    reply = () =>
      HttpResponse.json(
        { detail: "boom", code: "internal", errors: [] },
        { status: 500 }
      );
    const load = await loadMyOrganisations("tok-1");
    expect(load).toEqual({ ok: false });
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "hr-organisations"
    );
  });
});
