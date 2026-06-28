"""Tests for auth schema validation (password length constraints)."""

import pytest
from pydantic import ValidationError

from src.auth.schemas import NewPassword, UpdatePassword


def test_new_password_rejects_short() -> None:
    """Password reset must enforce the same 8-char minimum as signup."""
    with pytest.raises(ValidationError):
        NewPassword(token="tok", new_password="short")  # 5 chars


def test_new_password_accepts_valid() -> None:
    payload = NewPassword(token="tok", new_password="validpass1")
    assert payload.new_password == "validpass1"


def test_update_password_rejects_short() -> None:
    with pytest.raises(ValidationError):
        UpdatePassword(current_password="whatever", new_password="short")


def test_update_password_accepts_valid() -> None:
    payload = UpdatePassword(current_password="whatever", new_password="validpass1")
    assert payload.new_password == "validpass1"
