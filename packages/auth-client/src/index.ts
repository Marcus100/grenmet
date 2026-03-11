export { configureAuthClient } from "./configure.js";
export { login, logout } from "./login.js";
export { getAuthHeader } from "./auth-header.js";
export {
  getAccessToken,
  getCurrentUser,
  isAuthenticated,
} from "./session.js";
export {
  createSessionStorageStore,
  createMemoryStore,
  getDefaultTokenStore,
  setDefaultTokenStore,
} from "./token-store.js";
export type { TokenStore } from "./token-store.js";
export type {
  AuthClientConfig,
  LoginParams,
  LoginResult,
  SessionUser,
  Token,
} from "./types.js";
export { AuthError } from "./types.js";
