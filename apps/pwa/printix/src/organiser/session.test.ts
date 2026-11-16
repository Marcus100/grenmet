// @vitest-environment jsdom
import {
  configureApiClient,
  getApiClientConfig,
  printixListMyOrganiserOrganisations,
} from "@barrelsgd/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ORGANISATION_STORAGE_KEY,
  OrganiserSession,
  parseLogin,
  SESSION_STORAGE_KEY,
} from "@/organiser/session";
import {
  countCalls,
  json,
  loginBody,
  ORIGIN,
  routeFetch,
} from "@/test/organiser-fetch";

const ORGS = "GET /api/v1/printix/me/organisations";
const REFRESH = "POST /api/v1/auth/sessions/refresh";
const LOGOUT = "POST /api/v1/auth/sessions/logout";
const OLD_SESSION = `old-${"x".repeat(40)}`;
const NEW_SESSION = `new-${"y".repeat(40)}`;

/** The values currently held by a Web Storage object. */
function storedValues(storage: Storage): string[] {
  return Array.from(
    { length: storage.length },
    (_, index) => storage.key(index) ?? ""
  ).map((key) => storage.getItem(key) ?? "");
}

function timeoutError(): Error {
  const error = new Error("The operation timed out.");
  error.name = "TimeoutError";
  return error;
}

function authorisationOf(request: Request): string | null {
  return request.headers.get("Authorization");
}

function listOrganisations() {
  return printixListMyOrganiserOrganisations().then(
    (response) => response.data
  );
}

/** A session signed in with an access token that has already run out. */
function expiredSession(): OrganiserSession {
  const session = new OrganiserSession({
    origin: ORIGIN,
    storage: window.sessionStorage,
  });
  session.adopt(
    parseLogin(
      loginBody({
        accessToken: "access-old",
        sessionToken: OLD_SESSION,
        accessExpiresInMs: -1000,
      })
    )
  );
  return session;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("sign-in storage", () => {
  it("stores only the session token in sessionStorage, under one key", () => {
    const session = new OrganiserSession({
      origin: ORIGIN,
      storage: window.sessionStorage,
    });
    session.adopt(
      parseLogin(
        loginBody({
          accessToken: "ACCESS-SECRET-VALUE",
          sessionToken: NEW_SESSION,
        })
      )
    );

    expect(window.sessionStorage.length).toBe(1);
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(
      NEW_SESSION
    );
    expect(storedValues(window.sessionStorage).join(" ")).not.toContain(
      "ACCESS-SECRET-VALUE"
    );
    expect(window.localStorage.length).toBe(0);
  });

  it("keeps the access token in memory, where the shared client reads it", () => {
    const session = new OrganiserSession({
      origin: ORIGIN,
      storage: window.sessionStorage,
    });
    expect(session.authorisation()).toEqual({});
    session.adopt(parseLogin(loginBody({ accessToken: "access-in-memory" })));
    expect(session.authorisation()).toEqual({
      Authorization: "Bearer access-in-memory",
    });
    expect(session.personEmail()).toBe("organiser@example.test");
  });

  it("restores a session from sessionStorage after a reload", () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, NEW_SESSION);
    const session = new OrganiserSession({
      origin: ORIGIN,
      storage: window.sessionStorage,
    });
    expect(session.hasSession()).toBe(true);
    expect(session.authorisation()).toEqual({});
  });

  it("keeps the chosen organisation in sessionStorage, never localStorage", () => {
    const session = new OrganiserSession({
      origin: ORIGIN,
      storage: window.sessionStorage,
    });
    session.chooseOrganisation("org-1");
    expect(session.chosenOrganisation()).toBe("org-1");
    expect(window.sessionStorage.getItem(ORGANISATION_STORAGE_KEY)).toBe(
      "org-1"
    );
    expect(window.localStorage.length).toBe(0);
  });
});

