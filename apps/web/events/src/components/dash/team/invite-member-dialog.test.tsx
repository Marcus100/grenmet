import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteMemberDialog } from "./invite-member-dialog";
import { TeamFeedbackProvider } from "./team-feedback";

const inviteMember = vi.fn();

vi.mock("@/data/team-actions", () => ({
  inviteMember: (...a: unknown[]) => inviteMember(...a),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash/team",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Invite member" }));
}

function renderDialog(canInviteOwner: boolean) {
  return render(
    <TeamFeedbackProvider>
      <InviteMemberDialog canInviteOwner={canInviteOwner} />
    </TeamFeedbackProvider>
  );
}

beforeEach(() => {
  inviteMember.mockReset();
});

describe("InviteMemberDialog", () => {
  it("sends the trimmed address with the chosen role and confirms it", async () => {
    inviteMember.mockResolvedValue({ ok: true, data: {} });
    renderDialog(false);
    openDialog();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "  ada@example.test " },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(inviteMember).toHaveBeenCalledWith({
      email: "ada@example.test",
      role: "admin",
    });
    await waitFor(() =>
      expect(
        screen.getByText("Invitation sent to ada@example.test.")
      ).toBeInTheDocument()
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the API's refusal in the dialog and keeps what was typed", async () => {
    inviteMember.mockResolvedValue({
      ok: false,
      error: "That person is already a member",
    });
    renderDialog(false);
    openDialog();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "That person is already a member"
      )
    );
    expect(screen.getByLabelText("Email address")).toHaveValue(
      "ada@example.test"
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offers Owner only to an owner", () => {
    renderDialog(false);
    openDialog();
    const roles = screen.getByLabelText("Role");
    expect(roles.querySelectorAll("option").length).toBe(2);
    expect(screen.queryByRole("option", { name: "Owner" })).toBeNull();
  });

  it("offers Owner to an owner", () => {
    renderDialog(true);
    openDialog();
    expect(screen.getByRole("option", { name: "Owner" })).toBeInTheDocument();
  });
});
