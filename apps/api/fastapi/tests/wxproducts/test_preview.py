from datetime import UTC, datetime

import pytest

from src.main import app
from src.wxproducts import validation
from src.wxproducts.dependencies import ProductAuthor, get_author
from src.wxproducts.schemas import ProductPreviewInput
from tests.wxproducts.test_authoring import actor as actor
from tests.wxproducts.test_validation import NOW, body, complete


def payload(kind="marine", **changes):
    return ProductPreviewInput.model_validate(
        {
            "kind": kind,
            "values": complete(kind),
            "expectedRevision": 0,
            "changeSummary": "",
        }
        | changes
    )


def test_normalizes_schedule_without_changing_input():
    request = payload(
        "evening",
        values=complete("evening")
        | {"issuedAt": "2026-12-30T09:00", "day4Date": "wrong"},
    )
    result = validation.preview(request, now=datetime(2026, 12, 30, tzinfo=UTC))
    assert result.errors == []
    assert result.values["issuedAt"] == "2026-12-30T18:00"
    assert result.values["day4Date"] == "2027-01-03"
    assert request.values["day4Date"] == "wrong"


def test_checks_publication_content_but_not_review_acknowledgement():
    assert validation.preview(payload(), now=NOW).errors == []
    expired = validation.preview(payload(), now=datetime(2026, 10, 1, tzinfo=UTC))
    assert "An expired product cannot be published" in expired.errors
    invalid = validation.preview(payload(values={}), now=NOW)
    assert invalid.errors
    assert "Review the preview before publishing" not in invalid.errors
    assert (
        "Describe this issue or revision"
        in validation.preview(payload(expectedRevision=1), now=NOW).errors
    )
    # A successful preview cannot bypass acknowledgement at the write boundary.
    assert "Review the preview before publishing" in validation.validate(
        body(reviewed=False), now=NOW
    )


@pytest.mark.parametrize(
    "values, error",
    [
        ({"forged": "yes"}, "Unknown product field"),
        (
            complete("marine") | {"synopsis": "Example draft"},
            "Replace example draft wording before publishing",
        ),
    ],
)
def test_rejects_unknown_fields_and_example_text(values, error):
    assert error in validation.preview(payload(values=values), now=NOW).errors


async def test_preview_endpoint_requires_kind_access(async_client, actor):
    async def author():
        return ProductAuthor(actor, ["marine"])

    app.dependency_overrides[get_author] = author
    try:
        response = await async_client.post(
            "/api/v1/wxproducts/products/preview",
            json=payload().model_dump(mode="json"),
        )
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        assert "checked_at" in response.json()
        denied = await async_client.post(
            "/api/v1/wxproducts/products/preview",
            json=payload("evening").model_dump(mode="json"),
        )
        assert denied.status_code == 403
    finally:
        app.dependency_overrides.pop(get_author, None)


async def test_anonymous_preview_is_denied(async_client):
    response = await async_client.post(
        "/api/v1/wxproducts/products/preview", json=payload().model_dump(mode="json")
    )
    assert response.status_code == 401
