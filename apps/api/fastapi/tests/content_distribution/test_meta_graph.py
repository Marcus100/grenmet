"""Meta Graph client: outcomes, retries and redaction, with HTTP mocked at the transport.

No test reaches a network. ``wire`` installs an httpx.MockTransport and records every
request and every wait (no real sleeping).
"""

from collections.abc import Callable
from typing import Any

import httpx
import pytest

from src.content_distribution import meta_graph
from src.content_distribution.meta_graph import (
    GraphClient,
    GraphOutcomeUnknown,
    GraphRejected,
    GraphRetryable,
)

TOKEN = "EAAB-client-test-token-do-not-log"
PAGE = "1234567890"
IG = "17841400000001"


Reply = httpx.Response | Exception | Callable[[httpx.Request], httpx.Response]


class Replies:
    """Answers requests in order; the last answer repeats. Exceptions are raised and
    a callable is called with the request (for answers that depend on the path)."""

    def __init__(self, *replies: Reply) -> None:
        self._replies = list(replies)
        self.requests: list[httpx.Request] = []
        self.waits: list[float] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        reply = self._replies.pop(0) if len(self._replies) > 1 else self._replies[0]
        if isinstance(reply, Exception):
            raise reply
        if callable(reply):
            return reply(request)
        return reply

    async def sleep(self, seconds: float) -> None:
        self.waits.append(seconds)


@pytest.fixture
def wire(monkeypatch: pytest.MonkeyPatch) -> Callable[..., Replies]:
    def install(*replies: Reply) -> Replies:
        scripted = Replies(*replies)
        monkeypatch.setattr(meta_graph, "_transport", httpx.MockTransport(scripted))
        monkeypatch.setattr(meta_graph, "_sleep", scripted.sleep)
        return scripted

    return install


def _client() -> GraphClient:
    return GraphClient(access_token=TOKEN, api_version="v24.0")


def _ok(body: dict[str, Any]) -> httpx.Response:
    return httpx.Response(200, json=body)


# --- Retries inside one call ----------------------------------------------------


async def test_retry_after_seconds_are_honoured(wire: Callable[..., Replies]) -> None:
    replies = wire(
        httpx.Response(429, headers={"Retry-After": "5"}),
        _ok({"id": "post-1"}),
    )
    body = await _client().post(f"{PAGE}/feed", data={"message": "x"}, publishing=True)
    assert body == {"id": "post-1"}
    assert replies.waits == [5.0]
    assert len(replies.requests) == 2


