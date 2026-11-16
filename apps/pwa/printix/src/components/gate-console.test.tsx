// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GateConsole } from "@/components/gate-console";
import { type ScanAnswer, submitScan } from "@/lib/scan-api";
import { API_ORIGIN, SECRET, SUMMARY } from "@/test/fixtures";

vi.mock("@/lib/scan-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan-api")>();
  return { ...actual, readSummary: vi.fn(), submitScan: vi.fn() };
});

import { readSummary } from "@/lib/scan-api";

const ADMITTED_NAME = /admitted/iu;
const NOT_KEPT_TEXT = /could not keep the pairing/u;
const submitMock = vi.mocked(submitScan);
const readMock = vi.mocked(readSummary);
const connection = { origin: API_ORIGIN, secret: SECRET };

function answerWith(answer: ScanAnswer) {
  submitMock.mockResolvedValueOnce(answer);
}

function renderConsole() {
  return render(
    <GateConsole
      connection={connection}
      onPairingProblem={vi.fn()}
      onUnpair={vi.fn()}
      storageSaved
    />
  );
}

/** Types a number through the sheet and presses Check ticket. */
function checkTyped(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "Type a number" }));
  const field = screen.getByLabelText("Printed number");
  fireEvent.change(field, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Check ticket" }));
}

/**
 * The open sheet, or null. jsdom never finishes the closing animation, so a
 * closed sheet can stay in the page (and keep the rest hidden from roles).
 */
function openSheet(): HTMLElement | null {
  const sheet = screen.queryByRole("dialog");
  return sheet?.getAttribute("data-state") === "open" ? sheet : null;
}

function tapTypeANumber() {
  fireEvent.click(
    screen.getByRole("button", { name: "Type a number", hidden: true })
  );
}

beforeEach(() => {
  submitMock.mockReset();
  readMock.mockReset();
  readMock.mockResolvedValue({ kind: "summary", summary: SUMMARY });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("live count", () => {
  it("shows tickets in against tickets issued, and the event's name", async () => {
    renderConsole();
    expect(
      await screen.findByRole("heading", { name: SUMMARY.event.name })
    ).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", {
      name: "Tickets in against tickets issued",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "120");
    expect(bar).toHaveAttribute("aria-valuemax", "400");
    expect(screen.getByText("Not yet in: 278")).toBeInTheDocument();
  });
});

describe("checking a ticket", () => {
  it("admits a ticket with a green screen that clears itself", async () => {
    answerWith({
      kind: "checked",
      result: { outcome: "admitted", printed_number: "042" },
    });
    renderConsole();
    checkTyped("042");

    const verdict = await screen.findByRole("status");
    expect(
      within(verdict).getByRole("heading", { name: "Admitted" })
    ).toBeInTheDocument();
    expect(submitMock).toHaveBeenCalledWith(connection, "042");
    await waitFor(
      () =>
        expect(screen.queryByRole("heading", { name: "Admitted" })).toBeNull(),
      { timeout: 3000 }
    );
  });

  it("refuses a second admission and keeps the screen until Scan next is tapped", async () => {
    answerWith({
      kind: "checked",
      result: {
        outcome: "already_admitted",
        admitted_at: "2026-12-26T19:42:00Z",
        admitted_gate: "Main gate",
      },
    });
    renderConsole();
    checkTyped("042");

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("heading", { name: "Already admitted" })
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent("through Main gate");
    // It does not clear itself: wait past the admitted timeout and check.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(
      screen.getByRole("heading", { name: "Already admitted" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Scan next" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Already admitted" })
      ).toBeNull()
    );
  });

  it("says no signal in words and never shows a yes", async () => {
    answerWith({ kind: "no-signal" });
    renderConsole();
    checkTyped("042");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No signal: cannot check tickets");
    expect(screen.queryByRole("status", { name: ADMITTED_NAME })).toBeNull();
  });

  it("asks for a number before it checks an empty entry", async () => {
    renderConsole();
    fireEvent.click(screen.getByRole("button", { name: "Type a number" }));
    fireEvent.click(screen.getByRole("button", { name: "Check ticket" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Type the printed number first."
    );
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("puts focus on Scan next, not on the button behind the result", async () => {
    answerWith({ kind: "no-signal" });
    renderConsole();
    checkTyped("042");
    const next = await screen.findByRole("button", { name: "Scan next" });
    // The closing sheet hands focus back on a timer; let it run.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.activeElement).toBe(next);
  });

  it("does not bring the sheet back after a result that arrived while it was open", async () => {
    let resolveAnswer: (answer: ScanAnswer) => void = () => undefined;
    submitMock.mockReturnValueOnce(
      new Promise<ScanAnswer>((resolve) => {
        resolveAnswer = resolve;
      })
    );
    renderConsole();
    checkTyped("042");
    // Reopen the sheet while the first check is still pending.
    tapTypeANumber();
    expect(openSheet()).not.toBeNull();

    resolveAnswer({ kind: "no-signal" });
    fireEvent.click(await screen.findByRole("button", { name: "Scan next" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the sheet empty again after Cancel", async () => {
    renderConsole();
    fireEvent.click(screen.getByRole("button", { name: "Type a number" }));
    fireEvent.change(screen.getByLabelText("Printed number"), {
      target: { value: "042" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(openSheet()).toBeNull());

    tapTypeANumber();
    expect(openSheet()).not.toBeNull();
    expect(screen.getByLabelText("Printed number")).toHaveValue("");
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("unpairs only after a second confirmation, and says when the pairing was not kept", () => {
    const onUnpair = vi.fn();
    render(
      <GateConsole
        connection={connection}
        onPairingProblem={vi.fn()}
        onUnpair={onUnpair}
        storageSaved={false}
      />
    );
    expect(screen.getByText(NOT_KEPT_TEXT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unpair this phone" }));
    expect(onUnpair).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Unpair this phone" }));
    expect(onUnpair).toHaveBeenCalledTimes(1);
  });
});
