import { configureApiClient, getApiClientConfig } from "@barrelsgd/api-client";

/**
 * Point the generated client at this host (`/api/v1/...`, served by the
 * same-origin proxy). Runs once in the browser; a base URL that a caller set
 * first (a test, for example) is kept.
 */
export function ensureSameOriginApiClient(): void {
  if (getApiClientConfig().baseURL === undefined) {
    configureApiClient({ baseURL: "" });
  }
}
