// @vitest-environment jsdom
import type { UserProfilePublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UserAddressCard from "./UserAddressCard";
import UserInfoCard from "./UserInfoCard";

const EDIT_BUTTON = /Edit/;
const profile: UserProfilePublic = {
  id: "staff",
  identity: { username: "staff", email: "staff@example.com", status: "ACTIVE" },
  profile: { first_name: "Test", last_name: "Staff" },
  address: { line_1: "Old Road", country: "Grenada" },
  emergency_contact: {},
  employment: {},
  roster_preferences: {},
  leave: {},
  approval_authority: {},
  audit: {},
};
describe("inline profile editing", () => {
  it("saves personal information using the existing profile payload", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<UserInfoCard isSaving={false} onSave={save} profile={profile} />);
    fireEvent.click(screen.getByRole("button", { name: EDIT_BUTTON }));
    fireEvent.change(screen.getByLabelText("First Name"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(
      await screen.findByRole("button", { name: EDIT_BUTTON })
    ).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          first_name: "Updated",
          last_name: "Staff",
        }),
      })
    );
  });

  it("keeps address focus and the same input while typing", () => {
    render(
      <UserAddressCard isSaving={false} onSave={vi.fn()} profile={profile} />
    );
    fireEvent.click(screen.getByRole("button", { name: EDIT_BUTTON }));
    const input = screen.getByDisplayValue("Old Road");
    input.focus();
    fireEvent.change(input, { target: { value: "Old Road A" } });
    expect(screen.getByDisplayValue("Old Road A")).toBe(input);
    expect(input).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps failed address edits available for retry", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(undefined);
    render(
      <UserAddressCard isSaving={false} onSave={save} profile={profile} />
    );
    fireEvent.click(screen.getByRole("button", { name: EDIT_BUTTON }));
    fireEvent.change(screen.getByDisplayValue("Old Road"), {
      target: { value: "New Road" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to save"
    );
    expect(screen.getByDisplayValue("New Road")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(
      await screen.findByRole("button", { name: EDIT_BUTTON })
    ).toBeInTheDocument();
    expect(save).toHaveBeenLastCalledWith({
      address: {
        line_1: "New Road",
        line_2: null,
        city: null,
        parish: null,
        postal_code: null,
        country: "Grenada",
      },
    });
  });
  it("edits personal information inline and cancels unsaved changes", () => {
    render(
      <UserInfoCard isSaving={false} onSave={vi.fn()} profile={profile} />
    );
    fireEvent.click(screen.getByRole("button", { name: EDIT_BUTTON }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Test"), {
      target: { value: "Unsaved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: EDIT_BUTTON }));
    expect(screen.getByDisplayValue("Test")).toBeInTheDocument();
  });
});
