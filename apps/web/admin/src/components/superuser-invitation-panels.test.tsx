// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InviteSuperuserForm } from "./superuser-invitation-panels";

vi.mock("@/app/(console)/superusers/actions", () => ({
  inviteSuperuserAction: vi.fn(),
  revokeSuperuserInvitationAction: vi.fn(),
}));

const RULE = /10 to 500 characters/u;

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
