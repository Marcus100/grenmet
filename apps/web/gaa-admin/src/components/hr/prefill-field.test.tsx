import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PrefillInput } from "./prefill-field";

it("locks a value that came from the staff profile and names its source", () => {
  render(
    <PrefillInput
      id="department"
      label="Department"
      locked
      onChange={vi.fn()}
      value="Meteorology"
    />
  );
  expect(screen.getByLabelText("Department")).toHaveAttribute("readonly");
  expect(screen.getByText("From your staff profile")).toBeInTheDocument();
});

it("stays editable with no hint when the profile has no value", () => {
  render(
    <PrefillInput
      id="department"
      label="Department"
      locked
      onChange={vi.fn()}
      value=""
    />
  );
  expect(screen.getByLabelText("Department")).not.toHaveAttribute("readonly");
  expect(screen.queryByText("From your staff profile")).toBeNull();
});
