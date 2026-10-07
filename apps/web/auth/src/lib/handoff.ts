import "server-only";

import { appHandoffCodeSchema, appPublicSchema } from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "./auth-config";
import { isAuthApiError } from "./session";

/** Single sign-on into another app (ADR-0017). */
export type HandoffResult =
  | { kind: "redirect"; url: string }
  | { kind: "join"; label: string }
  | { kind: "denied"; label: string; detail: string }
  | { kind: "sign-in" }
  | { kind: "unavailable" };

const APP_KEY = /^[a-z][a-z0-9-]{1,30}$/;
const STATE = /^[A-Za-z0-9_-]{16,200}$/;

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

export function continuePath({ app, state }: HandoffRequest): string {
  return `/continue?${new URLSearchParams({ app, state })}`;
}

async function appLabel(app: string): Promise<string> {
  try {
    const result = await authApiFetch(
      getAuthConfig(),
      `/auth/apps/${app}`,
      appPublicSchema
    );
    return result.label;
  } catch {
    return "this app";
  }
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
    return { kind: "redirect", url: url.toString() };
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    switch (error.status) {
      case 401:
        return { kind: "sign-in" };
      case 403:
        return {
          kind: "denied",
          label: await appLabel(request.app),
          detail: error.detail,
        };
      case 404:
        return { kind: "unavailable" };
      case 409:
        return { kind: "join", label: await appLabel(request.app) };
      default:
        throw error;
    }
  }
}
