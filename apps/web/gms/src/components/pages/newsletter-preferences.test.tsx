import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterPreferences } from "@/components/pages/newsletter-preferences";

const reportError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/report-error", () => ({ reportError }));

const LISTS = [
  { listKey: "gms-newsletter", listName: "GMS climate newsletter" },
  { listKey: "signal", listName: "Grenada Signal" },
];

beforeEach(() => {
  reportError.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NewsletterPreferences", () => {
  it("shows each list with its own stop button", () => {
    render(<NewsletterPreferences initialLists={LISTS} token="tok" />);
    expect(screen.getByText("GMS climate newsletter")).toBeInTheDocument();
    expect(screen.getByText("Grenada Signal")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Stop this list" })
    ).toHaveLength(2);
  });

  it("stops one list and keeps the list the server returns", async () => {
    const fetchMock = stubFetch(
      new Response(
        JSON.stringify({
          lists: [
            { listKey: "gms-newsletter", listName: "GMS climate newsletter" },
          ],
        }),
        { status: 200 }
      )
    );
    const user = userEvent.setup();
    render(<NewsletterPreferences initialLists={LISTS} token="tok-9" />);

    const [, signalButton] = screen.getAllByRole("button", {
      name: "Stop this list",
    });
    if (!signalButton) throw new Error("expected a stop button for Signal");
    await user.click(signalButton);

    await waitFor(() =>
      expect(screen.queryByText("Grenada Signal")).not.toBeInTheDocument()
    );
    expect(screen.getByText("GMS climate newsletter")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/newsletter/preferences",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "tok-9", listKey: "signal" }),
      })
    );
  });

  it("shows the server's message and keeps every list when a stop fails", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "This link is not valid." }), {
        status: 400,
      })
    );
    const user = userEvent.setup();
    render(<NewsletterPreferences initialLists={LISTS} token="bad" />);

    const [first] = screen.getAllByRole("button", { name: "Stop this list" });
    if (!first) throw new Error("expected a stop button");
    await user.click(first);

    expect(
      await screen.findByText("This link is not valid.")
    ).toBeInTheDocument();
    expect(screen.getByText("GMS climate newsletter")).toBeInTheDocument();
    expect(screen.getByText("Grenada Signal")).toBeInTheDocument();
  });

  it("says so when no list is left", () => {
    render(<NewsletterPreferences initialLists={[]} token="tok" />);
    expect(
      screen.getByText("You are not subscribed to any list at the moment.")
    ).toBeInTheDocument();
  });
});
