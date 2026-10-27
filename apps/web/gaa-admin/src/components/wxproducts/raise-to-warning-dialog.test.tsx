import { configureApiClient } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { RaiseToWarningDialog } from "./raise-to-warning-dialog";

const RE_REASON_FOR_CHOOSING = /Reason for choosing/;
const RE_REASON = /Reason for choosing a different colour/;
const RE_INTERNAL_ONLY = /Internal only/;
const RE_OPTIONAL_REASON = /Reason for choosing this colour \(optional\)/;

const server = setupServer(
  http.get("http://localhost/api/v1/cap/ibf/suggest", () =>
    HttpResponse.json({
      colour: "orange",
      meaning: "Be prepared",
      likelihood: "Medium",
      impact: "Significant",
      percent: 60,
      severity: "Severe",
      awareness_level: "3; orange; Severe",
      available: false,
    })
  )
);
beforeAll(() => {
  configureApiClient({ baseURL: "http://localhost" });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
  expect(onRaise).toHaveBeenCalledWith("orange", undefined);
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

it("tells the user an open warning exists and offers to open it", async () => {
  push.mockClear();
  const onRaise = vi.fn().mockResolvedValue({
    error:
      "An open warning already exists for this alert; change its colour in CAP.",
    existingAlertId: "alert-9",
  });
  render(
    <RaiseToWarningDialog onOpenChange={vi.fn()} onRaise={onRaise} open />
  );
  fireEvent.click(screen.getByRole("button", { name: "Raise to warning" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "An open warning already exists"
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Open the existing warning draft" })
  );
  expect(push).toHaveBeenCalledWith("/cap/admin/alert-9");
});

it("pre-selects the matrix colour and needs no reason while it is kept", async () => {
  push.mockClear();
  const onRaise = vi.fn().mockResolvedValue({ alertId: "alert-2" });
  render(
    <RaiseToWarningDialog
      impact="Significant"
      kind="flood"
      likelihood="Medium"
      onOpenChange={vi.fn()}
      onRaise={onRaise}
      open
    />
  );
  expect(await screen.findByTestId("matrix-suggestion")).toHaveTextContent(
    "Orange"
  );
  expect(screen.getByLabelText("orange")).toBeChecked();
  expect(screen.queryByLabelText(RE_REASON_FOR_CHOOSING)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Raise to warning" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/cap/admin/alert-2"));
  expect(onRaise).toHaveBeenCalledWith("orange", undefined);
});

it("requires an internal-only reason to override the matrix colour", async () => {
  const onRaise = vi.fn().mockResolvedValue({ alertId: "alert-3" });
  render(
    <RaiseToWarningDialog
      impact="Significant"
      kind="flood"
      likelihood="Medium"
      onOpenChange={vi.fn()}
      onRaise={onRaise}
      open
    />
  );
  await screen.findByTestId("matrix-suggestion");
  fireEvent.click(screen.getByLabelText("red"));
  const reason = screen.getByLabelText(RE_REASON);
  expect(screen.getByText(RE_INTERNAL_ONLY)).toHaveTextContent(
    "never published"
  );
  const raise = screen.getByRole("button", { name: "Raise to warning" });
  expect(raise).toBeDisabled();
  fireEvent.change(reason, { target: { value: "too short" } });
  expect(raise).toBeDisabled();
  fireEvent.change(reason, {
    target: { value: "  River already at bank level.  " },
  });
  expect(raise).toBeEnabled();
  fireEvent.click(raise);
  await waitFor(() =>
    expect(onRaise).toHaveBeenCalledWith("red", "River already at bank level.")
  );
});

it("offers an optional reason when the matrix could not be read", async () => {
  server.use(
    http.get("http://localhost/api/v1/cap/ibf/suggest", () =>
      HttpResponse.json({ detail: "boom" }, { status: 500 })
    )
  );
  const onRaise = vi.fn().mockResolvedValue({ alertId: "alert-4" });
  render(
    <RaiseToWarningDialog
      impact="Significant"
      kind="flood"
      likelihood="Medium"
      onOpenChange={vi.fn()}
      onRaise={onRaise}
      open
    />
  );
  const raise = screen.getByRole("button", { name: "Raise to warning" });
  expect(raise).toBeDisabled();
  const reason = await screen.findByLabelText(RE_OPTIONAL_REASON);
  expect(raise).toBeEnabled();
  fireEvent.change(reason, { target: { value: "short" } });
  expect(raise).toBeDisabled();
  fireEvent.change(reason, {
    target: { value: "Matrix unavailable; river at bank." },
  });
  expect(raise).toBeEnabled();
  fireEvent.click(raise);
  await waitFor(() =>
    expect(onRaise).toHaveBeenCalledWith(
      "yellow",
      "Matrix unavailable; river at bank."
    )
  );
});

it("raises without a reason when the matrix could not be read", async () => {
  server.use(
    http.get("http://localhost/api/v1/cap/ibf/suggest", () =>
      HttpResponse.json({ detail: "forbidden" }, { status: 403 })
    )
  );
  const onRaise = vi.fn().mockResolvedValue({ alertId: "alert-5" });
  render(
    <RaiseToWarningDialog
      impact="Significant"
      kind="flood"
      likelihood="Medium"
      onOpenChange={vi.fn()}
      onRaise={onRaise}
      open
    />
  );
  await screen.findByLabelText(RE_OPTIONAL_REASON);
  fireEvent.click(screen.getByRole("button", { name: "Raise to warning" }));
  await waitFor(() =>
    expect(onRaise).toHaveBeenCalledWith("yellow", undefined)
  );
});
