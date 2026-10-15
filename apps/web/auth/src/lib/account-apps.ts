import "server-only";

import {
  appJoinResultSchema,
  appLeaveResultSchema,
  authListAccountAppsStatus200Schema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "./auth-config";

/** Joining and leaving apps from the account page (ADR-0017). */

export function listAccountApps(sessionToken: string) {
  return authApiFetch(
    getAuthConfig(),
    "/auth/account/apps",
    authListAccountAppsStatus200Schema,
    { body: { session_token: sessionToken }, method: "POST" }
  );
}

export function joinAccountApp(app: string, sessionToken: string) {
  return authApiFetch(
    getAuthConfig(),
    `/auth/account/apps/${app}/join`,
    appJoinResultSchema,
    { body: { session_token: sessionToken }, method: "POST" }
  );
}

export function leaveAccountApp(app: string, sessionToken: string) {
  return authApiFetch(
    getAuthConfig(),
    `/auth/account/apps/${app}/leave`,
    appLeaveResultSchema,
    { body: { session_token: sessionToken }, method: "POST" }
  );
}
