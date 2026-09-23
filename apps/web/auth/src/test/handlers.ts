import { HttpResponse, http } from "msw";

const BASE = "http://localhost:8000/api/v1";

const SESSION_SUCCESS = {
  session_token: "tok_test_abc123",
  session_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  access_token: "at_test_abc123",
  access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  token_type: "bearer" as const,
  session: {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000002",
    app_name: null,
    client_type: "web",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    last_used_at: new Date().toISOString(),
    revoked_at: null,
  },
  user: {
    id: "00000000-0000-4000-8000-000000000002",
    email: "jane@example.com",
    full_name: "Jane Smith",
    is_active: true,
    is_superuser: false,
  },
};

export const signInSuccess = http.post(`${BASE}/login/session`, () =>
  HttpResponse.json(SESSION_SUCCESS)
);

export const signInMalformedResponse = http.post(`${BASE}/login/session`, () =>
  HttpResponse.json({
    ...SESSION_SUCCESS,
    session_expires_at: "2026-09-20T19:13:54+0000",
  })
);

export const signInBadCredentials = http.post(`${BASE}/login/session`, () =>
  HttpResponse.json({ detail: "Incorrect email or password" }, { status: 400 })
);

export const signInMfaRequired = http.post(`${BASE}/login/session`, () =>
  HttpResponse.json(
    { detail: "Two-factor authentication code required or invalid" },
    { status: 400 }
  )
);

export const signInVerifyRequired = http.post(`${BASE}/login/session`, () =>
  HttpResponse.json(
    { detail: "Verify your email and set your password before signing in" },
    { status: 403 }
  )
);

export const signInAwaitingApproval = http.post(`${BASE}/login/session`, () =>
  HttpResponse.json(
    { detail: "Your registration is awaiting administrator approval" },
    { status: 403 }
  )
);

export const signInServiceDown = http.post(`${BASE}/login/session`, () =>
  HttpResponse.error()
);

export const signOutSuccess = http.post(`${BASE}/login/session/logout`, () =>
  HttpResponse.json({ message: "Logged out" })
);

export const signUpSuccess = http.post(`${BASE}/auth/users/signup`, () =>
  HttpResponse.json({
    id: "00000000-0000-4000-8000-000000000003",
    email: "new@example.com",
    username: "newuser",
    first_name: "New",
    last_name: "User",
    middle_name: null,
    full_name: "New User",
    is_active: true,
    is_superuser: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
);

export const signUpEmailTaken = http.post(`${BASE}/auth/users/signup`, () =>
  HttpResponse.json({ detail: "Email already registered" }, { status: 400 })
);
