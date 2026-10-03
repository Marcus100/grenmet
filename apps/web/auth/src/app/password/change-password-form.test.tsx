// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { changeAccountPassword } from "../security/actions";
import { ChangePasswordForm } from "./change-password-form";

vi.mock("../security/actions", () => ({ changeAccountPassword: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ChangePasswordForm", () => {
  it("requires matching passwords, then sends the user to sign in", async () => {
    vi.mocked(changeAccountPassword).mockResolvedValue(undefined);
    render(<ChangePasswordForm />);
    fill("Current password", "old-password-123");
    fill("New password", "new-password-4567");
    fill("Confirm new password", "different-password");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "New passwords must match."
    );
    expect(changeAccountPassword).not.toHaveBeenCalled();

    fill("Confirm new password", "new-password-4567");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() =>
      expect(changeAccountPassword).toHaveBeenCalledWith(
        "old-password-123",
        "new-password-4567"
      )
    );
    expect(
      await screen.findByRole("link", {
        name: "Sign in with your new password",
      })
    ).toHaveAttribute("href", "/");
  });
});
