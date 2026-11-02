import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({ suggestIbfAction: vi.fn() }));
vi.mock("@/app/desk/matrix/actions", () => action);

import { MatrixAdvice } from "./matrix-advice";

const NO_WORDING = /No approved wording exists for this hazard yet/;
const CHECK = /Check advice/;
const ADVICE_NOTE = /Advice only/;

function choose(likelihood: string, impact: string) {
  fireEvent.change(screen.getByLabelText("Likelihood"), {
    target: { value: likelihood },
  });
  fireEvent.change(screen.getByLabelText("Impact"), {
    target: { value: impact },
  });
}

describe("MatrixAdvice", () => {
  beforeEach(() => {
    action.suggestIbfAction.mockReset();
  });

  it("is empty and cannot check until both values are chosen", () => {
    render(<MatrixAdvice kind="flood" />);
    const button = screen.getByRole("button", { name: CHECK });
    expect(button).toBeDisabled();
    choose("High", "");
    expect(button).toBeDisabled();
    choose("High", "Severe");
    expect(button).toBeEnabled();
  });

  it("shows a busy state while checking", async () => {
    let finish: (value: unknown) => void = () => undefined;
    action.suggestIbfAction.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    render(<MatrixAdvice kind="flood" />);
    choose("High", "Severe");
    fireEvent.click(screen.getByRole("button", { name: CHECK }));
    expect(
      await screen.findByRole("button", { name: "Checking…" })
    ).toBeDisabled();
    finish({
      error: { items: [], kind: "unavailable", status: 500, title: "x" },
      ok: false,
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: CHECK })).toBeEnabled()
    );
  });

  it("shows advice as words and says it has filled nothing in", async () => {
    action.suggestIbfAction.mockResolvedValue({
      ok: true,
      suggestion: {
        available: true,
        awareness_level: "red",
        colour: "red",
        impact: "Severe",
        likelihood: "High",
        meaning: "Act now",
        percent: 80,
        severity: "Extreme",
      },
    });
    render(<MatrixAdvice kind="flood" />);
    choose("High", "Severe");
    fireEvent.click(screen.getByRole("button", { name: CHECK }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Advised colour: Red (Extreme severity)"
    );
    expect(screen.getByText("Act now")).toBeInTheDocument();
    expect(screen.getByText(ADVICE_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Severity" })).toBeNull();
  });

  it("says plainly when only the colour is advised", async () => {
    action.suggestIbfAction.mockResolvedValue({
      ok: true,
      suggestion: {
        available: false,
        awareness_level: "yellow",
        colour: "yellow",
        impact: "Minor",
        likelihood: "Low",
        meaning: "Be aware",
        percent: 30,
        severity: "Moderate",
      },
    });
    render(<MatrixAdvice kind="flood" />);
    choose("Low", "Minor");
    fireEvent.click(screen.getByRole("button", { name: CHECK }));
    expect(await screen.findByText(NO_WORDING)).toBeInTheDocument();
  });

  it("shows a plain no-access message from the server", async () => {
    action.suggestIbfAction.mockResolvedValue({
      error: {
        items: [],
        kind: "not-allowed",
        status: 403,
        title: "You do not have permission for this action.",
      },
      ok: false,
    });
    render(<MatrixAdvice kind="flood" />);
    choose("High", "Severe");
    fireEvent.click(screen.getByRole("button", { name: CHECK }));
    expect(
      await screen.findByText("You do not have permission for this action.")
    ).toBeInTheDocument();
  });
});
