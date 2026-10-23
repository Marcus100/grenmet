import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBundle, makeTeamMember } from "@/test/team-factories";

const getManagedOrganiser = vi.fn();
const resolveOrgContext = vi.fn();
const getTeam = vi.fn();

vi.mock("@/data/events-api", () => ({
  getManagedOrganiser: () => getManagedOrganiser(),
}));
vi.mock("@/data/org-context", () => ({
  resolveOrgContext: () => resolveOrgContext(),
}));
vi.mock("@/data/team", () => ({
  getTeam: (...args: unknown[]) => getTeam(...args),
}));
vi.mock("@/data/viewer", () => ({ requireViewer: vi.fn() }));
vi.mock("@/lib/session", () => ({
  getSession: async () => ({ userId: "user_1" }),
}));
vi.mock("@/data/team-actions", () => ({
  grantRole: vi.fn(),
  revokeGrant: vi.fn(),
  loadIssuedGrants: vi.fn(),
  removeMember: vi.fn(),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/components/dash/no-organiser-access", () => ({
  NoOrganiserAccess: () => <p>No access</p>,
}));
vi.mock("@/components/dash/dash-shell", () => ({
  DashShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import TeamPage from "./page";

const RE_T1 = /is not passed on/;

const managed = {
  organiser: { slug: "o", name: "Fete Crew", organisationId: "org_1" },
  organisers: [],
  listings: [],
};

function show(search: { page?: string } = {}) {
  return TeamPage({ searchParams: Promise.resolve(search) });
}

beforeEach(() => {
  vi.clearAllMocks();
  getManagedOrganiser.mockResolvedValue(managed);
  resolveOrgContext.mockResolvedValue({
    ok: true,
    accessToken: "t",
    organisationId: "org_1",
  });
});

describe("Team page", () => {
  it("lists members with the help text and passes the page and viewer to the read", async () => {
    getTeam.mockResolvedValue({
      kind: "ok",
      bundles: [makeBundle()],
      members: [makeTeamMember()],
      count: 40,
      page: 2,
      totalPages: 2,
    });
    render(await show({ page: "2" }));
    expect(getTeam).toHaveBeenCalledWith(
      expect.objectContaining({ organisationId: "org_1" }),
      { page: 2, userId: "user_1" }
    );
    expect(
      screen.getByRole("heading", { name: "Team and roles" })
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Door")).toBeInTheDocument();
    expect(screen.getByText(RE_T1)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/dash/team?page=1"
    );
  });

  it("says so, without calling the API, when the organiser has no organisation", async () => {
    resolveOrgContext.mockResolvedValue({
      ok: false,
      reason: "no-organisation",
    });
    render(await show());
    expect(getTeam).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("isn't linked");
  });

  it("shows a no-access state for a member who cannot manage the team", async () => {
    getTeam.mockResolvedValue({ kind: "forbidden" });
    render(await show());
    expect(screen.getByRole("status")).toHaveTextContent(
      "access to the team and roles"
    );
  });

  it("is a 404 when the API does not know the organisation", async () => {
    getTeam.mockResolvedValue({ kind: "not-found" });
    const error = await show().catch((caught: unknown) => caught);
    expect(error instanceof Error ? error.message : null).toBe("not-found");
  });

  it("sends a page past the end to the last page", async () => {
    getTeam.mockResolvedValue({
      kind: "ok",
      bundles: [],
      members: [],
      count: 30,
      page: 9,
      totalPages: 2,
    });
    const error = await show({ page: "9" }).catch((caught: unknown) => caught);
    expect(error instanceof Error ? error.message : null).toBe(
      "redirect:/dash/team?page=2"
    );
  });
});
