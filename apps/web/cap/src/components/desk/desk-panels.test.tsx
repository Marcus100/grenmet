import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { deskAlert } from "@/test/desk-alert.fixture";
import { DeskRefused, grenadaTime, SavedAlert } from "./desk-panels";

describe("desk panels render addresses in their own element (#1365)", () => {
  it("DeskRefused puts the signed-in address in its own element", () => {
    render(<DeskRefused email="meteorology@gaa.gd" />);
    const address = screen.getByText("meteorology@gaa.gd", {
      selector: "span",
    });
    expect(address.parentElement?.textContent).toBe(
      "meteorology@gaa.gd is signed in but does not hold CAP warning access. Ask a GMS administrator to give you a CAP role."
    );
  });

  it("SavedAlert puts the sender address in its own element", () => {
    const alert = deskAlert();
    render(<SavedAlert alert={alert} />);
    const sender = screen.getByText(alert.sender, { selector: "span" });
    expect(sender.parentElement?.textContent).toBe(
      `${alert.sender} · ${grenadaTime(alert.sent)}`
    );
  });
});
