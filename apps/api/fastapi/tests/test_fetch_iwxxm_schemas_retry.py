"""Download resilience of scripts/fetch_iwxxm_schemas.py, with a fake HTTP transport.

No network: every request goes to an httpx.MockTransport, and sleeps are recorded
instead of performed. The real manifest is used where the file list matters.
"""

import hashlib
import json
import threading
import time
from collections.abc import Callable
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

    def __call__(self, seconds: float) -> None:
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
    ],
    ids=["500", "502", "429", "connect-error", "timeout"],
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
