import { configureApiClient } from "@grenmet/api-client";
import { getAuthHeader } from "./auth-header.js";
import { setDefaultTokenStore } from "./token-store.js";
import type { AuthClientConfig } from "./types.js";

export function configureAuthClient(config: AuthClientConfig = {}): void {
  if (config.tokenStore) {
    setDefaultTokenStore(config.tokenStore);
  }

  configureApiClient({
    baseURL: config.baseURL,
    getHeaders: () => getAuthHeader(),
  });
}
