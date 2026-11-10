"""Encoder failures become records, never exceptions; the schema preload is off the loop."""

from typing import Any

import pytest

from src.eregister import encodings, iwxxm

FAILED = {"valid": False, "errors": ["failed"]}


async def test_run_encoder_returns_the_record_when_the_encoder_works() -> None:
    def works(**kwargs: Any) -> dict[str, Any]:
        return {"valid": True, "value": kwargs["value"]}

    record = await encodings.run_encoder("TEST", works, FAILED, value=3)
    assert record == {"valid": True, "value": 3}


@pytest.mark.parametrize("error", [KeyError("k"), RuntimeError("r"), ValueError("v")])
async def test_run_encoder_turns_any_crash_into_the_failed_record(
    error: Exception,
) -> None:
    def crash(**_kwargs: Any) -> dict[str, Any]:
        raise error

    assert await encodings.run_encoder("TEST", crash, FAILED) == FAILED


def test_preload_does_nothing_without_the_schemas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(iwxxm, "schemas_installed", lambda: False)
    assert iwxxm.preload_schema_in_background() is None


def test_preload_loads_the_schema_on_a_background_thread(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loaded: list[str] = []
    monkeypatch.setattr(iwxxm, "schemas_installed", lambda: True)
    monkeypatch.setattr(iwxxm, "_load_schema", lambda: loaded.append("loaded"))
    thread = iwxxm.preload_schema_in_background()
    assert thread is not None
    thread.join(timeout=5)
    assert loaded == ["loaded"]
    assert thread.daemon is True
