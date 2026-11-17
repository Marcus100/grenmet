import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Turnstile as TurnstileComponent } from "./turnstile";

const SITE_KEY = "0x4AAAAAAA-test-site-key";
const SCRIPT_PREFIX = "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface RenderOptions {
  appearance: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  sitekey: string;
}

interface FakeApi {
  remove: ReturnType<typeof vi.fn<(widgetId: string) => void>>;
  render: ReturnType<
    typeof vi.fn<(container: HTMLElement, options: RenderOptions) => string>
  >;
  reset: ReturnType<typeof vi.fn<(widgetId: string) => void>>;
}

function fakeApi(): FakeApi {
  return {
    remove: vi.fn<(widgetId: string) => void>(),
    render: vi
      .fn<(container: HTMLElement, options: RenderOptions) => string>()
      .mockReturnValue("widget-1"),
    reset: vi.fn<(widgetId: string) => void>(),
  };
}

/** The script tag the component injects, if any. */
function injectedScripts(): HTMLScriptElement[] {
  return Array.from(
    document.head.querySelectorAll<HTMLScriptElement>(
      `script[src^="${SCRIPT_PREFIX}"]`
    )
  );
}

/** Each test gets a fresh module, so the cached script promise starts empty. */
async function loadComponent(): Promise<typeof TurnstileComponent> {
  vi.resetModules();
  const mod = await import("./turnstile");
  return mod.Turnstile;
}

/** The options the component passed to render() on its first call. */
function renderOptions(api: FakeApi): RenderOptions {
  const [call] = api.render.mock.calls;
  if (!call) {
    throw new Error("Turnstile widget was never rendered");
  }
  return call[1];
}

describe("Turnstile", () => {
  beforeEach(() => {
    window.turnstile = undefined;
  });

  afterEach(() => {
    window.turnstile = undefined;
    for (const script of injectedScripts()) {
      script.remove();
    }
    vi.restoreAllMocks();
  });

  it("renders nothing and loads no script without a site key", async () => {
    const Turnstile = await loadComponent();
    const api = fakeApi();
    window.turnstile = api as unknown as Window["turnstile"];
    const onToken = vi.fn();

    const { container } = render(<Turnstile onToken={onToken} siteKey="" />);

    expect(container).toBeEmptyDOMElement();
    expect(api.render).not.toHaveBeenCalled();
    expect(injectedScripts()).toHaveLength(0);
    expect(onToken).not.toHaveBeenCalled();
  });

  it("renders the widget into its container with the site key, interaction-only", async () => {
    const Turnstile = await loadComponent();
    const api = fakeApi();
    window.turnstile = api as unknown as Window["turnstile"];

    const { container } = render(
      <Turnstile onToken={vi.fn()} siteKey={SITE_KEY} />
    );

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    const [target, options] = api.render.mock.calls[0] ?? [];
    expect(target).toBe(container.firstElementChild);
    expect(options).toMatchObject({
      appearance: "interaction-only",
      sitekey: SITE_KEY,
    });
  });

  it("passes the token up when the widget solves", async () => {
    const Turnstile = await loadComponent();
    const api = fakeApi();
    window.turnstile = api as unknown as Window["turnstile"];
    const onToken = vi.fn();
    render(<Turnstile onToken={onToken} siteKey={SITE_KEY} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    renderOptions(api).callback("token-abc");

    expect(onToken).toHaveBeenCalledWith("token-abc");
  });

  it("tells the host the token is gone when it expires", async () => {
    const Turnstile = await loadComponent();
    const api = fakeApi();
    window.turnstile = api as unknown as Window["turnstile"];
    const onToken = vi.fn();
    render(<Turnstile onToken={onToken} siteKey={SITE_KEY} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    renderOptions(api)["expired-callback"]();

    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("tells the host the token is gone when the widget errors", async () => {
    const Turnstile = await loadComponent();
    const api = fakeApi();
    window.turnstile = api as unknown as Window["turnstile"];
    const onToken = vi.fn();
    render(<Turnstile onToken={onToken} siteKey={SITE_KEY} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    renderOptions(api)["error-callback"]();

    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("resets the widget and clears the token when resetKey changes", async () => {
    const Turnstile = await loadComponent();
    const api = fakeApi();
    window.turnstile = api as unknown as Window["turnstile"];
    const onToken = vi.fn();
    const { rerender } = render(
      <Turnstile onToken={onToken} resetKey={0} siteKey={SITE_KEY} />
    );
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    // The first render does not reset: nothing has been spent yet.
    expect(api.reset).not.toHaveBeenCalled();

    rerender(<Turnstile onToken={onToken} resetKey={1} siteKey={SITE_KEY} />);

    expect(api.reset).toHaveBeenCalledWith("widget-1");
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("removes the widget when it unmounts", async () => {
    const Turnstile = await loadComponent();
    const api = fakeApi();
    window.turnstile = api as unknown as Window["turnstile"];
    const { unmount } = render(
      <Turnstile onToken={vi.fn()} siteKey={SITE_KEY} />
    );
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    unmount();

    expect(api.remove).toHaveBeenCalledWith("widget-1");
  });

  it("injects Cloudflare's script once, and renders when it loads", async () => {
    const Turnstile = await loadComponent();
    const api = fakeApi();
    const onToken = vi.fn();
    render(<Turnstile onToken={onToken} siteKey={SITE_KEY} />);

    await waitFor(() => expect(injectedScripts()).toHaveLength(1));
    const [script] = injectedScripts();
    expect(script?.async).toBe(true);
    expect(script?.defer).toBe(true);
    expect(api.render).not.toHaveBeenCalled();

    // The browser would run the script here; it defines the API and fires load.
    window.turnstile = api as unknown as Window["turnstile"];
    script?.dispatchEvent(new Event("load"));

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(onToken).not.toHaveBeenCalled();
  });

  it("gives the host no token when the script cannot be loaded", async () => {
    const Turnstile = await loadComponent();
    const onToken = vi.fn();
    render(<Turnstile onToken={onToken} siteKey={SITE_KEY} />);

    await waitFor(() => expect(injectedScripts()).toHaveLength(1));
    injectedScripts()[0]?.dispatchEvent(new Event("error"));

    await waitFor(() => expect(onToken).toHaveBeenCalledWith(null));
    expect(window.turnstile).toBeUndefined();
  });
});
