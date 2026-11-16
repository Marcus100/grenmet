// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TYPED_MAX_LENGTH, TypedEntry } from "@/components/typed-entry";

afterEach(cleanup);

describe("TypedEntry", () => {
  it("starts in the number field, sized and set up for a numeric keypad", () => {
    render(
      <TypedEntry checking={false} onClose={vi.fn()} onSubmit={vi.fn()} open />
    );
    const field = screen.getByLabelText("Printed number");
    expect(document.activeElement).toBe(field);
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("maxlength", String(TYPED_MAX_LENGTH));
    expect(field).toHaveAttribute("placeholder", "e.g. 042…");
  });

  it("refuses an empty number and does not send it", () => {
    const onSubmit = vi.fn();
    render(
      <TypedEntry checking={false} onClose={vi.fn()} onSubmit={onSubmit} open />
    );
    fireEvent.click(screen.getByRole("button", { name: "Check ticket" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Type the printed number first."
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends the number without surrounding spaces", () => {
    const onSubmit = vi.fn();
    render(
      <TypedEntry checking={false} onClose={vi.fn()} onSubmit={onSubmit} open />
    );
    fireEvent.change(screen.getByLabelText("Printed number"), {
      target: { value: "  042 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check ticket" }));
    expect(onSubmit).toHaveBeenCalledWith("042");
  });

  it("closes on Escape and on Cancel", () => {
    const onClose = vi.fn();
    render(
      <TypedEntry checking={false} onClose={onClose} onSubmit={vi.fn()} open />
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not send a second number while a check is pending", () => {
    const onSubmit = vi.fn();
    render(<TypedEntry checking onClose={vi.fn()} onSubmit={onSubmit} open />);
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Printed number"), {
      target: { value: "042" },
    });
    fireEvent.submit(
      screen.getByRole("dialog").querySelector("form") ?? document.body
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    render(
      <TypedEntry
        checking={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        open={false}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
