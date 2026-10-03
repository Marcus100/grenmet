import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WarningLevelPicker } from "./warning-level-picker";

describe("WarningLevelPicker", () => {
  it("offers the four GMS products", () => {
    render(
      <WarningLevelPicker colour={null} onChange={vi.fn()} product={null} />
    );
    for (const name of [
      "Outlook",
      "Watch",
      "Warning",
      "Small Craft Advisory",
    ]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("radio", { name: "Orange" })
    ).not.toBeInTheDocument();
  });

  it("shows the four colours for a Watch and names the CAP severity", () => {
    render(
      <WarningLevelPicker colour="orange" onChange={vi.fn()} product="Watch" />
    );
    for (const name of ["Green", "Yellow", "Orange", "Red"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByText("Sets CAP severity to Severe.")
    ).toBeInTheDocument();
  });

  it("drops the colour when switching to an Outlook", async () => {
    const onChange = vi.fn();
    render(
      <WarningLevelPicker colour="red" onChange={onChange} product="Warning" />
    );
    await userEvent.click(screen.getByRole("radio", { name: "Outlook" }));
    expect(onChange).toHaveBeenCalledWith("Outlook", null);
  });

  it("hides colours for an Outlook and explains why", () => {
    render(
      <WarningLevelPicker colour={null} onChange={vi.fn()} product="Outlook" />
    );
    expect(
      screen.queryByRole("radio", { name: "Red" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "An Outlook is an early heads-up: no colour is assigned yet. The website shows it in neutral blue, never as a warning colour."
      )
    ).toBeInTheDocument();
  });

  it("reports the chosen colour with the current product", async () => {
    const onChange = vi.fn();
    render(
      <WarningLevelPicker colour={null} onChange={onChange} product="Watch" />
    );
    await userEvent.click(screen.getByRole("radio", { name: "Yellow" }));
    expect(onChange).toHaveBeenCalledWith("Watch", "yellow");
  });
});
