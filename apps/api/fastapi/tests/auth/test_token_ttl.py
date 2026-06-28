"""Token TTL policy defaults.

These assert the *code defaults* (env-independent). Note: the live value can be
overridden by ACCESS_TOKEN_EXPIRE_MINUTES in the environment — lower it in
.env.local / staging / prod for the short default to take effect.
"""

from src.auth.config import AuthConfig


def test_legacy_access_token_default_is_short() -> None:
    assert AuthConfig.model_fields["ACCESS_TOKEN_EXPIRE_MINUTES"].default == 60


def test_session_access_token_default_is_short() -> None:
    assert AuthConfig.model_fields["SESSION_ACCESS_TOKEN_EXPIRE_MINUTES"].default == 15
