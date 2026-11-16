// The organiser's sign-in state (docs/adr/0061-browser-only-app-sign-in.md).
//
// - The access token lives in memory only and is renewed before it ends.
// - The session token lives in this tab's sessionStorage under one key, so a
//   reload keeps the person signed in and closing the tab ends it.
// - Each refresh returns a NEW session token that replaces the stored one.
// - Refreshes are serialised: concurrent callers share one request.
// - Nothing goes in localStorage, IndexedDB, a cache or a URL.

import {
  authLogoutSession,
  authRefreshSession,
  configureApiClient,
  type SessionLoginResponse,
  sessionLoginResponseSchema,
} from "@barrelsgd/api-client";
import { reportError } from "@/lib/report-error";
import { invalidResponse, isHttpError, sessionEnded } from "@/organiser/errors";

/** The only sessionStorage key for the session token. */
export const SESSION_STORAGE_KEY = "printix-organiser.session";
/** The organisation the person chose in this tab. An id, never a secret. */
export const ORGANISATION_STORAGE_KEY = "printix-organiser.organisation";

/** Renew this long before the access token ends, so no call starts with a dying token. */
const RENEW_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const LOGOUT_TIMEOUT_MS = 10_000;

/** The part of Web Storage the session needs; tests pass a Map-backed fake. */
export interface SessionStorageLike {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

/** This tab's sessionStorage, or null where the browser blocks it. */
export function browserSessionStorage(): SessionStorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export interface Person {
  readonly email: string;
}

/**
 * Why the session ended. "dropped": a refresh answer was lost (timeout or a
 * dropped connection), so the server may already have revoked the session.
 * "expired": the server refused a session it had no reason to doubt.
 */
export type EndReason = "dropped" | "expired";

interface AccessToken {
  readonly expiresAt: number;
  readonly token: string;
}

/**
 * Validates a sign-in or refresh answer against the generated schema. A
 * response that does not match is a failure, never a signed-in person.
 */
export function parseLogin(data: unknown): SessionLoginResponse {
  const parsed = sessionLoginResponseSchema.safeParse(data);
  // An expiry the phone cannot read would look expired on every call, so it
  // is refused here rather than renewing on every call.
  if (
    !parsed.success ||
    Number.isNaN(Date.parse(parsed.data.access_token_expires_at))
  ) {
    throw invalidResponse();
  }
  return parsed.data;
}

/** Tells the shared API client to use this session for organiser calls. */
function configureFor(origin: string, session: OrganiserSession): void {
  // The gate's scan-api.ts `connect` configures this same shared client with
  // its pairing secret. ScannerRoot mounts exactly one of the two apps per page
  // load, and every organiser call configures the client again before it
  // sends, so the organiser never reads the gate's header and the gate never
  // reads this one.
  configureApiClient({
    baseURL: origin,
    getHeaders: () => session.authorisation(),
  });
}

export class OrganiserSession {
  private readonly origin: string;
  private readonly storage: SessionStorageLike | null;
  private readonly now: () => number;
  private readonly listeners = new Set<(reason: EndReason) => void>();
  private token: string | null;
  private access: AccessToken | null = null;
  private person: Person | null = null;
  private pending: Promise<void> | null = null;
  /** Set when a refresh answer was lost; cleared on a good answer or sign-out. */
  private refreshMayBeLost = false;
  /** Bumped on sign-out, so a refresh that finishes afterwards is discarded. */
  private epoch = 0;

  constructor(options: {
    readonly origin: string;
    readonly storage: SessionStorageLike | null;
    readonly now?: () => number;
  }) {
    this.origin = options.origin;
    this.storage = options.storage;
    this.now = options.now ?? Date.now;
    this.token = this.readStoredToken();
  }

  /** Whether this tab holds a session token (possibly from before a reload). */
  hasSession(): boolean {
    return this.token !== null;
  }

  /** The signed-in person's email, once a sign-in or refresh has answered. */
  personEmail(): string | null {
    return this.person?.email ?? null;
  }

  /** The headers the shared client adds: the access token, if there is one. */
  authorisation(): Record<string, string> {
    return this.access ? { Authorization: `Bearer ${this.access.token}` } : {};
  }

  /** Points the shared API client at this session before a call. */
  prepare(): void {
    configureFor(this.origin, this);
  }

