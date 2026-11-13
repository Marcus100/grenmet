import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listVerificationCases: vi.fn(),
  getVerificationCase: vi.fn(),
}));
const gate = vi.hoisted(() => ({ requireGate: vi.fn() }));
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/lib/moderation-api", () => api);
vi.mock("@/lib/staff-gate", () => gate);
vi.mock("@/app/(console)/moderation/actions", () => ({
  approveAction: () => Promise.resolve({}),
  rejectAction: () => Promise.resolve({}),
}));
vi.mock("next/navigation", () => ({
  notFound: nav.notFound,
  unstable_rethrow: () => undefined,
}));

const { default: QueuePage } = await import("./page");
const { default: CasePage } = await import("./[id]/page");

const detail = {
  organisation_id: "org_1",
  organiser_id: "0b8f6f0e-6a53-4a0e-9a9b-3f1f2c5d7e11",
  organiser_slug: "acme-events",
  name: "Acme Events",
  verification_status: "pending",
  requested_at: "2026-10-18T12:30:00Z",
  decided_at: null,
  bio: "We run festivals.",
  logo_file_id: null,
  verification_reason: null,
  owners: [{ name: "Sam Owner", role: "owner" }],
  listing_counts: { draft: 2 },
  history: [],
};

const RE_0 = /Approving overrides that rejection/u;

describe("moderation pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.requireGate.mockResolvedValue({
      status: "staff",
      accessToken: "tok",
      email: "me@barrels.gd",
    });
  });

  it("queries the status filter and renders the empty state", async () => {
    api.listVerificationCases.mockResolvedValue({
      data: [],
      count: 0,
      page: 1,
      size: 25,
    });
    render(
      await QueuePage({ searchParams: Promise.resolve({ status: "rejected" }) })
    );
    expect(api.listVerificationCases).toHaveBeenCalledWith(
      "tok",
      "rejected",
      1
    );
    expect(screen.getByText("No organisers have been rejected.")).toBeTruthy();
  });

  it("shows both decisions for a pending case", async () => {
    api.getVerificationCase.mockResolvedValue(detail);
    render(
      await CasePage({
        params: Promise.resolve({ id: "org_1" }),
        searchParams: Promise.resolve({ notice: "already-decided" }),
      })
    );
    expect(screen.getByText("Approve this organiser")).toBeTruthy();
    expect(screen.getByText("Reject this organiser")).toBeTruthy();
    expect(screen.getByText("Sam Owner (owner)")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("already decided");
  });

  it("hides decisions once the case is decided", async () => {
    api.getVerificationCase.mockResolvedValue({
      ...detail,
      verification_status: "rejected",
    });
    render(
      await CasePage({
        params: Promise.resolve({ id: "org_1" }),
        searchParams: Promise.resolve({}),
      })
    );
    expect(screen.getByText("Approve this organiser")).toBeTruthy();
    expect(screen.queryByText("Reject this organiser")).toBeNull();
    expect(screen.getByText(RE_0)).toBeTruthy();
  });

  it("ignores a success notice that does not match the real status", async () => {
    api.getVerificationCase.mockResolvedValue(detail);
    render(
      await CasePage({
        params: Promise.resolve({ id: "org_1" }),
        searchParams: Promise.resolve({ notice: "rejected" }),
      })
    );
    expect(
      screen
        .queryAllByRole("status")
        .some((el) => (el.textContent ?? "").includes("Rejected."))
    ).toBe(false);
  });

  it("404s a malformed id without calling the API", async () => {
    await CasePage({
      params: Promise.resolve({ id: "a b" }),
      searchParams: Promise.resolve({}),
    }).catch(() => undefined);
    expect(nav.notFound).toHaveBeenCalled();
    expect(api.getVerificationCase).not.toHaveBeenCalled();
  });
});
