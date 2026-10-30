import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBundle, makeGrant } from "@/test/team-factories";
import { GrantRoleDialog } from "./grant-role-dialog";
import { RemoveMemberDialog } from "./remove-member-dialog";
import { RevokeGrantDialog } from "./revoke-grant-dialog";
import { TeamFeedbackProvider } from "./team-feedback";

const RE_T1 = /Door staff/;
const RE_T2 = /Refunds/;
const RE_T3 = /23:59 UTC/;
const RE_T4 = /no roles to give yet/;
const RE_T5 = /Roles they gave to other people stay/;
const RE_T6 = /Box office for Bo Till/;
const RE_T7 = /takes away nothing else/;
const RE_OWNER_ONLY = /Only an owner can remove an owner/;

const refresh = vi.fn();
const grantRole = vi.fn();
const revokeGrant = vi.fn();
const loadIssuedGrants = vi.fn();
const removeMember = vi.fn();

vi.mock("@/data/team-actions", () => ({
  grantRole: (...a: unknown[]) => grantRole(...a),
  revokeGrant: (...a: unknown[]) => revokeGrant(...a),
  loadIssuedGrants: (...a: unknown[]) => loadIssuedGrants(...a),
  removeMember: (...a: unknown[]) => removeMember(...a),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash/team",
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const RE_REVIEW = /Review/;
const RE_NOT_HELD = /you don't hold it yourself/;
const RE_ALREADY = /already have this role/;
const RE_ENDS = /23:59 UTC on 2999-01-01/;
const RE_SCAN = /Scan and admit tickets at the door/;

const bundles = [
  makeBundle(),
  makeBundle({
    role_key: "events-refunds",
    label: "Refunds",
    description: "Issue refunds to ticket buyers.",
    permissions: ["events.refunds.issue"],
    grantable: false,
  }),
];

function renderGrant(held: string[] = []) {
  return render(
    <TeamFeedbackProvider>
      <GrantRoleDialog
        bundles={bundles}
        heldRoleKeys={held}
        memberName="Ana Door"
        membershipId="mem_1"
        today="2026-10-22"
      />
    </TeamFeedbackProvider>
  );
}

async function openGrant() {
  fireEvent.click(
    screen.getByRole("button", { name: "Give a role to Ana Door" })
  );
  await screen.findByRole("heading", { name: "Give a role to Ana Door" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GrantRoleDialog", () => {
  it("offers bundles by friendly name, disables ones the caller does not hold, and labels the UTC date", async () => {
    renderGrant(["events-door"]);
    await openGrant();
    expect(screen.getByRole("radio", { name: RE_T1 })).toBeDisabled();
    expect(screen.getByText(RE_ALREADY)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: RE_T2 })).toBeDisabled();
    expect(screen.getByText(RE_NOT_HELD)).toBeInTheDocument();
    expect(screen.getByLabelText("Ends on (optional)")).toHaveAttribute(
      "min",
      "2026-10-22"
    );
    expect(screen.getByText(RE_T3)).toBeInTheDocument();
  });

  it("asks for a role before reviewing", async () => {
    renderGrant();
    await openGrant();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: RE_REVIEW })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: RE_REVIEW }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a role");
    expect(grantRole).not.toHaveBeenCalled();
  });

  it("explains what the role allows, then sends it and confirms", async () => {
    grantRole.mockResolvedValue({ ok: true, data: makeGrant() });
    renderGrant();
    await openGrant();
    fireEvent.click(screen.getByRole("radio", { name: RE_T1 }));
    fireEvent.change(screen.getByLabelText("Ends on (optional)"), {
      target: { value: "2999-01-01" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: RE_REVIEW })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: RE_REVIEW }));
    expect(screen.getByText(RE_SCAN)).toBeInTheDocument();
    expect(screen.getByText(RE_ENDS)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and give role" })
    );
    await waitFor(() =>
      expect(grantRole).toHaveBeenCalledWith({
        membershipId: "mem_1",
        roleKey: "events-door",
        expiresOn: "2999-01-01",
      })
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Ana Door now has the Door staff role."
      )
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the typed values and shows the API's refusal after a conflict", async () => {
    grantRole.mockResolvedValue({
      ok: false,
      error: "That member already holds this role",
    });
    renderGrant();
    await openGrant();
    fireEvent.click(screen.getByRole("radio", { name: RE_T1 }));
    fireEvent.change(screen.getByLabelText("Ends on (optional)"), {
      target: { value: "2999-01-01" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: RE_REVIEW })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: RE_REVIEW }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and give role" })
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("already holds")
    );
    expect(screen.getByRole("radio", { name: RE_T1 })).toBeChecked();
    expect(screen.getByLabelText("Ends on (optional)")).toHaveValue(
      "2999-01-01"
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says so when there are no roles to give", async () => {
    render(
      <TeamFeedbackProvider>
        <GrantRoleDialog
          bundles={[]}
          heldRoleKeys={[]}
          memberName="Ana Door"
          membershipId="mem_1"
          today="2026-10-22"
        />
      </TeamFeedbackProvider>
    );
    await openGrant();
    expect(screen.getByText(RE_T4)).toBeInTheDocument();
  });
});

