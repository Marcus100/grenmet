import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deskSettings } from "@/test/desk-settings.fixture";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const actions = vi.hoisted(() => ({ saveCapSettings: vi.fn() }));
vi.mock("@/app/desk/settings/actions", () => actions);

import { SettingsForm } from "./settings-form";

const REVIEW_BUTTON = /review and save/i;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SettingsForm", () => {
  it("asks for confirmation before saving and does not call the server", () => {
    render(<SettingsForm initial={deskSettings()} />);
    fireEvent.click(screen.getByRole("button", { name: REVIEW_BUTTON }));
    expect(
      screen.getByRole("heading", { name: "Save these CAP settings?" })
    ).toBeInTheDocument();
    expect(actions.saveCapSettings).not.toHaveBeenCalled();
  });

  it("keeps the form open when the user chooses to keep editing", () => {
    render(<SettingsForm initial={deskSettings()} />);
    fireEvent.click(screen.getByRole("button", { name: REVIEW_BUTTON }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(actions.saveCapSettings).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Sender name")).toBeInTheDocument();
  });

  it("saves the reviewed values after confirmation and reports success", async () => {
    actions.saveCapSettings.mockResolvedValue({
      data: deskSettings(),
      ok: true,
    });
    render(<SettingsForm initial={deskSettings()} />);
    fireEvent.change(screen.getByLabelText("Contact"), {
      target: { value: "  duty@example.test " },
    });
    fireEvent.click(screen.getByRole("button", { name: REVIEW_BUTTON }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "CAP settings saved."
      )
    );
    expect(actions.saveCapSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: "duty@example.test",
        sender: "gms.gd",
        web: "https://gms.example.test",
        wmo_oid: null,
      })
    );
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows a plain error and keeps the values when the save is refused", async () => {
    actions.saveCapSettings.mockResolvedValue({
      error: {
        items: [],
        kind: "not-allowed",
        status: 403,
        title: "You do not have permission for this action.",
      },
      ok: false,
    });
    render(<SettingsForm initial={deskSettings()} />);
    fireEvent.click(screen.getByRole("button", { name: REVIEW_BUTTON }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(
      await screen.findByText("You do not have permission for this action.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Sender name")).toHaveValue(
      "Grenada Meteorological Service"
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
