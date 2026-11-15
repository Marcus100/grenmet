// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  InviteSuperuserForm,
  PendingInvitations,
} from "./superuser-invitation-panels";

vi.mock("@/app/(console)/superusers/actions", () => ({
  inviteSuperuserAction: vi.fn(),
  revokeSuperuserInvitationAction: vi.fn(),
}));

const INVITATION = {
  id: "3f2b8c1e-9a4d-4e7f-8b2a-1c2d3e4f5a6b",
  email: "pending@example.org",
  reason: "Operations lead for the platform",
  invited_by_user_id: "7d9a1c2e-1111-4222-8333-444455556666",
  created_at: "2026-11-15T10:00:00Z",
  expires_at: "2026-11-16T10:00:00Z",
};

const EXPIRES = /^Expires /u;
const TOKEN_WORD = /token/iu;
const RULE = /10 to 500 characters/u;

describe("PendingInvitations", () => {
  it("shows the empty state instead of hiding the section", () => {
    render(<PendingInvitations invitations={[]} />);
    expect(screen.getByText("No pending invitations")).toBeInTheDocument();
  });

  it("lists each open invitation with its expiry and a Revoke action", () => {
    render(<PendingInvitations invitations={[INVITATION]} />);
    expect(screen.getByText("pending@example.org")).toBeInTheDocument();
    expect(screen.getByText(EXPIRES)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Revoke invitation for pending@example.org",
      })
    ).toBeInTheDocument();
  });

  it("never shows a token", () => {
    const { container } = render(
      <PendingInvitations invitations={[INVITATION]} />
    );
    expect(container.innerHTML).not.toMatch(TOKEN_WORD);
  });
});

describe("InviteSuperuserForm", () => {
  it("shows the reason rule and the character count", () => {
    render(<InviteSuperuserForm />);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Reason")).toBeInTheDocument();
    expect(screen.getByText(RULE)).toBeInTheDocument();
    expect(screen.getByText("0 of 500 characters")).toBeInTheDocument();
  });

  it("counts the reason as it is typed", () => {
    render(<InviteSuperuserForm />);
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Operations lead" },
    });
    expect(screen.getByText("15 of 500 characters")).toBeInTheDocument();
  });
});
