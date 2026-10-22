import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeBundle, makeGrant, makeTeamMember } from "@/test/team-factories";
import { TeamFeedbackProvider } from "./team-feedback";
import { TeamHelp } from "./team-help";
import { TeamMembers } from "./team-members";

const RE_T1 = /Ends .*UTC/;
const RE_T2 = /No end date/;
const RE_T3 = /No roles yet/;
const RE_T4 = /Owners have every Events role/;
const RE_T5 = /Take away/;
const RE_T6 = /Remove/;
const RE_T7 = /is not passed on/;

vi.mock("@/data/team-actions", () => ({
  grantRole: vi.fn(),
  revokeGrant: vi.fn(),
  loadIssuedGrants: vi.fn(),
  removeMember: vi.fn(),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash/team",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const RE_GAP = /only available to owners and admins/;

function show(
  members: Parameters<typeof TeamMembers>[0]["members"],
  canRemove = true
) {
  return render(
    <TeamFeedbackProvider>
      <TeamMembers
        bundles={[makeBundle()]}
        canRemove={canRemove}
        members={members}
        today="2026-10-22"
      />
    </TeamFeedbackProvider>
  );
}

describe("TeamMembers", () => {
  it("shows an empty state for an empty roster", () => {
    show([]);
    expect(
      screen.getByText("This organisation has no members yet.")
    ).toHaveAttribute("role", "status");
  });

  it("explains the gap when the API does not allow the roster", () => {
    show(null, false);
    expect(screen.getByText(RE_GAP)).toHaveAttribute("role", "status");
  });

  it("shows live roles with who gave them, UTC end dates and a take-away button", () => {
    show([
      makeTeamMember({
        grants: [
          makeGrant({ expires_at: "2026-11-01T23:59:59Z" }),
          makeGrant({ id: "g2", role_key: "events-till", expires_at: null }),
        ],
      }),
    ]);
    const row = screen.getByText("Ana Door").closest("li");
    if (!row) {
      throw new Error("row missing");
    }
    expect(within(row).getByText("Door staff")).toBeInTheDocument();
    expect(within(row).getByText(RE_T1)).toBeInTheDocument();
    expect(within(row).getByText(RE_T2)).toBeInTheDocument();
    expect(
      within(row).getByRole("button", {
        name: "Take away Box office from Ana Door",
      })
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("button", {
        name: "Remove Ana Door from the organisation",
      })
    ).toBeInTheDocument();
  });

  it("says a member with no roles has none, and that owners need none", () => {
    show([
      makeTeamMember(),
      makeTeamMember({
        membershipId: "mem_o",
        fullName: "Olu Owner",
        role: "owner",
      }),
    ]);
    expect(screen.getByText(RE_T3)).toBeInTheDocument();
    expect(screen.getByText(RE_T4)).toBeInTheDocument();
  });

  it("offers no change controls on the viewer's own row", () => {
    show([makeTeamMember({ isSelf: true, grants: [makeGrant()] })]);
    expect(
      screen.getByText("You can't change your own roles.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Give role" })).toBeNull();
    expect(screen.queryByRole("button", { name: RE_T5 })).toBeNull();
  });

  it("hides removal when the caller is not an admin", () => {
    show([makeTeamMember()], false);
    expect(screen.queryByRole("button", { name: RE_T6 })).toBeNull();
  });

  it("marks a member whose roles failed to load and offers no Give role there", () => {
    show([makeTeamMember({ grants: null })]);
    expect(
      screen.getByText(
        "We couldn't load this member's roles. Reload to try again."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Give role" })).toBeNull();
  });

  it("offers no Give role on owner and admin rows", () => {
    show([makeTeamMember({ role: "admin" })]);
    expect(screen.queryByRole("button", { name: "Give role" })).toBeNull();
  });
});

describe("TeamHelp", () => {
  it("states that revocation is not passed on", () => {
    render(<TeamHelp />);
    expect(screen.getByText(RE_T7)).toHaveTextContent(
      "what they gave stays until you take it away"
    );
  });
});
