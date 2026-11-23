"""Download resilience of scripts/fetch_iwxxm_schemas.py, with a fake HTTP transport.

No network: every request goes to an httpx.MockTransport, and sleeps are recorded
instead of performed. The real manifest is used where the file list matters.
"""

import hashlib
import json
import sys
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest

from scripts import fetch_iwxxm_schemas as fetcher

RAW_BASE = "https://example.test/tag/"


def manifest_for(contents: dict[str, bytes]) -> dict[str, Any]:
    return {
        "raw_base": RAW_BASE,
        "files": {
            relative: hashlib.sha256(data).hexdigest()
            for relative, data in contents.items()
        },
    }


class Recorder:
    """Records every sleep so tests can assert on the back-off without waiting."""

    def __init__(self) -> None:
        self.delays: list[float] = []

    def __call__(self, seconds: float, stop: threading.Event | None = None) -> None:
        self.delays.append(seconds)


def run(
    manifest: dict[str, Any],
    handler: Callable[[httpx.Request], httpx.Response],
    sleep: Recorder | None = None,
    jitter: Callable[[], float] = lambda: 0.0,
) -> dict[str, bytes]:
    return fetcher.download_pinned(
        manifest,
        transport=httpx.MockTransport(handler),
        sleep=sleep or Recorder(),
        jitter=jitter,
    )


ALPHA = {"IWXXM/a.xsd": b"alpha"}


def test_503_then_200_succeeds_after_one_retry() -> None:
    seen: list[str] = []
    sleep = Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        if len(seen) == 1:
            return httpx.Response(503, text="Backend.max_conn reached")
        return httpx.Response(200, content=b"alpha")

    found = run(manifest_for(ALPHA), handler, sleep)

    assert found == ALPHA
    assert seen == [RAW_BASE + "IWXXM/a.xsd"] * 2
    assert len(sleep.delays) == 1


@pytest.mark.parametrize(
    "transient",
    [
        httpx.Response(500),
        httpx.Response(502),
        httpx.Response(429),
        httpx.ConnectError("connection refused"),
        httpx.ReadTimeout("timed out"),
        httpx.RemoteProtocolError("Server disconnected without sending a response."),
    ],
    ids=["500", "502", "429", "connect-error", "timeout", "server-disconnect"],
)
def test_other_transient_failures_are_retried(transient: Any) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            if isinstance(transient, Exception):
                raise transient
            return transient
        return httpx.Response(200, content=b"alpha")

    assert run(manifest_for(ALPHA), handler) == ALPHA
    assert calls == 2


def test_persistent_503_fails_after_five_attempts_naming_the_file() -> None:
    calls = 0
    sleep = Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    with pytest.raises(fetcher.DownloadError) as caught:
        run(manifest_for(ALPHA), handler, sleep)

    assert calls == fetcher.RETRY_ATTEMPTS == 5
    assert len(sleep.delays) == 4  # no wait after the last attempt
    message = str(caught.value)
    assert "IWXXM/a.xsd" in message
    assert "5 attempts" in message
    assert "HTTP 503" in message


def test_persistent_connection_error_fails_loudly_with_the_error_name() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    with pytest.raises(fetcher.DownloadError, match=r"IWXXM/a\.xsd.*ConnectError"):
        run(manifest_for(ALPHA), handler)


def test_404_fails_immediately_without_retry() -> None:
    calls = 0
    sleep = Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(404)

    with pytest.raises(fetcher.DownloadError) as caught:
        run(manifest_for(ALPHA), handler, sleep)

    assert calls == 1
    assert sleep.delays == []
    assert "IWXXM/a.xsd" in str(caught.value)
    assert "404" in str(caught.value)


@pytest.mark.parametrize("status", [400, 401, 403])
def test_other_4xx_fail_immediately(status: int) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(status)

    with pytest.raises(fetcher.DownloadError, match=str(status)):
        run(manifest_for(ALPHA), handler)
    assert calls == 1


def test_retry_after_seconds_is_honoured() -> None:
    calls = 0
    sleep = Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, headers={"Retry-After": "7"})
        return httpx.Response(200, content=b"alpha")

    assert run(manifest_for(ALPHA), handler, sleep) == ALPHA
    # Back-off for attempt 1 is at most 1 s here, so the server's 7 s wins.
    assert sleep.delays == [7.0]


