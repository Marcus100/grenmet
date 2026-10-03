"""Registry of self-service apps that sign users in with their own sessions.

An app-scoped session belongs to one app: its access tokens carry an ``app``
claim, only that app's routes accept them, and staff (legacy) routes refuse
them. Access to an app is the permission ``app.<key>.access``; finer module
permissions come from the app's roles. See ADR-0016.
"""

from dataclasses import dataclass
from typing import Literal

from src.auth.config import auth_settings
from src.exceptions import AppException

SignInMethod = Literal["email_code", "password", "google", "phone"]


@dataclass(frozen=True)
class AppDefinition:
    key: str
    label: str
    url: str
    #: Whether anyone may create an account from this app's sign-in pages.
    self_signup: bool
    #: Role granted on self-service sign-up (must exist in DEFAULT_ROLES).
    default_role: str
    google_redirect_uri: str
    methods: frozenset[SignInMethod]

    @property
    def access_permission(self) -> str:
        return f"app.{self.key}.access"


def _apps() -> dict[str, AppDefinition]:
    methods: set[SignInMethod] = {"email_code", "password"}
    if auth_settings.GOOGLE_CLIENT_ID and auth_settings.EVENTS_GOOGLE_REDIRECT_URI:
        methods.add("google")
    if auth_settings.PHONE_OTP_PROVIDER != "disabled":
        methods.add("phone")
    events = AppDefinition(
        key="events",
        label="Barrels Events",
        url=auth_settings.EVENTS_APP_URL.rstrip("/"),
        self_signup=auth_settings.ALLOW_PUBLIC_SIGNUP,
        default_role="events-member",
        google_redirect_uri=auth_settings.EVENTS_GOOGLE_REDIRECT_URI,
        methods=frozenset(methods),
    )
    return {events.key: events}


def is_app_scoped(app_name: str | None) -> bool:
    """Legacy sessions carry free-form app names; only registered keys are scoped."""
    return app_name is not None and app_name in _apps()


def get_app(key: str) -> AppDefinition:
    app = _apps().get(key)
    if app is None:
        raise AppException("Unknown app", 404)
    return app


def require_method(app: AppDefinition, method: SignInMethod) -> None:
    if method not in app.methods:
        raise AppException("This sign-in method is not available", 503)
