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
import { loadMyEmployment } from "@/lib/hr-me-employment";
import { reportError } from "@/lib/report-error";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const URL_EMPLOYMENT = "http://localhost:8000/api/v1/hr/me/employment";
const ORGANISATION_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYMENT = {
  organisation_id: ORGANISATION_ID,
  status: "ACTIVE",
  position: "Forecaster",
  department_name: "Forecasting",
  employment_type: "FULL_TIME",
  start_date: "2024-03-01",
  end_date: null,
  leave_balances: [{ leave_type: "VACATION", balance_days: "12.50" }],
};

const server = setupServer();
let seen: Request[] = [];
let reply: () => Response = () => HttpResponse.json(EMPLOYMENT);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  server.use(
    http.get(URL_EMPLOYMENT, ({ request }) => {
      seen.push(request);
      return reply();
    })
  );
});
afterEach(() => {
  server.resetHandlers();
  seen = [];
  reply = () => HttpResponse.json(EMPLOYMENT);
  vi.mocked(reportError).mockClear();
});
afterAll(() => server.close());

describe("loadMyEmployment", () => {
  it("reads only the caller's record for one organisation, with the bearer token", async () => {
    const load = await loadMyEmployment("tok-1", ORGANISATION_ID);

    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]?.url ?? "");
    expect(url.searchParams.get("organisation_id")).toBe(ORGANISATION_ID);
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer tok-1");
    expect(load).toMatchObject({
      ok: true,
      employment: {
        status: "ACTIVE",
        position: "Forecaster",
        leave_balances: [{ leave_type: "VACATION", balance_days: "12.50" }],
      },
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("accepts a record with no leave balances as an empty list, not an error", async () => {
    reply = () => HttpResponse.json({ ...EMPLOYMENT, leave_balances: [] });
    const load = await loadMyEmployment("tok-1", ORGANISATION_ID);

    expect(load).toMatchObject({
      ok: true,
      employment: { leave_balances: [] },
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("says not-employed for a 404 without reporting it, because it is an expected state", async () => {
    reply = () =>
      HttpResponse.json(
        { detail: "Employment not found", code: "not_found", errors: [] },
        { status: 404 }
      );
    expect(await loadMyEmployment("tok-1", ORGANISATION_ID)).toEqual({
      ok: false,
      reason: "not-employed",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("says not-granted for a 403 without reporting it", async () => {
    reply = () =>
      HttpResponse.json(
        { detail: "Permission denied", code: "forbidden", errors: [] },
        { status: 403 }
      );
    expect(await loadMyEmployment("tok-1", ORGANISATION_ID)).toEqual({
      ok: false,
      reason: "not-granted",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports a server failure and never presents it as an empty record", async () => {
    reply = () =>
      HttpResponse.json(
        { detail: "boom", code: "internal", errors: [] },
        { status: 500 }
      );
    const load = await loadMyEmployment("tok-1", ORGANISATION_ID);

    expect(load).toEqual({ ok: false, reason: "unavailable" });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportError).mock.calls[0]?.[1]).toBe("hr-me-employment");
  });

  it("reports a response that does not match the generated schema", async () => {
    reply = () => HttpResponse.json({ status: "ACTIVE" });
    const load = await loadMyEmployment("tok-1", ORGANISATION_ID);

    expect(load).toEqual({ ok: false, reason: "unavailable" });
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
