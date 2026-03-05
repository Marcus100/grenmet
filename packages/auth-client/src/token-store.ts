const DEFAULT_STORAGE_KEY = "grenmet_access_token";

export interface TokenStore {
  getToken(): string | null;
  setToken(token: string): void;
  clearToken(): void;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function createSessionStorageStore(
  storageKey = DEFAULT_STORAGE_KEY
): TokenStore {
  return {
    getToken() {
      const storage = getStorage();
      return storage ? storage.getItem(storageKey) : null;
    },
    setToken(token: string) {
      const storage = getStorage();
      if (storage) storage.setItem(storageKey, token);
    },
    clearToken() {
      const storage = getStorage();
      if (storage) storage.removeItem(storageKey);
    },
  };
}

export function createMemoryStore(): TokenStore {
  let token: string | null = null;
  return {
    getToken: () => token,
    setToken: (t) => {
      token = t;
    },
    clearToken: () => {
      token = null;
    },
  };
}

let defaultStore: TokenStore = createSessionStorageStore();

export function getDefaultTokenStore(): TokenStore {
  return defaultStore;
}

export function setDefaultTokenStore(store: TokenStore): void {
  defaultStore = store;
}
