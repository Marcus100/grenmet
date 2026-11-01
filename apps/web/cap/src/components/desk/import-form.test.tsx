import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const action = vi.hoisted(() => ({ importAlertAction: vi.fn() }));
vi.mock("@/app/desk/import/actions", () => action);

import { ImportForm } from "./import-form";

const ID = "11111111-2222-4333-8444-555555555555";
const TOO_LARGE = /larger than 5 MB/;
const NOT_FULLY_CONFORMANT = /does not fully follow CAP 1.2/;

function fillAndReview(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("ImportForm", () => {
  beforeEach(() => {
    router.push.mockReset();
    action.importAlertAction.mockReset();
  });

  it("is empty and cannot submit until a document is pasted and reviewed", () => {
    render(<ImportForm />);
    const button = screen.getByRole("button", { name: "Import as draft" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "<alert/>" },
    });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button).toBeEnabled();
  });

  it("clears the paste and the review tick when the source changes", () => {
    render(<ImportForm />);
    fillAndReview("<alert/>");
    fireEvent.click(screen.getByLabelText("Public https address"));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("shows a busy state while the import runs", async () => {
    let finish: (value: unknown) => void = () => undefined;
    action.importAlertAction.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    render(<ImportForm />);
    fillAndReview("<alert/>");
    fireEvent.click(screen.getByRole("button", { name: "Import as draft" }));
    expect(
      await screen.findByRole("button", { name: "Importing…" })
    ).toBeDisabled();
    finish({
      ok: true,
      alertId: ID,
      schemaConformant: true,
      schemaProblems: [],
    });
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/desk/alerts/${ID}`)
    );
  });

  it("opens the draft on a conformant import", async () => {
    action.importAlertAction.mockResolvedValue({
      alertId: ID,
      ok: true,
      schemaConformant: true,
      schemaProblems: [],
    });
    render(<ImportForm />);
    fillAndReview("<alert/>");
    fireEvent.click(screen.getByRole("button", { name: "Import as draft" }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/desk/alerts/${ID}`)
    );
  });

  it("lists every schema problem and keeps the draft link on this page", async () => {
    action.importAlertAction.mockResolvedValue({
      alertId: ID,
      ok: true,
      schemaConformant: false,
      schemaProblems: ["line 3: bad sent", "line 9: missing area"],
    });
    render(<ImportForm />);
    fillAndReview("<alert/>");
    fireEvent.click(screen.getByRole("button", { name: "Import as draft" }));
    expect(await screen.findByText(NOT_FULLY_CONFORMANT)).toBeInTheDocument();
    expect(screen.getByText("line 3: bad sent")).toBeInTheDocument();
    expect(screen.getByText("line 9: missing area")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows a plain error and keeps the paste so it can be fixed", async () => {
    action.importAlertAction.mockResolvedValue({
      error: {
        items: ["malformed XML at line 2"],
        kind: "validation",
        status: 400,
        title: "The import was refused. Nothing was saved.",
      },
      ok: false,
    });
    render(<ImportForm />);
    fillAndReview("<alert");
    fireEvent.click(screen.getByRole("button", { name: "Import as draft" }));
    expect(
      await screen.findByText("The import was refused. Nothing was saved.")
    ).toBeInTheDocument();
    expect(screen.getByText("malformed XML at line 2")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("<alert");
  });

  it("shows no-access plainly when the server refuses", async () => {
    action.importAlertAction.mockResolvedValue({
      error: {
        items: [],
        kind: "not-allowed",
        status: 403,
        title: "You do not have permission for this action.",
      },
      ok: false,
    });
    render(<ImportForm />);
    fillAndReview("<alert/>");
    fireEvent.click(screen.getByRole("button", { name: "Import as draft" }));
    expect(
      await screen.findByText("You do not have permission for this action.")
    ).toBeInTheDocument();
  });

  it("refuses an oversized paste with a plain message and never calls the server", () => {
    render(<ImportForm />);
    fillAndReview("a".repeat(5 * 1024 * 1024 + 1));
    fireEvent.click(screen.getByRole("button", { name: "Import as draft" }));
    expect(screen.getByText(TOO_LARGE)).toBeInTheDocument();
    expect(action.importAlertAction).not.toHaveBeenCalled();
  });
});
