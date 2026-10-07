"""Registry of apps that keep their own sessions (ADR-0016, ADR-0017).

Two scopes:

- ``app`` (self-service, e.g. Events): described below.
- ``staff`` (GAA Admin, CMS): sessions come only from the auth.barrels.gd
  handoff, require an approved staff account, and mint ordinary staff tokens
  so existing staff routes keep working.

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
Scope = Literal["app", "staff"]


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
    #: Secret the app's web server presents to redeem a single sign-on code
    #: (ADR-0017). Empty means the app does not take part in single sign-on.
    client_secret: str = ""
    #: Path on ``url`` that redeems a handoff code.
    callback_path: str = "/auth/callback"
    scope: Scope = "app"

    @property
    def access_permission(self) -> str:
        return f"app.{self.key}.access"

    @property
    def sso(self) -> bool:
        return bool(self.client_secret)

    @property
    def callback_url(self) -> str:
        return f"{self.url}{self.callback_path}"


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
        client_secret=auth_settings.EVENTS_SSO_CLIENT_SECRET,
    )
    # Staff apps: no sign-in methods of their own; access is staff approval.
    gaa_admin = AppDefinition(
        key="gaa-admin",
        label="GAA Admin",
        url=auth_settings.GAA_ADMIN_APP_URL.rstrip("/"),
        self_signup=False,
        default_role="",
        google_redirect_uri="",
        methods=frozenset(),
        client_secret=auth_settings.GAA_ADMIN_SSO_CLIENT_SECRET,
        scope="staff",
    )
    cms = AppDefinition(
        key="cms",
        label="GMS content",
        url=auth_settings.CMS_APP_URL.rstrip("/"),
        self_signup=False,
        default_role="",
        google_redirect_uri="",
        methods=frozenset(),
        client_secret=auth_settings.CMS_SSO_CLIENT_SECRET,
        scope="staff",
    )
    return {app.key: app for app in (events, gaa_admin, cms)}


def is_registered(app_name: str | None) -> bool:
    """Whether a session belongs to a registered app rather than the account."""
    return app_name is not None and app_name in _apps()


def is_app_scoped(app_name: str | None) -> bool:
    """Sessions whose tokens carry an ``app`` claim (self-service apps only).

    Legacy sessions carry free-form app names, and staff-app sessions mint
    ordinary staff tokens, so neither is scoped.
    """
    app = _apps().get(app_name) if app_name is not None else None
    return app is not None and app.scope == "app"


def get_app(key: str) -> AppDefinition:
    app = _apps().get(key)
    if app is None:
        raise AppException("Unknown app", 404)
    return app


def require_method(app: AppDefinition, method: SignInMethod) -> None:
    if method not in app.methods:
        raise AppException("This sign-in method is not available", 503)
