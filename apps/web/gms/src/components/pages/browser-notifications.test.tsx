import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserNotifications } from "@/components/pages/browser-notifications";
import { urlBase64ToUint8Array } from "@/lib/push";

const UNSUPPORTED = /cannot show alert notifications/u;
const NOT_ON = /not switched on/u;
const subscribe = vi.fn();
const requestPermission = vi.fn();
const register = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function installPush(existing: unknown = null, permission = "default") {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existing),
    subscribe,
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue({ pushManager }),
      register,
      ready: Promise.resolve({ pushManager }),
    },
  });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission, requestPermission });
}

beforeEach(() => {
  subscribe.mockReset();
  requestPermission.mockReset();
  register.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url with missing padding", () => {
    expect(Array.from(urlBase64ToUint8Array("_-8"))).toEqual([255, 239]);
  });
});

describe("BrowserNotifications", () => {
  it("says so when the browser cannot show notifications", async () => {
    render(<BrowserNotifications />);
    expect(await screen.findByText(UNSUPPORTED)).toBeInTheDocument();
  });

  it("is honest when the server has push switched off", async () => {
    installPush();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ enabled: false, publicKey: null }))
    );
    render(<BrowserNotifications />);
    expect(await screen.findByText(NOT_ON)).toBeInTheDocument();
  });

  it("asks for permission only when the button is pressed", async () => {
    installPush();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ enabled: true, publicKey: "AQAB" }))
      .mockResolvedValueOnce(json({ enabled: true, publicKey: "AQAB" }))
      .mockResolvedValueOnce(json({ ok: true }, 201));
    vi.stubGlobal("fetch", fetchMock);
    requestPermission.mockResolvedValue("granted");
    subscribe.mockResolvedValue({
      toJSON: () => ({ endpoint: "https://fcm.googleapis.com/x", keys: {} }),
      unsubscribe: vi.fn(),
    });
    const user = userEvent.setup();
    render(<BrowserNotifications />);
    const button = await screen.findByRole("button", {
      name: "Get browser notifications",
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();

    await user.click(button);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Browser notifications are on"
      )
    );
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/alerts/push",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("explains a blocked permission", async () => {
    installPush();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ enabled: true, publicKey: "AQAB" }))
    );
    requestPermission.mockResolvedValue("denied");
    const user = userEvent.setup();
    render(<BrowserNotifications />);
    await user.click(
      await screen.findByRole("button", { name: "Get browser notifications" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("blocked");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("shows the off switch when this browser is already subscribed", async () => {
    installPush({ endpoint: "https://fcm.googleapis.com/x" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ enabled: true, publicKey: "AQAB" }))
    );
    render(<BrowserNotifications />);
    expect(
      await screen.findByRole("button", {
        name: "Turn off browser notifications",
      })
    ).toBeInTheDocument();
  });
  it("starts blocked when the browser already denied notifications", async () => {
    installPush(null, "denied");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ enabled: true, publicKey: "AQAB" }))
    );
    render(<BrowserNotifications />);
    expect(await screen.findByRole("status")).toHaveTextContent("blocked");
  });

  it("stops when the key disappears between check and sign-up", async () => {
    installPush();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ enabled: true, publicKey: "AQAB" }))
        .mockResolvedValueOnce(json({ enabled: false, publicKey: null }))
    );
    requestPermission.mockResolvedValue("granted");
    const user = userEvent.setup();
    render(<BrowserNotifications />);
    await user.click(
      await screen.findByRole("button", { name: "Get browser notifications" })
    );
    expect(await screen.findByText(NOT_ON)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("rolls back the browser subscription when the server refuses it", async () => {
    installPush();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ enabled: true, publicKey: "AQAB" }))
        .mockResolvedValueOnce(json({ enabled: true, publicKey: "AQAB" }))
        .mockResolvedValueOnce(json({ error: "nope" }, 503))
    );
    requestPermission.mockResolvedValue("granted");
    const unsubscribe = vi.fn();
    subscribe.mockResolvedValue({
      toJSON: () => ({ endpoint: "https://fcm.googleapis.com/x", keys: {} }),
      unsubscribe,
    });
    const user = userEvent.setup();
    render(<BrowserNotifications />);
    await user.click(
      await screen.findByRole("button", { name: "Get browser notifications" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not turn on notifications"
    );
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("turns notifications off and forgets the endpoint", async () => {
    const unsubscribe = vi.fn();
    installPush({ endpoint: "https://fcm.googleapis.com/x", unsubscribe });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ enabled: true, publicKey: "AQAB" }))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<BrowserNotifications />);
    await user.click(
      await screen.findByRole("button", {
        name: "Turn off browser notifications",
      })
    );
    expect(
      await screen.findByRole("button", { name: "Get browser notifications" })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/alerts/push",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/x" }),
      })
    );
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
