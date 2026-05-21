export interface ApiClientConfig {
  baseURL?: string;
  getHeaders?: () => Record<string, string>;
}

let config: ApiClientConfig = {};

export function configureApiClient(cfg: ApiClientConfig): void {
  config = { ...config, ...cfg };
}

export function getApiClientConfig(): ApiClientConfig {
  return config;
}
