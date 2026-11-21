import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "@/lib/report-error";
import { WhatsAppDraftPanel } from "./whatsapp-draft-panel";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const facts =
  "Synthetic show\nSaturday, 26 December at 8:30 PM (Grenada time)\nExample Wharf";
const prompt = "Synthetic prompt";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("WhatsAppDraftPanel", () => {
  it("keeps the facts fixed as the opening line changes and copies only on request", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<WhatsAppDraftPanel facts={facts} prompt={prompt} />);

    const opening = screen.getByRole("textbox", { name: "Opening line" });
    const draft = screen.getByRole("textbox", { name: "Draft preview" });
    expect(draft).toHaveValue(`Join us!\n\n${facts}`);
    expect(draft).toHaveAttribute("readonly");
    expect(writeText).not.toHaveBeenCalled();

    fireEvent.change(opening, { target: { value: "Come along!" } });
    expect(draft).toHaveValue(`Come along!\n\n${facts}`);
    fireEvent.click(screen.getByRole("button", { name: "Copy draft" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Draft copied.")
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      `Come along!\n\n${facts}`
    );
  });

  it("copies the prompt separately from the draft", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<WhatsAppDraftPanel facts={facts} prompt={prompt} />);

    fireEvent.click(screen.getByText("Use an AI prompt"));
    fireEvent.click(screen.getByText("Copy AI prompt"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("AI prompt copied.")
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(prompt);
  });

  it("keeps the draft selectable when the clipboard API is unavailable", () => {
    vi.stubGlobal("navigator", {});
    render(<WhatsAppDraftPanel facts={facts} prompt={prompt} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy draft" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Select the draft text to copy it."
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("offers manual copying if the browser refuses clipboard access", async () => {
    const error = new Error("Clipboard denied");
    const writeText = vi.fn().mockRejectedValue(error);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<WhatsAppDraftPanel facts={facts} prompt={prompt} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy draft" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Select the draft text to copy it."
      )
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      error,
      "events.whatsapp-draft.clipboard"
    );
    expect(screen.getByRole("textbox", { name: "Draft preview" })).toHaveValue(
      `Join us!\n\n${facts}`
    );
  });
});
