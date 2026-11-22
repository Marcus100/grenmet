import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listAuditEntries: vi.fn() }));
const gate = vi.hoisted(() => ({ requireGate: vi.fn() }));

vi.mock("@/lib/audit-api", () => api);
vi.mock("@/lib/staff-gate", () => gate);

const REAL_DAY = /real day in the form YYYY-MM-DD/u;

const { default: AuditPage } = await import("./page");

describe("audit page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a signed-in account that is not staff, without loading the log", async () => {
    gate.requireGate.mockResolvedValue({
      status: "refused",
      email: "someone@example.com",
    });
    render(await AuditPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("heading", { name: "Barrels staff only" })
    ).toBeTruthy();
    expect(api.listAuditEntries).not.toHaveBeenCalled();
  });

  it("lists the problems with the filters and loads nothing", async () => {
    gate.requireGate.mockResolvedValue({
      status: "staff",
      accessToken: "tok",
      email: "me@barrels.gd",
    });
    render(
      await AuditPage({
        searchParams: Promise.resolve({ from: "2026-02-30", actor_id: "x" }),
      })
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "the filters are not valid, so nothing was loaded"
    );
    expect(screen.getByText(REAL_DAY)).toBeTruthy();
    expect(api.listAuditEntries).not.toHaveBeenCalled();
  });

  it("keeps what was typed in the form when the filters are refused", async () => {
    gate.requireGate.mockResolvedValue({
      status: "staff",
      accessToken: "tok",
      email: "me@barrels.gd",
    });
    render(
      await AuditPage({
        searchParams: Promise.resolve({ entity_type: "Not A Type" }),
      })
    );
    expect(screen.getByLabelText("Entity type")).toHaveValue("Not A Type");
    expect(api.listAuditEntries).not.toHaveBeenCalled();
  });
});