describe("RevokeGrantDialog", () => {
  it("confirms, revokes and tells the person the roles they passed on stay", async () => {
    revokeGrant.mockResolvedValue({ ok: true, data: makeGrant() });
    render(
      <TeamFeedbackProvider>
        <RevokeGrantDialog grant={makeGrant()} memberName="Ana Door" />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Take away Door staff from Ana Door" })
    );
    expect(await screen.findByText(RE_T5)).toBeInTheDocument();
    expect(revokeGrant).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Take away role" }));
    await waitFor(() =>
      expect(revokeGrant).toHaveBeenCalledWith({ grantId: "grant_1" })
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Door staff was taken away from Ana Door."
      )
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a refusal inside the dialog", async () => {
    revokeGrant.mockResolvedValue({
      ok: false,
      error: "You can only change roles whose permissions you hold yourself",
    });
    render(
      <TeamFeedbackProvider>
        <RevokeGrantDialog grant={makeGrant()} memberName="Ana Door" />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Take away Door staff from Ana Door" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Take away role" })
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("alert")
          .map((a) => a.textContent)
          .join("")
      ).toContain("hold yourself")
    );
  });
});

describe("RemoveMemberDialog", () => {
  it("lists the roles that removal will take away", async () => {
    loadIssuedGrants.mockResolvedValue({
      ok: true,
      data: [makeGrant({ member_name: "Bo Till", role_key: "events-till" })],
    });
    render(
      <TeamFeedbackProvider>
        <RemoveMemberDialog
          memberName="Lena Lead"
          membershipId="mem_2"
          targetRole="member"
        />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Lena Lead from Events in this organisation",
      })
    );
    expect(await screen.findByText(RE_T6)).toBeInTheDocument();
    expect(loadIssuedGrants).toHaveBeenCalledWith({ membershipId: "mem_2" });
  });

  it("says the Events access in this organisation was removed", async () => {
    loadIssuedGrants.mockResolvedValue({ ok: true, data: [] });
    removeMember.mockResolvedValue({ ok: true, data: "events" });
    render(
      <TeamFeedbackProvider>
        <RemoveMemberDialog
          memberName="Lena Lead"
          membershipId="mem_2"
          targetRole="member"
        />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Lena Lead from Events in this organisation",
      })
    );
    expect(await screen.findByText(RE_T7)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Lena Lead was removed from Events in this organisation."
      )
    );
  });

  it("says a full removal left the organisation", async () => {
    loadIssuedGrants.mockResolvedValue({ ok: true, data: [] });
    removeMember.mockResolvedValue({ ok: true, data: "organisation" });
    render(
      <TeamFeedbackProvider>
        <RemoveMemberDialog
          memberName="Lena Lead"
          membershipId="mem_2"
          targetRole="member"
        />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Lena Lead from Events in this organisation",
      })
    );
    expect(await screen.findByText(RE_T7)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Lena Lead was removed from the organisation."
      )
    );
  });

  it("says nothing else is revoked when they issued nothing, then removes", async () => {
    loadIssuedGrants.mockResolvedValue({ ok: true, data: [] });
    removeMember.mockResolvedValue({ ok: true, data: "events" });
    render(
      <TeamFeedbackProvider>
        <RemoveMemberDialog
          memberName="Lena Lead"
          membershipId="mem_2"
          targetRole="member"
        />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Lena Lead from Events in this organisation",
      })
    );
    expect(await screen.findByText(RE_T7)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    await waitFor(() =>
      expect(removeMember).toHaveBeenCalledWith({ membershipId: "mem_2" })
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Lena Lead was removed from Events in this organisation."
      )
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an error if the issued roles cannot be loaded", async () => {
    loadIssuedGrants.mockResolvedValue({ ok: false, error: "Not for you" });
    render(
      <TeamFeedbackProvider>
        <RemoveMemberDialog
          memberName="Lena Lead"
          membershipId="mem_2"
          targetRole="member"
        />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Lena Lead from Events in this organisation",
      })
    );
    expect(await screen.findByText("Not for you")).toBeInTheDocument();
  });

  it("keeps Remove disabled while the preview loads, never reading Removing", async () => {
    loadIssuedGrants.mockReturnValue(new Promise(() => undefined));
    render(
      <TeamFeedbackProvider>
        <RemoveMemberDialog
          memberName="Lena Lead"
          membershipId="mem_2"
          targetRole="member"
        />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Lena Lead from Events in this organisation",
      })
    );
    const button = await screen.findByRole("button", { name: "Remove member" });
    expect(button).toBeDisabled();
  });

  it("keeps Remove disabled after a failed preview and retries on Try again", async () => {
    loadIssuedGrants.mockResolvedValueOnce({ ok: false, error: "Not for you" });
    render(
      <TeamFeedbackProvider>
        <RemoveMemberDialog
          memberName="Lena Lead"
          membershipId="mem_2"
          targetRole="member"
        />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Lena Lead from Events in this organisation",
      })
    );
    await screen.findByText("Not for you");
    expect(
      screen.getByRole("button", { name: "Remove member" })
    ).toBeDisabled();
    loadIssuedGrants.mockResolvedValueOnce({ ok: true, data: [] });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText(RE_T7);
    expect(screen.getByRole("button", { name: "Remove member" })).toBeEnabled();
  });

  it("words the owner-only refusal when removing an owner", async () => {
    loadIssuedGrants.mockResolvedValue({ ok: true, data: [] });
    removeMember.mockResolvedValue({
      ok: false,
      error: "Your role in this organisation does not allow this",
    });
    render(
      <TeamFeedbackProvider>
        <RemoveMemberDialog
          memberName="Olu Owner"
          membershipId="mem_3"
          targetRole="owner"
        />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Olu Owner from Events in this organisation",
      })
    );
    await screen.findByText(RE_T7);
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    expect(await screen.findByText(RE_OWNER_ONLY)).toBeInTheDocument();
  });

  it("shows the API's refusal when the person's Events access comes from an admin or owner role", async () => {
    const message =
      "This person's Events access comes from their organisation role (admin/owner). Change their role in organisation settings to remove it.";
    loadIssuedGrants.mockResolvedValue({ ok: true, data: [] });
    removeMember.mockResolvedValue({ ok: false, error: message });
    render(
      <TeamFeedbackProvider>
        <RemoveMemberDialog
          memberName="Ada Admin"
          membershipId="mem_4"
          targetRole="admin"
        />
      </TeamFeedbackProvider>
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Ada Admin from Events in this organisation",
      })
    );
    await screen.findByText(RE_T7);
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("GrantRoleDialog alert", () => {
  it("has one alert node across both steps, focuses it on every refusal, and keeps the choice on close", async () => {
    grantRole.mockResolvedValue({ ok: false, error: "Same refusal" });
    renderGrant();
    await openGrant();
    const alerts = () =>
      screen
        .getAllByRole("alert")
        .filter((node) => node.closest("[role=dialog]"));
    expect(alerts()).toHaveLength(1);
    fireEvent.click(screen.getByRole("radio", { name: RE_T1 }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: RE_REVIEW }).hasAttribute("disabled")
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: RE_REVIEW }));
    expect(alerts()).toHaveLength(1);
    for (let attempt = 0; attempt < 2; attempt++) {
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm and give role" })
      );
      await waitFor(() =>
        expect(alerts()[0]).toHaveTextContent("Same refusal")
      );
      await waitFor(() => expect(alerts()[0]).toHaveFocus());
      (document.activeElement as HTMLElement).blur();
      fireEvent.click(screen.getByRole("button", { name: RE_REVIEW }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await openGrant();
    expect(alerts()[0]).toHaveTextContent("");
    expect(screen.getByRole("radio", { name: RE_T1 })).toBeChecked();
  });
});
