import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TimesheetEditor } from "./timesheet-editor";

const ADD_ENTRY = /add entry/i;

describe("TimesheetEditor", () => {
  it("adds timesheet entries through the array field", async () => {
    const user = userEvent.setup();
    render(<TimesheetEditor />);

    expect(screen.queryByText("Entry 1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: ADD_ENTRY }));
    expect(screen.getByText("Entry 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: ADD_ENTRY }));
    expect(screen.getByText("Entry 2")).toBeInTheDocument();
  });

  it("mirrors the department field into the preview document", async () => {
    const user = userEvent.setup();
    render(<TimesheetEditor />);

    await user.type(screen.getByLabelText("Department"), "Meteorology");

    expect(screen.getAllByText("Meteorology").length).toBeGreaterThanOrEqual(1);
  });
});
