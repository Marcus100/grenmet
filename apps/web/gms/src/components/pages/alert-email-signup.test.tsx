import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AlertEmailSignup,
  AlertSignupResult,
} from "@/components/pages/alert-email-signup";

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  search = "";
});

describe("AlertEmailSignup", () => {
  it("asks for consent before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AlertEmailSignup />);
    await user.type(screen.getByLabelText("Email address"), "a@example.test");
    await user.click(screen.getByRole("button", { name: "Email me alerts" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please agree to receive weather alerts by email."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a valid sign-up and asks the reader to confirm", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AlertEmailSignup />);
    await user.type(screen.getByLabelText("Email address"), "a@example.test");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Email me alerts" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Check your email to confirm"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/alerts/subscribe",
      expect.objectContaining({
        body: JSON.stringify({ email: "a@example.test" }),
      })
    );
  });

  it("shows the server's message when sign-up fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Too many attempts." }), {
          status: 429,
        })
      )
    );
    const user = userEvent.setup();
    render(<AlertEmailSignup />);
    await user.type(screen.getByLabelText("Email address"), "a@example.test");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Email me alerts" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts."
    );
  });
});

describe("AlertSignupResult", () => {
  it("says when the address is confirmed", () => {
    search = "result=confirmed";
    render(<AlertSignupResult />);
    expect(screen.getByRole("status")).toHaveTextContent("You are subscribed");
  });

  it("renders nothing without a known result", () => {
    search = "result=bogus";
    const { container } = render(<AlertSignupResult />);
    expect(container).toBeEmptyDOMElement();
  });
});
