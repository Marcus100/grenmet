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
const RE_GIVEN_BY = /^Given by /;

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

const viewerAdmin = { canRemove: true, isOwner: false };

function show(
  members: Parameters<typeof TeamMembers>[0]["members"],
  viewer = viewerAdmin,
  bundles = [
    makeBundle(),
    makeBundle({
      role_key: "events-till",
      label: "Box office",
      description: "Sell tickets at the outlet till.",
    }),
  ]
) {
  return render(
    <TeamFeedbackProvider>
      <TeamMembers
        bundles={bundles}
        members={members}
        today="2026-10-22"
        viewer={viewer}
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

  it("shows live roles with UTC end dates and a take-away button", () => {
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
        name: "Remove Ana Door from Events in this organisation",
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

  it("hides removal when the caller is not an admin or owner", () => {
    show([makeTeamMember()], { canRemove: false, isOwner: false });
    expect(screen.queryByRole("button", { name: RE_T6 })).toBeNull();
  });

  it("hides Take away, with the reason, for a role the caller does not hold", () => {
    show([makeTeamMember({ grants: [makeGrant()] })], viewerAdmin, [
      makeBundle({ grantable: false }),
    ]);
    expect(screen.queryByRole("button", { name: RE_T5 })).toBeNull();
    expect(
      screen.getByText(
        "You can't take this away because you don't hold it yourself."
      )
    ).toBeInTheDocument();
  });

  it("hides Remove on an owner row unless the caller is an owner", () => {
    const owner = makeTeamMember({ fullName: "Olu Owner", role: "owner" });
    const { unmount } = show([owner]);
    expect(screen.queryByRole("button", { name: RE_T6 })).toBeNull();
    unmount();
    show([owner], { canRemove: true, isOwner: true });
    expect(screen.getByRole("button", { name: RE_T6 })).toBeInTheDocument();
  });

  it("marks the viewer's own row and offers no change controls on it", () => {
    show([
      makeTeamMember({
        fullName: "Me Myself",
        isSelf: true,
        grants: [makeGrant()],
      }),
    ]);
    const row = screen.getByText("Me Myself").closest("li");
    if (!row) {
      throw new Error("row missing");
    }
    expect(within(row).getByText("(you)")).toBeInTheDocument();
    expect(
      within(row).getByText(
        "You can't change your own roles. Ask another team manager."
      )
    ).toBeInTheDocument();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(
      within(row).queryByText(
        "You can't take this away because you don't hold it yourself."
      )
    ).toBeNull();
  });

  it("keeps the controls on other members' rows", () => {
    show([makeTeamMember({ grants: [makeGrant()] })]);
    expect(screen.queryByText("(you)")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Give a role to Ana Door" })
    ).toBeInTheDocument();
  });

  it("says who gave a role, and nothing when the API does not know", () => {
    show([
      makeTeamMember({
        grants: [
          makeGrant(),
          makeGrant({
            id: "g2",
            role_key: "events-till",
            granted_by_name: null,
          }),
        ],
      }),
    ]);
    expect(screen.getAllByText(RE_GIVEN_BY)).toHaveLength(1);
    expect(screen.getByText("Given by Olu Owner.")).toBeInTheDocument();
  });

  it("names a role with the API bundle's label and description", () => {
    show([makeTeamMember({ grants: [makeGrant()] })], viewerAdmin, [
      makeBundle({
        label: "Door team",
        description: "Admit guests at the gate",
      }),
    ]);
    expect(screen.getByText("Door team")).toBeInTheDocument();
    expect(screen.getByText("Admit guests at the gate")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Take away Door team from Ana Door" })
    ).toBeInTheDocument();
  });

  it("offers no Give role on owner and admin rows", () => {
    show([makeTeamMember({ role: "admin" })]);
    expect(
      screen.queryByRole("button", { name: "Give a role to Ana Door" })
    ).toBeNull();
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
