import type { CapProfilePublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const action = vi.hoisted(() => ({ approveHazardProfileAction: vi.fn() }));
vi.mock("@/app/desk/profiles/actions", () => action);

import { ProfileApproval } from "./profile-approval";

const AUTHOR = "aaaaaaaa-0000-4000-8000-000000000001";
const REVIEWER = "bbbbbbbb-0000-4000-8000-000000000002";
const ALL = { approve: true, libraryManage: true };
const APPROVE_BUTTON = /Approve version/;
const CONFIRM_TEXT = /Your name is recorded as the approver/;
const AUTHOR_NOTE =
  "You wrote this version. A different reviewer must approve it.";

function draft(overrides: Partial<CapProfilePublic> = {}): CapProfilePublic {
  return {
    approval_errors: [],
    approved_at: null,
    approved_by: null,
    created_at: "2026-10-01T10:00:00Z",
    created_by: AUTHOR,
    definition: { name: "Flood" },
    id: "11111111-2222-4333-8444-555555555555",
    key: "flood",
    state: "DRAFT",
    version: 2,
    ...overrides,
  } as unknown as CapProfilePublic;
}

describe("ProfileApproval", () => {
  beforeEach(() => {
    router.refresh.mockReset();
    action.approveHazardProfileAction.mockReset();
  });

  it("explains plainly why a non-reviewer cannot approve", () => {
    render(
      <ProfileApproval
        permissions={{ approve: false, libraryManage: true }}
        profile={draft()}
        userId={REVIEWER}
      />
    );
    expect(
      screen.getByText(
        "You need both library and approval access to approve a hazard profile."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: APPROVE_BUTTON })).toBeNull();
  });

  it("does not offer the author's own version", () => {
    render(
      <ProfileApproval permissions={ALL} profile={draft()} userId={AUTHOR} />
    );
    expect(screen.getByText(AUTHOR_NOTE)).toBeInTheDocument();
  });

  it("needs an explicit confirm before any approval is sent", async () => {
    action.approveHazardProfileAction.mockResolvedValue({
      ok: true,
      profile: draft({ state: "APPROVED" }),
    });
    render(
      <ProfileApproval permissions={ALL} profile={draft()} userId={REVIEWER} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve version 2" }));
    expect(await screen.findByText(CONFIRM_TEXT)).toBeInTheDocument();
    expect(action.approveHazardProfileAction).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Yes, approve version 2" })
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(action.approveHazardProfileAction).toHaveBeenCalledWith({
      profileId: "11111111-2222-4333-8444-555555555555",
    });
  });

  it("shows the server refusal and keeps the dialog open", async () => {
    action.approveHazardProfileAction.mockResolvedValue({
      error: {
        items: ["The profile changed."],
        kind: "state",
        status: 409,
        title: "The alert is no longer in a state that allows this. Reload it.",
      },
      ok: false,
    });
    render(
      <ProfileApproval permissions={ALL} profile={draft()} userId={REVIEWER} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve version 2" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Yes, approve version 2" })
    );
    expect(await screen.findByText("The profile changed.")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
