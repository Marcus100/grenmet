import { AuthApiError } from "@barrelsgd/auth";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listAuditEntries: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/lib/audit-api", () => api);
vi.mock("@/lib/report-error", () => report);

const { AuditSection } = await import("./audit-section");

const NO_FILTERS = {};

const page = (overrides: Record<string, unknown> = {}) => ({
  data: [
    {
      id: "7d9f2a4c-1b3e-4f5a-8c6d-9e0f1a2b3c4d",
      record_type: "platform_organisation",
      record_label: "Organisation",
      record_id: "org_1",
      action: "update",
      actor_user_id: null,
      actor_name: "System",
      changes: [],
      created_at: "2026-11-22T14:15:00.000Z",
      entity_type: "platform_organisation",
      entity_id: "org_1",
      organisation_id: "org_1",
    },
  ],
  limit: 50,
  next_cursor: null,
  ...overrides,
});

describe("AuditSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads with the filters and cursor and renders the rows", async () => {
    api.listAuditEntries.mockResolvedValue(page());
    render(
      await AuditSection({
        accessToken: "tok",
        cursor: "c1",
        filters: { action: "update" },
      })
    );
    expect(api.listAuditEntries).toHaveBeenCalledWith(
      "tok",
      { action: "update" },
      "c1"
    );
    expect(screen.getByText("System")).toBeTruthy();
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("offers the older page with the API's opaque cursor, URL-encoded", async () => {
    api.listAuditEntries.mockResolvedValue(
      page({ next_cursor: "eyJ0IjoiMjAyNiJ9+/==" })
    );
    render(
      await AuditSection({
        accessToken: "tok",
        cursor: undefined,
        filters: NO_FILTERS,
      })
    );
    expect(screen.getByRole("link", { name: "Older entries" })).toHaveAttribute(
      "href",
      "/audit?cursor=eyJ0IjoiMjAyNiJ9%2B%2F%3D%3D"
    );
    expect(screen.queryByRole("link", { name: "Newest entries" })).toBeNull();
  });

  it("offers the newest entries from any page after the first", async () => {
    api.listAuditEntries.mockResolvedValue(page());
    render(
      await AuditSection({
        accessToken: "tok",
        cursor: "c1",
        filters: { organisationId: "org_1" },
      })
    );
    expect(
      screen.getByRole("link", { name: "Newest entries" })
    ).toHaveAttribute("href", "/audit?organisation_id=org_1");
  });

  it("explains a 403 as a missing permission and does not report it", async () => {
    api.listAuditEntries.mockRejectedValue(
      new AuthApiError(403, "Missing audit.entries.read")
    );
    render(
      await AuditSection({
        accessToken: "tok",
        cursor: undefined,
        filters: NO_FILTERS,
      })
    );
    expect(screen.getByRole("status").textContent).toContain(
      "audit.entries.read"
    );
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("says the filters or cursor were refused on a 422", async () => {
    api.listAuditEntries.mockRejectedValue(
      new AuthApiError(422, "The cursor is not valid")
    );
    render(
      await AuditSection({
        accessToken: "tok",
        cursor: "bad",
        filters: NO_FILTERS,
      })
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "did not accept those filters"
    );
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure and shows a plain message", async () => {
    const boom = new Error("boom");
    api.listAuditEntries.mockRejectedValue(boom);
    render(
      await AuditSection({
        accessToken: "tok",
        cursor: undefined,
        filters: NO_FILTERS,
      })
    );
    expect(report.reportError).toHaveBeenCalledWith(boom, "admin-audit");
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be loaded"
    );
  });
});
