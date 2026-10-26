import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RaiseToWarningDialog } from "./raise-to-warning-dialog";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

it("raises the chosen colour and opens the CAP composer on the new draft", async () => {
  const onRaise = vi.fn().mockResolvedValue({ alertId: "alert-1" });
  const onOpenChange = vi.fn();
  render(
    <RaiseToWarningDialog onOpenChange={onOpenChange} onRaise={onRaise} open />
  );
  fireEvent.click(screen.getByLabelText("orange"));
  fireEvent.click(screen.getByRole("button", { name: "Raise to warning" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/cap/admin/alert-1"));
  expect(onRaise).toHaveBeenCalledWith("orange");
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("stays open and shows the error when the warning draft cannot be made", async () => {
  push.mockClear();
  const onRaise = vi.fn().mockResolvedValue({ error: "No CAP permission" });
  render(
    <RaiseToWarningDialog onOpenChange={vi.fn()} onRaise={onRaise} open />
  );
  fireEvent.click(screen.getByRole("button", { name: "Raise to warning" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No CAP permission"
  );
  expect(push).not.toHaveBeenCalled();
});
