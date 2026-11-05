import { AuthApiError } from "@barrelsgd/auth";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ getDeskGate: vi.fn() }));
const api = vi.hoisted(() => ({ exportStatisticsCsv: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/api", () => api);
vi.mock("@/lib/report-error", () => report);

import { GET } from "./route";

const CSV = "table,key,label,count\r\ntotal,total,All published warnings,0\r\n";

function request(query = "") {
  return new NextRequest(
    `https://cap.example.test/desk/statistics/export${query}`
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  gate.getDeskGate.mockResolvedValue(staffGate());
  api.exportStatisticsCsv.mockResolvedValue(
    new Response(CSV, {
      headers: {
        "content-disposition": 'attachment; filename="stats.csv"',
        "content-type": "text/csv; charset=utf-8",
      },
    })
  );
});

describe("GET /desk/statistics/export", () => {
  it("streams the CSV as a private download with the validated filters", async () => {
    const response = await GET(
      request("?start=2026-01-01&end=2026-02-28&hazard=High+Wind+Warning")
    );
    expect(api.exportStatisticsCsv).toHaveBeenCalledWith("token-test", {
      end: "2026-02-28",
      hazard: "High Wind Warning",
      start: "2026-01-01",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8"
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="stats.csv"'
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe(CSV);
  });

  it("refuses a signed-out visitor without calling the API", async () => {
    gate.getDeskGate.mockResolvedValue({ status: "signed-out" });
    expect((await GET(request())).status).toBe(401);
    expect(api.exportStatisticsCsv).not.toHaveBeenCalled();
  });

  it("refuses an account without cap.alert.read", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate({ read: false }));
    expect((await GET(request())).status).toBe(403);
    expect(api.exportStatisticsCsv).not.toHaveBeenCalled();
  });

  it("refuses a bad filter before it reaches the API", async () => {
    const response = await GET(request("?start=2026-02-30"));
    expect(response.status).toBe(422);
    expect(await response.text()).toContain("real day");
    expect(api.exportStatisticsCsv).not.toHaveBeenCalled();
  });

  it("passes the API's own refusal through", async () => {
    api.exportStatisticsCsv.mockRejectedValue(
      new AuthApiError(403, "Permission denied")
    );
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Permission denied");
  });

  it("reports an unexpected failure and answers 502", async () => {
    const boom = new Error("down");
    api.exportStatisticsCsv.mockRejectedValue(boom);
    expect((await GET(request())).status).toBe(502);
    expect(report.reportError).toHaveBeenCalledWith(
      boom,
      "cap-desk-statistics-export"
    );
  });
});
