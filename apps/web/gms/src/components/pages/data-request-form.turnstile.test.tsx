import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataRequestForm } from "@/components/pages/data-request-form";

const CONSENT_LABEL = /I agree to the conditions/u;

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

describe("DataRequestForm Turnstile", () => {
  it("shows the widget when a site key is configured and sends its token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<DataRequestForm />);
    await user.type(screen.getByLabelText("Name"), "Ada Researcher");
    await user.type(screen.getByLabelText("Email"), "ada@example.test");
    await user.type(screen.getByLabelText("Organisation"), "University");
    await user.type(
      screen.getByLabelText("Purpose of the request"),
      "Rainfall trends for a flood study."
    );
    await user.click(screen.getByLabelText("Rainfall"));
    await user.type(screen.getByLabelText("Stations or area"), "TGPY airport");
    await user.type(screen.getByLabelText("Period start"), "2000-01-01");
    await user.type(screen.getByLabelText("Period end"), "2020-12-31");
    await user.click(screen.getByLabelText(CONSENT_LABEL));
    await user.click(screen.getByRole("button", { name: "Solve check" }));
    await user.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      turnstileToken: "tok-1",
    });
  });
});
