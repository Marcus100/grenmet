import type { BookingAgenda } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/studio-api", () => ({
  getAgenda: vi.fn(),
  getBusinessProfile: vi.fn(),
}));

import { getAgenda } from "@/lib/studio-api";
import { joinAgendas, loadPendingRequests } from "./studio-pending";

function agenda(from: string, to: string, total: number): BookingAgenda {
  return {
    timezone: "America/Grenada",
    from_date: from,
    to_date: to,
    total,
    limit: 100,
    offset: 0,
    days: [],
  };
}

beforeEach(() => {
  vi.mocked(getAgenda).mockReset();
});

describe("joinAgendas", () => {
  it("adds the totals and spans both windows", () => {
    const joined = joinAgendas(
      agenda("2026-09-01", "2026-10-31", 2),
      agenda("2026-11-01", "2026-12-31", 3)
    );
    expect(joined.total).toBe(5);
    expect(joined.from_date).toBe("2026-09-01");
    expect(joined.to_date).toBe("2026-12-31");
  });
});

describe("loadPendingRequests", () => {
  it("reads only pending bookings over two windows the API accepts, older first", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda("a", "b", 1));
    const result = await loadPendingRequests("tok", "org", "America/Grenada");
    expect(result.total).toBe(2);
    const calls = vi.mocked(getAgenda).mock.calls.map((call) => call[2]);
    expect(calls).toHaveLength(2);
    for (const query of calls) {
      expect(query.statuses).toEqual(["pending"]);
      const days =
        (Date.parse(query.toDate) - Date.parse(query.fromDate)) / 86_400_000 +
        1;
      expect(days).toBeLessThanOrEqual(62);
    }
    expect((calls[0]?.toDate ?? "") < (calls[1]?.fromDate ?? "")).toBe(true);
  });
});
