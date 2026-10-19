import { Turnstile } from "@barrelsgd/ui/components/ui/turnstile";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const SCRIPT =
  'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]';

afterEach(() => {
  cleanup();
  for (const node of document.head.querySelectorAll(SCRIPT)) {
    node.remove();
  }
  window.turnstile = undefined;
});

describe("Turnstile widget", () => {
  it("renders nothing and loads no script without a site key", () => {
    const { container } = render(<Turnstile onToken={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(document.head.querySelector(SCRIPT)).toBeNull();
    render(<Turnstile onToken={vi.fn()} siteKey="" />);
    expect(document.head.querySelector(SCRIPT)).toBeNull();
  });

  it("loads the explicit-render script once and reports tokens", async () => {
    const onToken = vi.fn();
    const renderWidget = vi.fn().mockReturnValue("widget-1");
    window.turnstile = {
      remove: vi.fn(),
      render: renderWidget,
      reset: vi.fn(),
    };
    const { container } = render(
      <Turnstile onToken={onToken} siteKey="0xSITEKEY" />
    );
    expect(container.querySelector('[data-slot="turnstile"]')).not.toBeNull();
    await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce());
    const options = renderWidget.mock.calls[0]?.[1] as {
      appearance: string;
      callback: (token: string) => void;
      sitekey: string;
    };
    expect(options.sitekey).toBe("0xSITEKEY");
    expect(options.appearance).toBe("interaction-only");
    options.callback("tok-9");
    expect(onToken).toHaveBeenCalledWith("tok-9");
  });

  it("appends the Cloudflare script (async, defer, explicit) when absent", () => {
    render(<Turnstile onToken={vi.fn()} siteKey="0xSITEKEY" />);
    const script = document.head.querySelector<HTMLScriptElement>(SCRIPT);
    expect(script).not.toBeNull();
    expect(script?.src).toContain("render=explicit");
    expect(script?.async).toBe(true);
    expect(script?.defer).toBe(true);
  });
});
