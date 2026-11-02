import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataRequestForm } from "@/components/pages/data-request-form";

const CONSENT_LABEL = /I agree to the conditions/u;

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
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
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DataRequestForm", () => {
  it("labels every control and hides the honeypot from assistive technology", () => {
    render(<DataRequestForm />);
    for (const label of [
      "Name",
      "Email",
      "Organisation",
      "Intended use",
      "Purpose of the request",
      "Stations or area",
      "Period start",
      "Period end",
      "Format",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    const honeypot = document.getElementById("dr-website");
    expect(honeypot?.closest("[aria-hidden='true']")).not.toBeNull();
    expect(honeypot).toHaveAttribute("tabindex", "-1");
  });

  it("asks for consent before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<DataRequestForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please agree to the conditions of use."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a valid request and says it was received", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<DataRequestForm />);
    await fillValidForm(user);
    await user.click(screen.getByLabelText(CONSENT_LABEL));
    await user.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/data-request");
    const sent = JSON.parse(String(init.body)) as {
      parameters: string[];
      consent: boolean;
    };
    expect(sent.parameters).toEqual(["rainfall"]);
    expect(sent.consent).toBe(true);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "We have received your request"
    );
  });

  it("shows the server's message when sending fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Too many requests." }), {
          status: 429,
        })
      )
    );
    const user = userEvent.setup();
    render(<DataRequestForm />);
    await fillValidForm(user);
    await user.click(screen.getByLabelText(CONSENT_LABEL));
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests."
    );
  });
});
