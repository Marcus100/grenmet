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
import { loadOrganisationGrades, loadOrganisationStaff } from "@/lib/hr-staff";
import { reportError } from "@/lib/report-error";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const URL_STAFF = "http://localhost:8000/api/v1/hr/setup/staff";
const ORGANISATION_ID = "11111111-1111-4111-8111-111111111111";
const STAFF = {
  user_id: "22222222-2222-4222-8222-222222222222",
  email: "ada@example.com",
  name: "Ada Example",
  number: "S-001",
  department_id: "dep-1",
  grade_id: "grade-1",
  mailbox_ready: true,
  email_verified: true,
  employment_ready: true,
  status: "active",
  organisation_id: ORGANISATION_ID,
  account_active: true,
  registration_pending: false,
};

const server = setupServer();
let seen: Request[] = [];
let reply: () => Response = () => HttpResponse.json([STAFF]);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  server.use(
    http.get(URL_STAFF, ({ request }) => {
      seen.push(request);
      return reply();
    })
  );
});
afterEach(() => {
  server.resetHandlers();
  seen = [];
  reply = () => HttpResponse.json([STAFF]);
  vi.mocked(reportError).mockClear();
});
afterAll(() => server.close());

describe("loadOrganisationStaff", () => {
  it("reads one organisation's staff with the bearer token and the organisation id", async () => {
    const load = await loadOrganisationStaff("tok-1", ORGANISATION_ID);

    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]?.url ?? "");
    expect(url.searchParams.get("organisation_id")).toBe(ORGANISATION_ID);
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer tok-1");
    // The schema fills defaults (staff_approval_ready), so match the fields sent.
    expect(load).toMatchObject({ ok: true, staff: [STAFF] });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("returns an empty staff list as an empty list, not an error", async () => {
    reply = () => HttpResponse.json([]);
    expect(await loadOrganisationStaff("tok-1", ORGANISATION_ID)).toEqual({
      ok: true,
      staff: [],
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("says not-admin for a 403 without reporting it, because it is an expected state", async () => {
    reply = () =>
      HttpResponse.json(
        { detail: "Permission denied", code: "forbidden", errors: [] },
        { status: 403 }
      );
    expect(await loadOrganisationStaff("tok-1", ORGANISATION_ID)).toEqual({
      ok: false,
      reason: "not-admin",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("says not-found for a 404 without reporting it, so it reads like a foreign slug", async () => {
    reply = () =>
      HttpResponse.json(
        { detail: "Organisation not found", code: "not_found", errors: [] },
        { status: 404 }
      );
    expect(await loadOrganisationStaff("tok-1", ORGANISATION_ID)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports a server failure and never presents it as an empty list", async () => {
    reply = () =>
      HttpResponse.json(
        { detail: "boom", code: "internal", errors: [] },
        { status: 500 }
      );
    const load = await loadOrganisationStaff("tok-1", ORGANISATION_ID);

    expect(load).toEqual({ ok: false, reason: "unavailable" });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportError).mock.calls[0]?.[1]).toBe("hr-staff");
  });

  it("reports a response that does not match the generated schema", async () => {
    reply = () => HttpResponse.json([{ name: "No ids" }]);
    const load = await loadOrganisationStaff("tok-1", ORGANISATION_ID);

    expect(load).toEqual({ ok: false, reason: "unavailable" });
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

const URL_GRADES = "http://localhost:8000/api/v1/hr/setup/grades";
const GRADE = {
  id: "grade-1",
  department_id: "dep-1",
  code: "OFFICER",
  label: "Officer II",
  rank: 3,
  establishment_band: null,
  is_active: true,
};

describe("loadOrganisationGrades", () => {
  let gradesReply: () => Response = () => HttpResponse.json([GRADE]);
  let gradesSeen: Request[] = [];

  beforeEach(() => {
    server.use(
      http.get(URL_GRADES, ({ request }) => {
        gradesSeen.push(request);
        return gradesReply();
      })
    );
  });
  afterEach(() => {
    gradesReply = () => HttpResponse.json([GRADE]);
    gradesSeen = [];
  });

  it("reads one organisation's grades with the bearer token and the organisation id", async () => {
    const load = await loadOrganisationGrades("tok-1", ORGANISATION_ID);

    expect(gradesSeen).toHaveLength(1);
    const url = new URL(gradesSeen[0]?.url ?? "");
    expect(url.searchParams.get("organisation_id")).toBe(ORGANISATION_ID);
    expect(gradesSeen[0]?.headers.get("authorization")).toBe("Bearer tok-1");
    expect(load).toMatchObject({ ok: true, grades: [GRADE] });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("says not-admin for a 403 without reporting it", async () => {
    gradesReply = () =>
      HttpResponse.json(
        { detail: "Permission denied", code: "forbidden", errors: [] },
        { status: 403 }
      );
    expect(await loadOrganisationGrades("tok-1", ORGANISATION_ID)).toEqual({
      ok: false,
      reason: "not-admin",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("says not-found for a 404 without reporting it", async () => {
    gradesReply = () =>
      HttpResponse.json(
        { detail: "Organisation not found", code: "not_found", errors: [] },
        { status: 404 }
      );
    expect(await loadOrganisationGrades("tok-1", ORGANISATION_ID)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports a server failure under its own area and never presents it as an empty list", async () => {
    gradesReply = () =>
      HttpResponse.json(
        { detail: "boom", code: "internal", errors: [] },
        { status: 500 }
      );
    expect(await loadOrganisationGrades("tok-1", ORGANISATION_ID)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportError).mock.calls[0]?.[1]).toBe("hr-staff-grades");
  });

  it("reports a response that does not match the generated schema", async () => {
    gradesReply = () => HttpResponse.json([{ label: "No ids" }]);
    expect(await loadOrganisationGrades("tok-1", ORGANISATION_ID)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