  /** Called when the server ends the session (a refresh was refused). */
  onEnded(listener: (reason: EndReason) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The organisation id this tab last chose, if any. */
  chosenOrganisation(): string | null {
    try {
      return this.storage?.getItem(ORGANISATION_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  chooseOrganisation(organisationId: string): void {
    try {
      this.storage?.setItem(ORGANISATION_STORAGE_KEY, organisationId);
    } catch (error) {
      reportError(error, "organiser-storage");
    }
  }

  /** Stores a sign-in: the session token in sessionStorage, the rest in memory. */
  adopt(login: SessionLoginResponse): void {
    this.token = login.session_token;
    this.access = {
      token: login.access_token,
      expiresAt: Date.parse(login.access_token_expires_at),
    };
    this.person = { email: login.user.email };
    this.refreshMayBeLost = false;
    try {
      this.storage?.setItem(SESSION_STORAGE_KEY, login.session_token);
    } catch (error) {
      // The session still works in memory; only a reload would lose it.
      reportError(error, "organiser-storage");
    }
  }

  /**
   * Runs one organiser call. Renews the access token first when it is near its
   * end. On a 401 it refreshes once and retries once; a second 401 is returned
   * to the caller.
   */
  async call<T>(run: () => Promise<T>): Promise<T> {
    this.prepare();
    await this.renewIfNeeded();
    const used = this.access?.token ?? null;
    try {
      return await run();
    } catch (error) {
      if (!isUnauthorised(error)) {
        throw error;
      }
      await this.refresh(used);
      this.prepare();
      try {
        return await run();
      } catch (retryError) {
        // A second 401 after a successful refresh: the session is not usable.
        // Back to sign-in, rather than a screen with only "Try again".
        if (isUnauthorised(retryError)) {
          this.end(this.epoch);
          throw sessionEnded();
        }
        throw retryError;
      }
    }
  }

  /** Signs out: revokes the session on the server, then clears this tab even if that fails. */
  async signOut(): Promise<void> {
    this.prepare();
    const token = this.token;
    this.epoch += 1;
    try {
      if (token !== null) {
        await requestLogout(token);
      }
    } catch (error) {
      reportError(error, "organiser-sign-out");
    } finally {
      this.clear();
    }
  }

  private async renewIfNeeded(): Promise<void> {
    if (this.access && this.access.expiresAt - this.now() > RENEW_MARGIN_MS) {
      return;
    }
    await this.refresh(this.access?.token ?? null);
  }

  /**
   * Renews the session. `stale` is the access token the caller used. When a
   * newer one is already in place (another caller renewed first), no second
   * refresh runs, because the old session token was already replaced.
   */
  refresh(stale: string | null): Promise<void> {
    if (this.pending) {
      return this.pending;
    }
    if (stale !== null && this.access && this.access.token !== stale) {
      return Promise.resolve();
    }
    const run: Promise<void> = this.renew().finally(() => {
      // Only the refresh that set `pending` may clear it.
      if (this.pending === run) {
        this.pending = null;
      }
    });
    this.pending = run;
    return run;
  }

  private async renew(): Promise<void> {
    const epoch = this.epoch;
    const sessionToken = this.token;
    if (sessionToken === null) {
      throw sessionEnded();
    }
    let login: SessionLoginResponse;
    try {
      login = await requestRefresh(sessionToken);
    } catch (error) {
      if (isRefusedSession(error)) {
        this.end(epoch);
        throw sessionEnded();
      }
      // The answer may have been lost after the server revoked the old token.
      if (isLostAnswer(error)) {
        this.refreshMayBeLost = true;
      }
      throw error;
    }
    if (epoch !== this.epoch) {
      // Signed out while this request was in flight: revoke what it issued.
      void requestLogout(login.session_token).catch((error: unknown) =>
        reportError(error, "organiser-sign-out")
      );
      throw sessionEnded();
    }
    this.adopt(login);
  }

  /** The server refused the session: clear this tab and tell the screen. */
  private end(epoch: number): void {
    if (epoch !== this.epoch) {
      return;
    }
    const hadSession = this.token !== null;
    const reason: EndReason = this.refreshMayBeLost ? "dropped" : "expired";
    this.clear();
    if (hadSession) {
      for (const listener of this.listeners) {
        listener(reason);
      }
    }
  }

  private clear(): void {
    this.epoch += 1;
    this.token = null;
    this.access = null;
    this.person = null;
    this.pending = null;
    this.refreshMayBeLost = false;
    try {
      this.storage?.removeItem(SESSION_STORAGE_KEY);
      this.storage?.removeItem(ORGANISATION_STORAGE_KEY);
    } catch (error) {
      reportError(error, "organiser-storage");
    }
  }

  private readStoredToken(): string | null {
    try {
      return this.storage?.getItem(SESSION_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }
}

/** No answer, or a request the phone gave up on: the server may have acted anyway. */
function isLostAnswer(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function isUnauthorised(error: unknown): boolean {
  return isHttpError(error) && error.status === 401;
}

/** The server no longer knows this session (or the token is unusable). */
function isRefusedSession(error: unknown): boolean {
  return isHttpError(error) && (error.status === 401 || error.status === 422);
}

async function requestRefresh(
  sessionToken: string
): Promise<SessionLoginResponse> {
  const { data } = await authRefreshSession({
    body: { session_token: sessionToken },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return parseLogin(data);
}

async function requestLogout(sessionToken: string): Promise<void> {
  await authLogoutSession({
    body: { session_token: sessionToken },
    signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS),
  });
}
