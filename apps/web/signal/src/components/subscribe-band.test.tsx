import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscribeBand } from "./subscribe-band";

const SUCCESS_RE = /you in/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SubscribeBand", () => {
  it("renders the email and WhatsApp fields", () => {
    render(<SubscribeBand />);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(
      screen.getByLabelText("WhatsApp number (optional)")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Subscribe" })
    ).toBeInTheDocument();
  });

  it("posts the form and shows a success message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<SubscribeBand />);

    await user.type(
      screen.getByLabelText("Email address"),
      "reader@example.gd"
    );
    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(await screen.findByRole("status")).toHaveTextContent(SUCCESS_RE);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/subscribe",
      expect.objectContaining({ method: "POST" })
    );
  });
});
