import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const action = vi.hoisted(() => ({ raiseToWarningAction: vi.fn() }));
vi.mock("@/app/desk/escalations/actions", () => action);

import { RaiseToWarningForm } from "./raise-to-warning-form";

const PRODUCT_ID = "11111111-2222-4333-8444-555555555555";
const ALERT_ID = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const REASON = "Radar and station rainfall agree on heavy bands.";

function renderForm(
  suggestion: Parameters<typeof RaiseToWarningForm>[0]["suggestion"]
) {
  return render(
    <RaiseToWarningForm
      label="Flood / Heavy Rain"
      productId={PRODUCT_ID}
      revision={3}
      suggestion={suggestion}
    />
  );
}

const RAISE = /Raise to warning/u;

const REASON_OPTIONAL_LABEL = /Reason \(only if the colour differs\)/u;
const REASON_REQUIRED_LABEL = /Reason \(required\)/u;
const MATRIX_DIFFERS_TEXT = /The impact matrix suggests a different colour/u;
const MATRIX_UNKNOWN_TEXT = /The impact matrix could not be checked/u;

describe("RaiseToWarningForm", () => {
  beforeEach(() => {
    router.push.mockReset();
    action.raiseToWarningAction.mockReset();
  });

  it("starts on the matrix colour and needs no reason when it matches", () => {
    renderForm({ colour: "orange", kind: "suggested" });
    expect(screen.getByLabelText("Orange")).toBeChecked();
    expect(screen.getByRole("button", { name: RAISE })).toBeEnabled();
    expect(screen.getByLabelText(REASON_OPTIONAL_LABEL)).toBeInTheDocument();
  });

  it("asks for a reason when the chosen colour differs from the matrix", () => {
    renderForm({ colour: "orange", kind: "suggested" });
    fireEvent.click(screen.getByLabelText("Red"));
    const button = screen.getByRole("button", { name: RAISE });
    expect(button).toBeDisabled();
    expect(screen.getByText(MATRIX_DIFFERS_TEXT)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(REASON_REQUIRED_LABEL), {
      target: { value: "short" },
    });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(REASON_REQUIRED_LABEL), {
      target: { value: REASON },
    });
    expect(button).toBeEnabled();
  });

  it("never offers green, and treats a green matrix suggestion as needing a reason for yellow", () => {
    renderForm({ colour: "green", kind: "suggested" });
    expect(screen.queryByLabelText("Green")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Yellow")).toBeChecked();
    expect(screen.getByRole("button", { name: RAISE })).toBeDisabled();
  });

  it("keeps the reason optional when the matrix could not be checked", () => {
    renderForm({ kind: "unknown" });
    expect(screen.getByLabelText("Yellow")).toBeChecked();
    expect(screen.getByRole("button", { name: RAISE })).toBeEnabled();
    expect(screen.getByText(MATRIX_UNKNOWN_TEXT)).toBeInTheDocument();
  });

  it("raises through the action and opens the draft's edit page", async () => {
    action.raiseToWarningAction.mockResolvedValue({
      alertId: ALERT_ID,
      created: true,
      ok: true,
    });
    renderForm({ colour: "orange", kind: "suggested" });
    fireEvent.click(screen.getByLabelText("Red"));
    fireEvent.change(screen.getByLabelText(REASON_REQUIRED_LABEL), {
      target: { value: REASON },
    });
    fireEvent.click(screen.getByRole("button", { name: RAISE }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/desk/alerts/${ALERT_ID}/edit`)
    );
    expect(action.raiseToWarningAction).toHaveBeenCalledWith({
      awarenessLevel: "red",
      overrideReason: REASON,
      productId: PRODUCT_ID,
      revision: 3,
    });
  });

  it("sends no reason when none is typed and the colour matches", async () => {
    action.raiseToWarningAction.mockResolvedValue({
      alertId: ALERT_ID,
      created: false,
      ok: true,
    });
    renderForm({ colour: "orange", kind: "suggested" });
    fireEvent.click(screen.getByRole("button", { name: RAISE }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(action.raiseToWarningAction).toHaveBeenCalledWith(
      expect.objectContaining({
        awarenessLevel: "orange",
        overrideReason: null,
      })
    );
  });

  it("shows the refusal and stays on the form", async () => {
    action.raiseToWarningAction.mockResolvedValue({
      error: {
        items: ["Only hazard alerts can be raised to a warning"],
        kind: "validation",
        status: 400,
        title: "The alert could not be saved as it is.",
      },
      ok: false,
    });
    renderForm({ kind: "unknown" });
    fireEvent.click(screen.getByRole("button", { name: RAISE }));
    expect(
      await screen.findByText("Only hazard alerts can be raised to a warning")
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
