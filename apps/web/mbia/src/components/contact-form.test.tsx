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
});
