import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscribeForm } from "@/components/subscribe-form";

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

describe("SubscribeForm Turnstile", () => {
  it("shows the widget when a site key is configured and sends its token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SubscribeForm />);
    await user.type(screen.getByLabelText("Email address"), "a@example.test");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Solve check" }));
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      email: "a@example.test",
      turnstileToken: "tok-1",
    });
  });
});
