import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ABOUT_MAX } from "@/lib/about-text";
import { AboutField } from "./about-field";

describe("the about field", () => {
  it("is a named textarea that starts from the stored text", () => {
    render(<AboutField initial={"We braid hair.\nSince 2004."} />);
    const field = screen.getByLabelText("About text");
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toHaveAttribute("name", "about");
    expect(field).toHaveValue("We braid hair.\nSince 2004.");
  });

  it("counts what is typed against the limit the API enforces", () => {
    render(<AboutField initial={null} />);
    expect(screen.getByText(`0 of ${ABOUT_MAX} characters`)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("About text"), {
      target: { value: "Hello" },
    });
    expect(screen.getByText(`5 of ${ABOUT_MAX} characters`)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when the text is too long", () => {
    render(<AboutField initial={"a".repeat(ABOUT_MAX + 1)} />);
    expect(screen.getByRole("alert").textContent).toContain(
      `Shorten it to ${ABOUT_MAX} characters`
    );
    expect(screen.getByLabelText("About text")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });
});
