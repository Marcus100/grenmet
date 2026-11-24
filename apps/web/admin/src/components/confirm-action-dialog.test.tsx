// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmActionDialog } from "./confirm-action-dialog";

function renderDialog(action: (formData: FormData) => Promise<void>) {
  render(
    <ConfirmActionDialog
      action={action}
      confirmLabel="Revoke invitation"
      description="Revoking stops it working at once."
      fields={{ invitation_id: "inv-1" }}
      title="Revoke this invitation?"
      triggerLabel="Revoke"
    />
  );
}

describe("ConfirmActionDialog", () => {
  it("asks first: nothing is submitted until the confirm button is pressed", () => {
    const action = vi.fn(() => Promise.resolve());
    renderDialog(action);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("submits the fields to the action and closes the dialog once it settles", async () => {
    const action = vi.fn((_formData: FormData) => Promise.resolve());
    renderDialog(action);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0]?.[0];
    expect(submitted?.get("invitation_id")).toBe("inv-1");
    // The action revalidates this same page, so the component stays mounted.
    // The dialog must not stay open over the result.
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
  });
});