def test_retry_after_is_capped_at_sixty_seconds() -> None:
    calls = 0
    sleep = Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, headers={"Retry-After": "3600"})
        return httpx.Response(200, content=b"alpha")

    run(manifest_for(ALPHA), handler, sleep)
    assert sleep.delays == [60.0]


def test_retry_after_http_date_uses_the_injected_clock() -> None:
    calls = 0
    sleep = Recorder()
    now = 1_800_000_000.0  # fixed clock: 2027-01-15 08:00:00 UTC

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(
                429, headers={"Retry-After": "Fri, 15 Jan 2027 08:00:12 GMT"}
            )
        return httpx.Response(200, content=b"alpha")

    fetcher.download_pinned(
        manifest_for(ALPHA),
        transport=httpx.MockTransport(handler),
        sleep=sleep,
        jitter=lambda: 0.0,
        clock=lambda: now,
    )
    assert sleep.delays == [12.0]


def test_backoff_doubles_with_jitter_bounds() -> None:
    sleep = Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    with pytest.raises(fetcher.DownloadError):
        run(manifest_for(ALPHA), handler, sleep, jitter=lambda: 0.0)
    # Equal jitter with the lowest draw: half of 1, 2, 4, 8.
    assert sleep.delays == [0.5, 1.0, 2.0, 4.0]

    sleep = Recorder()
    with pytest.raises(fetcher.DownloadError):
        run(manifest_for(ALPHA), handler, sleep, jitter=lambda: 0.999)
    for delay, step in zip(sleep.delays, [1, 2, 4, 8], strict=True):
        assert step / 2 <= delay <= step


def test_concurrency_is_limited_to_eight_parallel_requests() -> None:
    contents = {
        f"IWXXM/file{index:02d}.xsd": f"body {index}".encode() for index in range(40)
    }
    lock = threading.Lock()
    in_flight = 0
    peak = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal in_flight, peak
        with lock:
            in_flight += 1
            peak = max(peak, in_flight)
        try:
            time.sleep(0.005)
            relative = str(request.url).removeprefix(RAW_BASE)
            return httpx.Response(200, content=contents[relative])
        finally:
            with lock:
                in_flight -= 1

    found = run(manifest_for(contents), handler)

    assert found == contents
    assert peak <= fetcher.MAX_PARALLEL_DOWNLOADS == 8
    assert peak > 1  # the downloads really do overlap


def test_downloaded_file_list_is_the_pinned_list_requested_once_each() -> None:
    manifest = fetcher.load_manifest()
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, content=b"")

    found = run(manifest, handler)

    expected_urls = sorted(
        manifest["raw_base"] + relative for relative in manifest["files"]
    )
    assert sorted(requested) == expected_urls
    assert set(found) == set(manifest["files"])
    assert len(found) == 100


def test_the_pinned_manifest_itself_is_unchanged() -> None:
    manifest = json.loads(fetcher.MANIFEST_PATH.read_text(encoding="utf-8"))
    assert manifest["tag"] == "v2025-2"
    assert manifest["raw_base"].endswith("/v2025-2/")
    assert len(manifest["files"]) == 100


def test_oversized_file_is_rejected_by_name() -> None:
    big = b"x" * (fetcher.MAX_FILE_BYTES + 1)
    with pytest.raises(fetcher.DownloadError, match=r"IWXXM/a\.xsd.*larger"):
        run(
            {"raw_base": RAW_BASE, "files": {"IWXXM/a.xsd": "0" * 64}},
            lambda request: httpx.Response(200, content=big),
        )


def test_server_disconnect_then_200_succeeds() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.RemoteProtocolError(
                "Server disconnected without sending a response."
            )
        return httpx.Response(200, content=b"alpha")

    assert run(manifest_for(ALPHA), handler) == ALPHA
    assert calls == 2


def test_persistent_server_disconnect_fails_after_five_attempts() -> None:
    calls = 0
    sleep = Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.RemoteProtocolError(
            "Server disconnected without sending a response."
        )

    with pytest.raises(
        fetcher.DownloadError, match=r"IWXXM/a\.xsd.*RemoteProtocolError"
    ):
        run(manifest_for(ALPHA), handler, sleep)
    assert calls == 5
    assert len(sleep.delays) == 4


