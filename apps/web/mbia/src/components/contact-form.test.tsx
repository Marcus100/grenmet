import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "@/components/contact-form";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0xSITEKEY" },
}));
vi.mock("@barrelsgd/ui/components/ui/turnstile", () => ({
  Turnstile: ({
    onToken,
    siteKey,
  }: {
    onToken: (token: string | null) => void;
    siteKey?: string;
  }) =>
    siteKey ? (
      <button onClick={() => onToken("tok-1")} type="button">
        Solve check
      </button>
    ) : null,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ContactForm Turnstile", () => {
  it("shows the widget when a site key is configured and sends its token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Name"), "Jane Reader");
    await user.type(screen.getByLabelText("Email"), "jane@example.test");
    await user.type(
      screen.getByLabelText("Message"),
      "I would like to ask about parking."
    );
    await user.click(screen.getByRole("button", { name: "Solve check" }));
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      turnstileToken: "tok-1",
    });
  });

  it("explains a validation problem without sending the form", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Name"), "J");
    await user.type(screen.getByLabelText("Email"), "jane@example.test");
    await user.type(
      screen.getByLabelText("Message"),
      "I would like to ask about parking."
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Name: please enter at least 2 characters."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the refusal message and keeps what the visitor typed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: "Verification failed. Please try again.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Name"), "Jane Reader");
    await user.type(screen.getByLabelText("Email"), "jane@example.test");
    await user.type(
      screen.getByLabelText("Message"),
      "I would like to ask about parking."
    );
    await user.click(screen.getByRole("button", { name: "Solve check" }));
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Verification failed. Please try again."
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Jane Reader");
  });

  it("confirms receipt and clears the form after a successful send", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByLabelText("Name"), "Jane Reader");
    await user.type(screen.getByLabelText("Email"), "jane@example.test");
    await user.type(
      screen.getByLabelText("Message"),
      "I would like to ask about parking."
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Thank you — your message has been received."
    );
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });
});
