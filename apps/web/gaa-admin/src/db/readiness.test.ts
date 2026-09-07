import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkDatabase } from "./readiness";

const { query, end } = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn() }));
vi.mock("pg", () => ({
  Pool: class {
    query = query;
    end = end;
  },
}));
beforeEach(() => {
  query.mockReset();
  end.mockReset();
});

describe("database readiness", () => {
  it("rejects unconfigured databases without connecting", async () => {
    expect(await checkDatabase(undefined, ["products"])).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
  it("accepts empty migrated datasets", async () => {
    query.mockResolvedValue({ rows: [{ present: true }] });
    expect(await checkDatabase("postgres://test", ["products"])).toBe(true);
    expect(end).toHaveBeenCalled();
  });
  it("rejects missing tables and missing catalogue baselines", async () => {
    query.mockResolvedValueOnce({ rows: [{ present: false }] });
    expect(await checkDatabase("postgres://test", ["products"])).toBe(false);
    query
      .mockResolvedValueOnce({ rows: [{ present: true }] })
      .mockResolvedValueOnce({ rowCount: 0 });
    expect(
      await checkDatabase("postgres://test", ["routes"], "transport-v1")
    ).toBe(false);
  });
  it("returns unavailable and closes the pool on database failure", async () => {
    query.mockRejectedValue(new Error("unavailable"));
    expect(await checkDatabase("postgres://test", ["products"])).toBe(false);
    expect(end).toHaveBeenCalled();
  });
});
