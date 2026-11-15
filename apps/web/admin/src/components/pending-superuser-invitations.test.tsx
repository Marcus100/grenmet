// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PendingInvitations } from "./pending-superuser-invitations";

vi.mock("@/app/(console)/superusers/actions", () => ({
  revokeSuperuserInvitationAction: vi.fn(),
}));

const EXPIRES = /^Expires /u;
const TOKEN_WORD = /token/iu;
const UNDONE = /cannot be undone/u;

const INVITATION = {
  id: "3f2b8c1e-9a4d-4e7f-8b2a-1c2d3e4f5a6b",
  email: "pending@example.org",
  reason: "Operations lead for the platform",
  invited_by_user_id: "7d9a1c2e-1111-4222-8333-444455556666",
  created_at: "2026-11-15T10:00:00Z",
  expires_at: "2026-11-16T10:00:00Z",
};

describe("PendingInvitations", () => {
  it("shows the empty state instead of hiding the section", () => {
    render(<PendingInvitations invitations={[]} />);
    expect(screen.getByText("No pending invitations")).toBeInTheDocument();
  });

  it("lists each open invitation with its expiry", () => {
    render(<PendingInvitations invitations={[INVITATION]} />);
    expect(screen.getByText("pending@example.org")).toBeInTheDocument();
    expect(screen.getByText(EXPIRES)).toBeInTheDocument();
  });

  it("asks for confirmation before revoking, in the same form as API keys", () => {
    render(<PendingInvitations invitations={[INVITATION]} />);
    expect(screen.getByText("Revoke")).toBeInTheDocument();
    expect(screen.getByText(UNDONE)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm revoke" })
    ).toBeInTheDocument();
  });

  it("never shows a token", () => {
    const { container } = render(
      <PendingInvitations invitations={[INVITATION]} />
    );
    expect(container.innerHTML).not.toMatch(TOKEN_WORD);
  });
});