def test_unsupported_protocol_is_not_retried() -> None:
    calls = 0
    sleep = Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.UnsupportedProtocol("Request URL has an unsupported protocol.")

    with pytest.raises(fetcher.DownloadError, match=r"IWXXM/a\.xsd.*not retried"):
        run(manifest_for(ALPHA), handler, sleep)
    assert calls == 1
    assert sleep.delays == []


def test_a_stopped_download_makes_no_request() -> None:
    calls = 0
    stop = threading.Event()
    stop.set()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, content=b"alpha")

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(fetcher.DownloadError, match="stopped"):
            fetcher.fetch_one(
                client,
                "IWXXM/a.xsd",
                RAW_BASE + "IWXXM/a.xsd",
                sleep=Recorder(),
                clock=lambda: 0.0,
                jitter=lambda: 0.0,
                stop=stop,
            )
    assert calls == 0


def test_a_failure_elsewhere_ends_a_waiting_retry() -> None:
    calls = 0
    stop = threading.Event()

    def stop_while_waiting(seconds: float, event: threading.Event | None) -> None:
        # Another file fails while this one is in its back-off wait.
        stop.set()

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(fetcher.DownloadError, match="stopped"):
            fetcher.fetch_one(
                client,
                "IWXXM/a.xsd",
                RAW_BASE + "IWXXM/a.xsd",
                sleep=stop_while_waiting,
                clock=lambda: 0.0,
                jitter=lambda: 0.0,
                stop=stop,
            )
    assert calls == 1  # no further attempt once the run has failed


def install_fake_fetch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    contents: dict[str, bytes],
    handler: Callable[[httpx.Request], httpx.Response],
) -> Path:
    """Point main() at a fake manifest and a temporary destination, with no network."""
    destination = tmp_path / "installed"
    manifest = manifest_for(contents)
    real_download = fetcher.download_pinned
    monkeypatch.setattr(fetcher, "DESTINATION", destination)
    monkeypatch.setattr(fetcher, "load_manifest", lambda: manifest)
    monkeypatch.setattr(
        fetcher,
        "download_pinned",
        lambda manifest_arg: real_download(
            manifest_arg,
            transport=httpx.MockTransport(handler),
            sleep=Recorder(),
            jitter=lambda: 0.0,
        ),
    )
    monkeypatch.setattr(sys, "argv", ["fetch_iwxxm_schemas"])
    return destination


def test_main_exits_1_and_names_the_file_when_retries_are_spent(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    destination = install_fake_fetch(
        monkeypatch, tmp_path, ALPHA, lambda request: httpx.Response(503)
    )
    assert fetcher.main() == 1
    err = capsys.readouterr().err
    assert "could not install the IWXXM schemas" in err
    assert "IWXXM/a.xsd" in err
    assert "5 attempts" in err
    assert not destination.exists()


def test_main_fails_the_run_when_one_file_fails_among_many(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    contents = {
        f"IWXXM/file{index:02d}.xsd": f"body {index}".encode() for index in range(10)
    }
    calls: dict[str, int] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        relative = str(request.url).removeprefix(RAW_BASE)
        calls[relative] = calls.get(relative, 0) + 1
        if relative == "IWXXM/file03.xsd":
            return httpx.Response(404)
        return httpx.Response(200, content=contents[relative])

    destination = install_fake_fetch(monkeypatch, tmp_path, contents, handler)
    assert fetcher.main() == 1
    err = capsys.readouterr().err
    assert "IWXXM/file03.xsd" in err
    assert "404" in err
    assert not destination.exists()
    assert calls["IWXXM/file03.xsd"] == 1  # a 404 is never retried


def test_main_fails_when_one_file_keeps_returning_503_among_many(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    contents = {
        f"IWXXM/file{index:02d}.xsd": f"body {index}".encode() for index in range(10)
    }
    calls: dict[str, int] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        relative = str(request.url).removeprefix(RAW_BASE)
        calls[relative] = calls.get(relative, 0) + 1
        if relative == "IWXXM/file07.xsd":
            return httpx.Response(503)
        return httpx.Response(200, content=contents[relative])

    destination = install_fake_fetch(monkeypatch, tmp_path, contents, handler)
    assert fetcher.main() == 1
    err = capsys.readouterr().err
    assert "IWXXM/file07.xsd" in err
    assert "HTTP 503" in err
    assert not destination.exists()
    assert calls["IWXXM/file07.xsd"] == fetcher.RETRY_ATTEMPTS
