import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscribeForm } from "@/components/subscribe-form";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SubscribeForm", () => {
  it("requires consent before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SubscribeForm />);
    await user.type(screen.getByLabelText("Email address"), "a@example.test");
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please agree to receive the newsletter."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SubscribeForm />);
    await user.type(screen.getByLabelText("Email address"), "nope");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please enter a valid email address."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the email and asks the reader to check their inbox", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SubscribeForm />);
    await user.type(screen.getByLabelText("Email address"), "a@example.test");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/subscribe");
    expect(JSON.parse(String(init.body))).toEqual({ email: "a@example.test" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Check your email to confirm"
    );
  });

  it("shows the server's message when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Too many attempts." }), {
          status: 429,
        })
      )
    );
    const user = userEvent.setup();
    render(<SubscribeForm />);
    await user.type(screen.getByLabelText("Email address"), "a@example.test");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts."
    );
  });
});
