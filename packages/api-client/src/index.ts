export type { ApiClientConfig } from "./configure.js";
export { configureApiClient, getApiClientConfig } from "./configure.js";
// The generator's barrel star-exports ResponseError from both its client and
// core runtime files; Node refuses a named import of an ambiguous star export.
// This explicit export wins over both (same class at runtime).
export { ResponseError } from "./gen/.kubb/client.js";
export * from "./gen/index.js";
