import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { keepValuesOnSubmit } from "./keep-values";

describe("keepValuesOnSubmit", () => {
  it("sends the form values and the named submit button, and never resets", async () => {
    const send = vi.fn();
    render(
      <form onSubmit={keepValuesOnSubmit(send)}>
        <input aria-label="Name" defaultValue="" name="name" />
        <button name="intent" type="submit" value="save">
          Save
        </button>
      </form>
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    const data = send.mock.calls[0]?.[0] as FormData;
    expect(data.get("name")).toBe("Ada");
    expect(data.get("intent")).toBe("save");
    expect(screen.getByLabelText("Name")).toHaveValue("Ada");
  });
});
