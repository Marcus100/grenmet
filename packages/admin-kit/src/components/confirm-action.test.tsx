import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ConfirmAction } from "./confirm-action";

const RE_0 = /Reason/u;

function setup(
  onConfirm = vi.fn(() => ({ ok: true, message: "Booking cancelled." }))
) {
  render(
    <ConfirmAction
      confirmLabel="Cancel booking"
      description="The customer will be told by email."
      destructive
      onConfirm={onConfirm}
      reason={{ label: "Reason", required: true }}
      title="Cancel this booking?"
      triggerLabel="Cancel"
    />
  );
  return onConfirm;
}

describe("ConfirmAction", () => {
  it("does nothing until the person confirms", async () => {
    const onConfirm = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Cancel this booking?",
    });
    expect(dialog).toHaveTextContent("The customer will be told by email.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("holds the confirm button until a required reason is given", async () => {
    const onConfirm = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const confirm = await screen.findByRole("button", {
      name: "Cancel booking",
    });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(RE_0), "Customer asked");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Customer asked" });
  });

  it("shows the result as a written notice", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.type(await screen.findByLabelText(RE_0), "x");
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel booking" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Booking cancelled."
    );
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("shows a failure as an alert and lets the person try again", async () => {
    const onConfirm = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "Could not cancel." })
      .mockResolvedValueOnce({ ok: true, message: "Done." });
    setup(onConfirm);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.type(await screen.findByLabelText(RE_0), "x");
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel booking" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not cancel."
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel booking" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Done.");
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("never submits twice while pending", async () => {
    let finish: (value: { ok: boolean; message: string }) => void = () =>
      undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<{ ok: boolean; message: string }>((resolve) => {
          finish = resolve;
        })
    );
    setup(onConfirm as never);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.type(await screen.findByLabelText(RE_0), "x");
    const confirm = screen.getByRole("button", { name: "Cancel booking" });
    await userEvent.click(confirm);
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    finish({ ok: true, message: "Done." });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("works without a reason field", async () => {
    const onConfirm = vi.fn(() => ({ ok: true, message: "Saved." }));
    render(
      <ConfirmAction
        confirmLabel="Remove"
        description="Gone for good."
        onConfirm={onConfirm}
        title="Remove?"
        triggerLabel="Remove item"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove item" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove" })
    );
    expect(onConfirm).toHaveBeenCalledWith({ reason: "" });
    expect(screen.queryByLabelText(RE_0)).toBeNull();
  });
});

describe("ConfirmAction errors", () => {
  it("lets an unexpected error reach the app's error boundary", async () => {
    const uncaught: unknown[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container, {
      onUncaughtError: (error) => uncaught.push(error),
    });
    act(() => {
      root.render(
        <ConfirmAction
          confirmLabel="Go"
          description="Do it."
          onConfirm={() => Promise.reject(new Error("boom"))}
          title="Go?"
          triggerLabel="Open"
        />
      );
    });
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(await screen.findByRole("button", { name: "Go" }));
    await waitFor(() => expect(uncaught).toHaveLength(1));
    expect((uncaught[0] as Error).message).toBe("boom");
    act(() => root.unmount());
    container.remove();
  });
});
