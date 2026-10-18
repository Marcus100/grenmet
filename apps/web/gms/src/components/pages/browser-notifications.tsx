"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { useEffect, useState } from "react";
import { pushSupported, urlBase64ToUint8Array } from "@/lib/push";
import { reportError } from "@/lib/report-error";

type State =
  | { status: "checking" }
  | { status: "unsupported" }
  | { status: "unavailable" }
  | { status: "off" }
  | { status: "on" }
  | { status: "denied" }
  | { status: "working" }
  | { status: "error"; message: string };

const SW_URL = "/sw.js";

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  return registration?.pushManager.getSubscription() ?? null;
}

async function detectState(): Promise<State> {
  if (!pushSupported()) {
    return { status: "unsupported" };
  }
  const res = await fetch("/api/alerts/push");
  const body = (await res.json().catch(() => ({}))) as { enabled?: boolean };
  if (!(res.ok && body.enabled)) {
    return { status: "unavailable" };
  }
  if (await currentSubscription()) {
    return { status: "on" };
  }
  return Notification.permission === "denied"
    ? { status: "denied" }
    : { status: "off" };
}

/**
 * "Get browser notifications". Nothing is requested until the button is
 * pressed: the service worker is registered and permission asked only then.
 */
export function BrowserNotifications() {
  const [state, setState] = useState<State>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    detectState()
      .then((next) => {
        if (!cancelled) {
          setState(next);
        }
      })
      .catch((error: unknown) => {
        reportError(error, "gms-browser-notifications-check");
        if (!cancelled) {
          setState({ status: "unavailable" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setState({ status: "working" });
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ status: "denied" });
        return;
      }
      const keyRes = await fetch("/api/alerts/push");
      const key = (await keyRes.json()) as { publicKey?: string | null };
      if (!(keyRes.ok && key.publicKey)) {
        setState({ status: "unavailable" });
        return;
      }
      await navigator.serviceWorker.register(SW_URL);
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.publicKey),
      });
      const res = await fetch("/api/alerts/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) {
        await subscription.unsubscribe();
        setState({
          status: "error",
          message: "Could not turn on notifications. Please try again.",
        });
        return;
      }
      setState({ status: "on" });
    } catch (error) {
      reportError(error, "gms-browser-notifications-on");
      setState({
        status: "error",
        message: "Could not turn on notifications. Please try again.",
      });
    }
  }

  async function turnOff() {
    setState({ status: "working" });
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await fetch("/api/alerts/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState({ status: "off" });
    } catch (error) {
      reportError(error, "gms-browser-notifications-off");
      setState({
        status: "error",
        message: "Could not turn off notifications. Please try again.",
      });
    }
  }

  switch (state.status) {
    case "checking":
      return null;
    case "unsupported":
      return (
        <p className="text-body-base text-gm-text-secondary">
          This browser cannot show alert notifications. Use email or check this
          website.
        </p>
      );
    case "unavailable":
      return (
        <p className="text-body-base text-gm-text-secondary">
          Browser notifications are not switched on for this site yet.
        </p>
      );
    case "denied":
      return (
        <p className="text-body-base text-gm-text-secondary" role="status">
          Notifications are blocked for this site. Allow them in your browser
          settings, then reload this page.
        </p>
      );
    case "on":
      return (
        <div className="space-y-3">
          <p className="text-body-base text-gm-heading" role="status">
            Browser notifications are on for this device.
          </p>
          <Button onClick={turnOff} type="button" variant="outline">
            Turn off browser notifications
          </Button>
        </div>
      );
    default:
      return (
        <div className="space-y-3">
          <Button
            disabled={state.status === "working"}
            onClick={turnOn}
            type="button"
          >
            Get browser notifications
          </Button>
          {state.status === "error" && (
            <p
              className="font-medium text-body-base text-destructive"
              role="alert"
            >
              {state.message}
            </p>
          )}
        </div>
      );
  }
}
