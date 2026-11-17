// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet";

afterEach(cleanup);

/** jsdom never finishes the closing slide, so "closed" means data-state. */
function openSheet(): HTMLElement | null {
  const sheet = screen.queryByRole("dialog", { hidden: true });
  return sheet?.getAttribute("data-state") === "open" ? sheet : null;
}

function Harness({ onClose = vi.fn() }: { readonly onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open
      </button>
      <Sheet
        initialFocus={field}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        open={open}
        title="Type a number"
      >
        <input aria-label="Number" ref={field} />
        <button onClick={() => setOpen(false)} type="button">
          Done
        </button>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("renders nothing while closed", () => {
    render(<Harness />);
    expect(openSheet()).toBeNull();
  });

  it("opens labelled by its title, with focus in the chosen field", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const sheet = openSheet();
    expect(sheet).not.toBeNull();
    expect(sheet).toHaveAccessibleName("Type a number");
    expect(document.activeElement).toBe(screen.getByLabelText("Number"));
  });

  it("closes on Escape and tells the parent", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.keyDown(screen.getByLabelText("Number"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(openSheet()).toBeNull();
  });

  it("starts each opening with fresh contents", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.change(screen.getByLabelText("Number"), {
      target: { value: "042" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Open", hidden: true }));
    expect(screen.getByLabelText("Number")).toHaveValue("");
  });
});
