import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterSignup } from "@/components/pages/newsletter-signup";

const captureEvent = vi.hoisted(() => vi.fn());
const ONCE_A_DAY_COPY = /once a day when it has news/iu;
const STOP_ANYTIME_COPY = /unsubscribe at any time/iu;

vi.mock("@barrelsgd/ui/lib/analytics-runtime", () => ({ captureEvent }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "" },
}));

beforeEach(() => {
  captureEvent.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillAndSubmit(options: { consent: boolean }) {
  const user = userEvent.setup();
  render(<NewsletterSignup />);
  await user.type(
    screen.getByLabelText("Email address"),
    "reader@example.test"
  );
  if (options.consent) {
    await user.click(screen.getByRole("checkbox"));
  }
  await user.click(
    screen.getByRole("button", { name: "Email me the newsletter" })
  );
  return user;
}

describe("NewsletterSignup", () => {
  it("states what the newsletter is and that it can be stopped", () => {
    render(<NewsletterSignup />);
    expect(screen.getByText(ONCE_A_DAY_COPY)).toBeInTheDocument();
    expect(screen.getByText(STOP_ANYTIME_COPY)).toBeInTheDocument();
  });

  it("asks for consent before sending anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await fillAndSubmit({ consent: false });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please agree to receive the newsletter by email."
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it("posts a valid sign-up and asks the reader to confirm, without saying more", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"ok":true}', { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await fillAndSubmit({ consent: true });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Check your email to confirm. Nothing is sent until you click the link."
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/newsletter/subscribe",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"email":"reader@example.test"'),
      })
    );
  });

  it("counts an accepted sign-up with the agreed event name and no details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 202 }))
    );
    await fillAndSubmit({ consent: true });
    await screen.findByRole("status");
    expect(captureEvent).toHaveBeenCalledWith(
      "newsletter_signup_submitted",
      {}
    );
  });

  it("shows the server's message and does not count a failed sign-up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Too many attempts." }), {
          status: 429,
        })
      )
    );
    await fillAndSubmit({ consent: true });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts."
    );
    expect(captureEvent).not.toHaveBeenCalled();
  });
});
