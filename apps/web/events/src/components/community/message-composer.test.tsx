import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageComposer } from "./message-composer";

describe("MessageComposer", () => {
  it("is locked when the safety rule does not allow messaging", () => {
    render(<MessageComposer disabled />);
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("appends a sent message locally", () => {
    render(<MessageComposer disabled={false} />);
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "See you Thursday" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("See you Thursday")).toBeInTheDocument();
  });
});
