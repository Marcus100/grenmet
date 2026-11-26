import type { Route } from "next";
import "server-only";

import { appHandoffCodeSchema, appPublicSchema } from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "./auth-config";
import { isAuthApiError } from "./session";

/** Single sign-on into another app (ADR-0017). */
export type HandoffResult =
  | { kind: "redirect"; url: Route }
  /** `request`: a staff app, where joining asks an administrator. */
  | { kind: "join"; label: string; request: boolean }
  | { kind: "pending"; label: string }
  | { kind: "denied"; label: string; detail: string }
  | { kind: "mfa-enrol" }
  | { kind: "mfa-sign-in" }
  | { kind: "sign-in" }
  | { kind: "unavailable" };

const APP_KEY = /^[a-z][a-z0-9-]{1,30}$/u;
const STATE = /^[A-Za-z0-9_-]{16,200}$/u;

export interface HandoffRequest {
  app: string;
  state: string;
}

export function parseHandoffRequest(
  app: string | null,
  state: string | null
): HandoffRequest | null {
  return app && state && APP_KEY.test(app) && STATE.test(state)
    ? { app, state }
    : null;
}

export function continuePath({ app, state }: HandoffRequest): Route {
  return `/continue?${new URLSearchParams({ app, state })}`;
}

const CONTINUE_PREFIX = "/continue?";

/**
 * The handoff a sign-in will return to, read from a validated local `returnTo`
 * (`/continue?app=…&state=…`). Null for any other address.
 */
export function handoffRequestFromReturnTo(
  returnTo: string | null
): HandoffRequest | null {
  if (!returnTo?.startsWith(CONTINUE_PREFIX)) return null;
  const query = new URLSearchParams(returnTo.slice(CONTINUE_PREFIX.length));
  return parseHandoffRequest(query.get("app"), query.get("state"));
}

/** FastAPI's reply once a staff-app access request is waiting. */
const STAFF_REQUEST_PENDING = "Your request is waiting for an administrator";

/** The registry's name for an app ("Barrels Bookings"); null when it can't be read. */
export async function fetchAppLabel(app: string): Promise<string | null> {
  try {
    const result = await authApiFetch(
      getAuthConfig(),
      `/auth/apps/${app}`,
      appPublicSchema
    );
    return result.label;
  } catch {
    return null;
  }
}

async function appLabel(app: string): Promise<string> {
  return (await fetchAppLabel(app)) ?? "this app";
}

export async function startHandoff(
  request: HandoffRequest,
  sessionToken: string,
  join = false
): Promise<HandoffResult> {
  try {
    const { code, callback_url } = await authApiFetch(
      getAuthConfig(),
      `/auth/apps/${request.app}/handoff`,
      appHandoffCodeSchema,
      {
        body: { session_token: sessionToken, state: request.state, join },
        method: "POST",
      }
    );
    const url = new URL(callback_url);
    url.searchParams.set("code", code);
    url.searchParams.set("state", request.state);
    return { kind: "redirect", url: url.toString() as Route };
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    switch (error.status) {
      case 401:
        return { kind: "sign-in" };
      case 403:
        if (error.detail.startsWith("Set up two-step verification"))
          return { kind: "mfa-enrol" };
        if (error.detail.startsWith("Sign in again with your authenticator"))
          return { kind: "mfa-sign-in" };
        if (error.detail.startsWith(STAFF_REQUEST_PENDING)) {
          return { kind: "pending", label: await appLabel(request.app) };
        }
        return {
          kind: "denied",
          label: await appLabel(request.app),
          detail: error.detail,
        };
      case 404:
        return { kind: "unavailable" };
      case 409:
        return {
          kind: "join",
          label: await appLabel(request.app),
          request: error.detail.startsWith("Request access"),
        };
      default:
        throw error;
    }
  }
}
