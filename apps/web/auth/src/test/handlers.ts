import { HttpResponse, http } from "msw";

const BASE = "http://localhost:8000/api/v1";

const SESSION_SUCCESS = {
  session_token: "tok_test_abc123",
  session_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  access_token: "at_test_abc123",
  access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  token_type: "bearer" as const,
  session: {
    id: "session_1",
    user_id: "user_1",
    app_name: null,
    client_type: "web",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    last_used_at: new Date().toISOString(),
    revoked_at: null,
  },
  user: {
    id: "user_1",
    email: "jane@example.com",
    full_name: "Jane Smith",
    is_active: true,
    is_superuser: false,
  },
};

export const signInSuccess = http.post(`${BASE}/login/session`, () =>
  HttpResponse.json(SESSION_SUCCESS)
);

export const signInBadCredentials = http.post(`${BASE}/login/session`, () =>
  HttpResponse.json({ detail: "Incorrect email or password" }, { status: 400 })
);

export const signInServiceDown = http.post(`${BASE}/login/session`, () =>
  HttpResponse.error()
);

export const signOutSuccess = http.post(`${BASE}/login/session/logout`, () =>
  HttpResponse.json({ message: "Logged out" })
);

export const signUpSuccess = http.post(`${BASE}/auth/users/signup`, () =>
  HttpResponse.json({
    id: "user_2",
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
