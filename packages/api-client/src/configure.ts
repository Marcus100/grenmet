import { client } from "./gen/.kubb/client.js";

export interface ApiClientConfig {
  baseURL?: string;
  getHeaders?: () => Record<string, string>;
}

let config: ApiClientConfig = {};

export function configureApiClient(cfg: ApiClientConfig): void {
  config = { ...config, ...cfg };
  client.setConfig({
    baseURL: config.baseURL,
    credentials: "same-origin",
    throwOnError: true,
  });
}

export function getApiClientConfig(): ApiClientConfig {
  return config;
}

// Resolve headers at request time so rotated credentials are never captured.
client.interceptors.request.use((request) => ({
  ...request,
  headers: { ...config.getHeaders?.(), ...request.headers },
}));
