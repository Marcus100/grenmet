"use client";

import { useEffect, useRef } from "react";
import {
  captureFunnelEvent,
  type FunnelApp,
  type FunnelEventName,
  type FunnelProperties,
} from "../lib/funnel-analytics";

/**
 * Sends one funnel event when it mounts (or when its ids change). Renders
 * nothing. Server pages mount it with ids only, never with text from the page.
 */
export function FunnelEvent({
  app,
  event,
  properties = {},
}: {
  app: FunnelApp;
  event: FunnelEventName;
  properties?: FunnelProperties;
}) {
  const sent = useRef<string | null>(null);
  const signature = JSON.stringify([app, event, properties]);

  useEffect(() => {
    // Re-renders with equal ids do not send again.
    if (sent.current === signature) {
      return;
    }
    sent.current = signature;
    captureFunnelEvent(app, event, properties);
  }, [app, event, properties, signature]);

  return null;
}
