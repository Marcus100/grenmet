# Testing

See [API Testing guide](../../../docs/api/testing.md) for running tests, coverage, and pre-deployment checks.

## How tests reach the database and auth

Tests run against a **real Postgres** (the `db_async` fixture in `tests/conftest.py`),
not a mock. Isolation is by full-table cleanup around each test, not transaction
rollback, so a test's committed writes are visible to the app under test.

Two layers exist, and they use **separate sessions**:

- **Service-level tests** call service functions directly with the `db_async`
  session and assert on the returned models (most HR/CAP/auth service tests).
- **Endpoint-level tests** drive the ASGI app through `async_client`. The app's
  `get_db` opens its **own** session, so these tests rely on the service layer
  committing — they do not share the `db_async` session. Authentication uses a
  **real JWT** minted for the seeded superuser/test user
  (`superuser_token_headers_async` / `normal_user_token_headers_async`), not a
  `dependency_overrides` shim.

Use `app.dependency_overrides` when you need to stub an **external** dependency
(e.g. a third-party client) or force an error path; it is not required for auth or
DB access given the real-JWT + real-DB approach above.