async def test_a_retry_after_longer_than_the_cap_is_left_to_the_outbox(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(httpx.Response(503, headers={"Retry-After": "300"}))
    with pytest.raises(GraphRetryable, match="HTTP 503"):
        await _client().post(f"{PAGE}/feed", data={}, publishing=True)
    assert replies.waits == []
    assert len(replies.requests) == 1


async def test_backoff_doubles_between_busy_answers(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(httpx.Response(503), httpx.Response(503), _ok({"id": "ok"}))
    await _client().get("ok", params={})
    assert replies.waits == [2.0, 4.0]


async def test_three_busy_answers_end_retryable(wire: Callable[..., Replies]) -> None:
    replies = wire(httpx.Response(503))
    with pytest.raises(GraphRetryable) as raised:
        await _client().get("thing", params={})
    assert raised.value.message == "Meta is busy (HTTP 503)"
    assert len(replies.requests) == 3


async def test_a_rate_limit_code_inside_a_400_is_retried(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(
        httpx.Response(400, json={"error": {"code": 613, "message": "Too many calls"}}),
        _ok({"id": "after-limit"}),
    )
    body = await _client().post(f"{PAGE}/feed", data={}, publishing=True)
    assert body == {"id": "after-limit"}
    assert len(replies.requests) == 2


async def test_a_connection_that_never_opened_is_retried_even_for_a_publish(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(
        httpx.ConnectError("connection refused"),
        _ok({"id": "post-2"}),
    )
    body = await _client().post(f"{PAGE}/feed", data={}, publishing=True)
    assert body == {"id": "post-2"}
    assert len(replies.requests) == 2


async def test_a_read_timeout_on_a_read_is_retried_then_retryable(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(httpx.ReadTimeout("slow"))
    with pytest.raises(GraphRetryable, match="Could not reach Meta"):
        await _client().get("thing", params={})
    assert len(replies.requests) == 3


# --- Outcomes of a publish request ----------------------------------------------


async def test_a_timeout_after_a_publish_request_is_unknown_and_never_retried(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(httpx.ReadTimeout("no answer"))
    with pytest.raises(GraphOutcomeUnknown):
        await _client().post(f"{PAGE}/feed", data={}, publishing=True)
    assert len(replies.requests) == 1


async def test_a_broken_answer_body_after_a_publish_request_is_unknown(
    wire: Callable[..., Replies],
) -> None:
    # The request went out and the answer could not be decoded: the post may be live.
    replies = wire(httpx.DecodingError("cannot decode the body"))
    with pytest.raises(GraphOutcomeUnknown):
        await _client().post(f"{PAGE}/feed", data={}, publishing=True)
    assert len(replies.requests) == 1


async def test_an_unreadable_success_is_unknown_for_a_publish(
    wire: Callable[..., Replies],
) -> None:
    wire(httpx.Response(200, text="<html>not json</html>"))
    with pytest.raises(GraphOutcomeUnknown):
        await meta_graph.publish_facebook(
            _client(), page_id=PAGE, message="m", link="", image_url=None
        )


async def test_an_unreadable_success_is_retryable_when_nothing_was_published(
    wire: Callable[..., Replies],
) -> None:
    wire(httpx.Response(200, text="<html>not json</html>"))
    with pytest.raises(GraphRetryable):
        await _client().get("thing", params={})


async def test_a_publish_answer_without_a_post_id_is_unknown(
    wire: Callable[..., Replies],
) -> None:
    wire(_ok({"success": True}))
    with pytest.raises(GraphOutcomeUnknown):
        await meta_graph.publish_facebook(
            _client(), page_id=PAGE, message="m", link="", image_url=None
        )


async def test_a_container_without_an_id_is_retryable_not_unknown(
    wire: Callable[..., Replies],
) -> None:
    # Creating an Instagram container publishes nothing, so a bad answer is safe to retry.
    wire(_ok({}))
    with pytest.raises(GraphRetryable):
        await meta_graph.publish_instagram(
            _client(), account_id=IG, caption="c", image_url="https://x.test/a.jpg"
        )


# --- Rejections ------------------------------------------------------------------


async def test_a_client_error_is_rejected_once_with_the_reason(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(
        httpx.Response(404, json={"error": {"code": 803, "message": "Unknown page"}})
    )
    with pytest.raises(GraphRejected) as raised:
        await _client().post(f"{PAGE}/feed", data={}, publishing=True)
    assert raised.value.message == (
        "Meta rejected the request (HTTP 404, error code 803): Unknown page"
    )
    assert len(replies.requests) == 1


async def test_a_client_error_without_json_gives_the_status_only(
    wire: Callable[..., Replies],
) -> None:
    wire(httpx.Response(403, text="forbidden"))
    with pytest.raises(GraphRejected) as raised:
        await _client().get("thing", params={})
    assert raised.value.message == "Meta rejected the request (HTTP 403)"


async def test_a_rejection_message_never_carries_the_token(
    wire: Callable[..., Replies],
) -> None:
    wire(
        httpx.Response(
            400,
            json={"error": {"code": 190, "message": f"Bad token {TOKEN} supplied"}},
        )
    )
    with pytest.raises(GraphRejected) as raised:
        await _client().post(f"{PAGE}/feed", data={}, publishing=True)
    assert TOKEN not in raised.value.message
    assert "[redacted]" in raised.value.message


async def test_a_long_rejection_message_is_cut_to_the_stored_size(
    wire: Callable[..., Replies],
) -> None:
    wire(httpx.Response(400, json={"error": {"code": 1, "message": "x" * 1000}}))
    with pytest.raises(GraphRejected) as raised:
        await _client().get("thing", params={})
    assert len(raised.value.message) <= 300


# --- Request shape --------------------------------------------------------------


async def test_the_token_travels_in_the_header_never_in_the_url(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(_ok({"id": "post-3"}))
    await _client().post(f"{PAGE}/feed", data={"message": "hello"}, publishing=True)
    [request] = replies.requests
    assert request.headers["Authorization"] == f"Bearer {TOKEN}"
    assert TOKEN not in str(request.url)
    assert request.url.path == f"/v24.0/{PAGE}/feed"
    assert request.url.query == b""


async def test_the_pinned_version_is_in_every_path(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(_ok({"status_code": "FINISHED"}))
    client = GraphClient(access_token=TOKEN, api_version="v25.1")
    await client.get("container-9", params={"fields": "status_code"})
    [request] = replies.requests
    assert request.url.path == "/v25.1/container-9"
    assert request.url.params["fields"] == "status_code"


# --- Facebook and Instagram shapes -------------------------------------------------


async def test_a_photo_post_reports_the_post_id_not_the_photo_id(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(_ok({"id": "photo-1", "post_id": f"{PAGE}_42"}))
    post_id = await meta_graph.publish_facebook(
        _client(),
        page_id=PAGE,
        message="Dry rain",
        link="https://gms.example.test/stories/rain",
        image_url="https://gms.example.test/images/rain.jpg",
    )
    assert post_id == f"{PAGE}_42"
    [request] = replies.requests
    assert request.url.path == f"/v24.0/{PAGE}/photos"
    assert b"published=true" in request.content
    assert b"rain.jpg" in request.content


async def test_a_photo_post_writes_the_link_into_the_text(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(_ok({"id": "photo-2", "post_id": f"{PAGE}_43"}))
    await meta_graph.publish_facebook(
        _client(),
        page_id=PAGE,
        message="Dry rain",
        link="https://gms.example.test/stories/rain",
        image_url="https://gms.example.test/images/rain.jpg",
    )
    [request] = replies.requests
    assert (
        b"Dry+rain%0A%0Ahttps%3A%2F%2Fgms.example.test%2Fstories%2Frain"
        in request.content
    )


async def test_an_instagram_container_is_polled_until_finished_then_published(
    wire: Callable[..., Replies],
) -> None:
    def answers(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return _ok({"status_code": "FINISHED"})
        if request.url.path.endswith("/media_publish"):
            return _ok({"id": "media-1"})
        return _ok({"id": "container-1"})

    replies = wire(answers)
    post_id = await meta_graph.publish_instagram(
        _client(), account_id=IG, caption="Dry rain", image_url="https://x.test/a.jpg"
    )
    assert post_id == "media-1"
    assert [f"{r.method} {r.url.path}" for r in replies.requests] == [
        f"POST /v24.0/{IG}/media",
        "GET /v24.0/container-1",
        f"POST /v24.0/{IG}/media_publish",
    ]


async def test_an_instagram_container_still_processing_is_polled_again(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(
        _ok({"id": "container-2"}),
        _ok({"status_code": "IN_PROGRESS"}),
        _ok({"status_code": "FINISHED"}),
        _ok({"id": "media-2"}),
    )
    post_id = await meta_graph.publish_instagram(
        _client(), account_id=IG, caption="c", image_url="https://x.test/a.jpg"
    )
    assert post_id == "media-2"
    assert replies.waits == [2.0]


async def test_an_instagram_container_that_errors_is_rejected(
    wire: Callable[..., Replies],
) -> None:
    wire(_ok({"id": "container-3"}), _ok({"status_code": "ERROR"}))
    with pytest.raises(GraphRejected, match="could not process the image"):
        await meta_graph.publish_instagram(
            _client(), account_id=IG, caption="c", image_url="https://x.test/a.png"
        )


async def test_an_instagram_container_that_never_finishes_is_retryable(
    wire: Callable[..., Replies],
) -> None:
    replies = wire(
        _ok({"id": "container-4"}),
        _ok({"status_code": "IN_PROGRESS"}),
    )
    with pytest.raises(GraphRetryable, match="still processing"):
        await meta_graph.publish_instagram(
            _client(), account_id=IG, caption="c", image_url="https://x.test/a.jpg"
        )
    assert replies.waits == [2.0, 2.0, 2.0, 2.0]
    # One create and five status checks; nothing was published.
    assert len(replies.requests) == 6
    assert all("media_publish" not in str(r.url) for r in replies.requests)