describe("refresh", () => {
  it("renews a token that is near its end and replaces the stored session token", async () => {
    const session = expiredSession();
    const spy = routeFetch({
      [ORGS]: (request) =>
        authorisationOf(request) === "Bearer access-new"
          ? json(200, [])
          : json(401, { detail: "old token" }),
      [REFRESH]: () =>
        json(
          200,
          loginBody({ accessToken: "access-new", sessionToken: NEW_SESSION })
        ),
    });

    await expect(session.call(listOrganisations)).resolves.toEqual([]);

    const refreshRequest = spy.mock.calls.find(([request]) =>
      request.url.endsWith("/auth/sessions/refresh")
    )?.[0];
    expect(await refreshRequest?.json()).toEqual({
      session_token: OLD_SESSION,
    });
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(
      NEW_SESSION
    );
    expect(storedValues(window.sessionStorage)).not.toContain(OLD_SESSION);
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toContain(
      "access-new"
    );
  });

  it("refreshes once when several calls need it at the same moment", async () => {
    const session = expiredSession();
    const spy = routeFetch({
      [ORGS]: (request) =>
        authorisationOf(request) === "Bearer access-new"
          ? json(200, [])
          : json(401, { detail: "old token" }),
      [REFRESH]: () =>
        json(
          200,
          loginBody({ accessToken: "access-new", sessionToken: NEW_SESSION })
        ),
    });

    const results = await Promise.all([
      session.call(listOrganisations),
      session.call(listOrganisations),
      session.call(listOrganisations),
    ]);

    expect(results).toEqual([[], [], []]);
    expect(countCalls(spy, REFRESH)).toBe(1);
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(
      NEW_SESSION
    );
  });

  it("on a 401 refreshes once, retries once and then succeeds", async () => {
    const session = new OrganiserSession({
      origin: ORIGIN,
      storage: window.sessionStorage,
    });
    session.adopt(
      parseLogin(
        loginBody({ accessToken: "access-stale", sessionToken: OLD_SESSION })
      )
    );
    const spy = routeFetch({
      [ORGS]: (request) =>
        authorisationOf(request) === "Bearer access-fresh"
          ? json(200, [])
          : json(401, { detail: "Could not validate credentials" }),
      [REFRESH]: () =>
        json(
          200,
          loginBody({ accessToken: "access-fresh", sessionToken: NEW_SESSION })
        ),
    });

    await expect(session.call(listOrganisations)).resolves.toEqual([]);
    expect(countCalls(spy, ORGS)).toBe(2);
    expect(countCalls(spy, REFRESH)).toBe(1);
  });

  it("ends the session when a second 401 follows a successful refresh", async () => {
    const session = new OrganiserSession({
      origin: ORIGIN,
      storage: window.sessionStorage,
    });
    session.adopt(
      parseLogin(
        loginBody({ accessToken: "access-stale", sessionToken: OLD_SESSION })
      )
    );
    const ended = vi.fn();
    session.onEnded(ended);
    const spy = routeFetch({
      [ORGS]: () => json(401, { detail: "still refused" }),
      [REFRESH]: () =>
        json(
          200,
          loginBody({ accessToken: "access-fresh", sessionToken: NEW_SESSION })
        ),
    });

    await expect(session.call(listOrganisations)).rejects.toMatchObject({
      name: "SessionEndedError",
    });
    expect(countCalls(spy, ORGS)).toBe(2);
    expect(countCalls(spy, REFRESH)).toBe(1);
    expect(ended).toHaveBeenCalledWith("expired");
    expect(session.hasSession()).toBe(false);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("a refresh answer lost to a timeout signs the person out on the next call, as dropped", async () => {
    const session = expiredSession();
    const reasons: string[] = [];
    session.onEnded((reason) => reasons.push(reason));
    let refreshes = 0;
    routeFetch({
      [REFRESH]: () => {
        refreshes += 1;
        return refreshes === 1
          ? Promise.reject(timeoutError())
          : json(401, { detail: "Invalid or expired session" });
      },
    });

    // The first answer never arrives: the phone does not know what happened yet.
    await expect(session.call(listOrganisations)).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(session.hasSession()).toBe(true);

    // The server had already revoked the old token, so the next refresh is refused.
    await expect(session.call(listOrganisations)).rejects.toMatchObject({
      name: "SessionEndedError",
    });
    expect(reasons).toEqual(["dropped"]);
    expect(session.hasSession()).toBe(false);
  });

  it("signs the person out when the server refuses the refresh", async () => {
    const session = expiredSession();
    const ended = vi.fn();
    session.onEnded(ended);
    routeFetch({
      [REFRESH]: () => json(401, { detail: "Invalid or expired session" }),
    });

    await expect(session.call(listOrganisations)).rejects.toMatchObject({
      name: "SessionEndedError",
    });
    expect(ended).toHaveBeenCalledTimes(1);
    expect(session.hasSession()).toBe(false);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("keeps the session when the refresh fails for lack of signal", async () => {
    const session = expiredSession();
    const ended = vi.fn();
    session.onEnded(ended);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );

    await expect(session.call(listOrganisations)).rejects.toBeInstanceOf(
      TypeError
    );
    expect(ended).not.toHaveBeenCalled();
    expect(session.hasSession()).toBe(true);
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(
      OLD_SESSION
    );
  });

  it("discards a refresh that finishes after sign-out, and revokes what it issued", async () => {
    const session = expiredSession();
    let answerRefresh: (response: Response) => void = () => undefined;
    const spy = routeFetch({
      [REFRESH]: () =>
        new Promise<Response>((resolve) => {
          answerRefresh = resolve;
        }),
      [LOGOUT]: () => json(200, { message: "ok" }),
    });

    const pending = session.call(listOrganisations);
    // Let the refresh start, then sign out while it is still in flight.
    await vi.waitFor(() => expect(countCalls(spy, REFRESH)).toBe(1));
    const signingOut = session.signOut();
    answerRefresh(
      json(
        200,
        loginBody({ accessToken: "access-late", sessionToken: NEW_SESSION })
      )
    );

    await expect(pending).rejects.toMatchObject({ name: "SessionEndedError" });
    await signingOut;
    await vi.waitFor(() => expect(countCalls(spy, LOGOUT)).toBe(2));
    const logoutTokens = spy.mock.calls
      .filter(([request]) => request.url.endsWith("/auth/sessions/logout"))
      .map(([request]) => request.clone().json());
    await expect(Promise.all(logoutTokens)).resolves.toEqual([
      { session_token: OLD_SESSION },
      { session_token: NEW_SESSION },
    ]);
    expect(window.sessionStorage.length).toBe(0);
    expect(session.hasSession()).toBe(false);
  });
});

describe("sign-out", () => {
  it("revokes the session on the server with its token, then clears this tab", async () => {
    const session = new OrganiserSession({
      origin: ORIGIN,
      storage: window.sessionStorage,
    });
    session.adopt(parseLogin(loginBody({ sessionToken: NEW_SESSION })));
    session.chooseOrganisation("org-1");
    const spy = routeFetch({
      [LOGOUT]: () => json(200, { message: "signed out" }),
    });

    await session.signOut();

    expect(countCalls(spy, LOGOUT)).toBe(1);
    const body = await spy.mock.calls[0]?.[0].json();
    expect(body).toEqual({ session_token: NEW_SESSION });
    expect(window.sessionStorage.length).toBe(0);
    expect(session.hasSession()).toBe(false);
    expect(session.authorisation()).toEqual({});
  });

  it("clears this tab even when the server call fails, and reports it", async () => {
    const session = new OrganiserSession({
      origin: ORIGIN,
      storage: window.sessionStorage,
    });
    session.adopt(parseLogin(loginBody({ sessionToken: NEW_SESSION })));
    session.chooseOrganisation("org-1");
    const reported = vi.fn();
    window.addEventListener("pwa:error", reported);
    routeFetch({
      [LOGOUT]: () => json(500, { detail: "down" }),
    });

    await session.signOut();

    expect(window.sessionStorage.length).toBe(0);
    expect(session.hasSession()).toBe(false);
    expect(reported).toHaveBeenCalledTimes(1);
    window.removeEventListener("pwa:error", reported);
  });

  it("clears this tab when there is no signal for the server call", async () => {
    const session = new OrganiserSession({
      origin: ORIGIN,
      storage: window.sessionStorage,
    });
    session.adopt(parseLogin(loginBody({ sessionToken: NEW_SESSION })));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );

    await session.signOut();

    expect(window.sessionStorage.length).toBe(0);
    expect(session.hasSession()).toBe(false);
  });
});

describe("the shared client is set up for the organiser only", () => {
  it("prepare() replaces the gate's headers, so the pairing secret is never sent from organiser calls", async () => {
    // What the gate does when it runs on the same shared client.
    configureApiClient({
      baseURL: "https://gate.example.test",
      getHeaders: () => ({ Authorization: "Bearer GATE-PAIRING-SECRET" }),
    });
    const session = new OrganiserSession({
      origin: ORIGIN,
      storage: window.sessionStorage,
    });
    session.adopt(parseLogin(loginBody({ accessToken: "ORGANISER-ACCESS" })));

    session.prepare();

    const config = getApiClientConfig();
    expect(config.baseURL).toBe(ORIGIN);
    expect(config.getHeaders?.()).toEqual({
      Authorization: "Bearer ORGANISER-ACCESS",
    });
    const spy = routeFetch({ [ORGS]: () => json(200, []) });
    await session.call(listOrganisations);
    const sent = spy.mock.calls[0]?.[0];
    expect(sent?.url.startsWith(ORIGIN)).toBe(true);
    expect(sent?.headers.get("Authorization")).toBe("Bearer ORGANISER-ACCESS");
    expect(JSON.stringify([...(sent?.headers.entries() ?? [])])).not.toContain(
      "GATE-PAIRING-SECRET"
    );
  });
});
