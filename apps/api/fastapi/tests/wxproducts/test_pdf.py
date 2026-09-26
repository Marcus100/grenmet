from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.exceptions import NotFoundError
from src.main import app
from src.wxproducts import forecast_pdf, pdf, service
from src.wxproducts.dependencies import ProductAuthor, get_author
from src.wxproducts.schemas import ProductPdfSourceAdapter
from tests.wxproducts.test_authoring import actor as actor
from tests.wxproducts.test_authoring import current_input
from tests.wxproducts.test_authoring import weather_sessions as weather_sessions


def test_unicode_long_text_and_legacy_fields():
    source = ProductPdfSourceAdapter.validate_python(
        {
            "product_id": uuid4(),
            "revision": 1,
            "kind": "morning",
            "values": {
                "summary": "Rain — 30°C. CAP: issued warning; source bulletin ABC.\n"
                * 300,
                "weatherImpact": "legacy hidden",
            },
            "action": "draft",
            "recorded_at": datetime.now(UTC),
            "current_publication": False,
        }
    )
    context = forecast_pdf.forecast_context(
        "morning", dict(source.values), status="", revision="r1"
    )
    html = (
        forecast_pdf._environment().get_template("forecast.html.j2").render(**context)
    )
    assert "legacy hidden" not in html  # legacy forecast impacts are not printed
    assert "source bulletin ABC." in html
    result = pdf.render_product_pdf(source)
    assert result.startswith(b"%PDF-")
    pages = forecast_pdf.render_forecast_document(
        "morning",
        dict(source.values),
        status=pdf.publication_label(source),
        revision="r1",
    ).pages
    assert len(pages) > 1
    assert pdf.publication_label(source) == "DRAFT — NOT FOR ISSUE"


async def test_exact_revision_and_access(async_client, weather_sessions, actor):
    payload = current_input(action="publish")
    async with weather_sessions() as session:
        await service.write_product(session, payload, actor)
        await service.write_product(
            session,
            payload.model_copy(
                update={
                    "action": "draft",
                    "expectedRevision": 1,
                    "values": payload.values | {"synopsis": "Private newer edit"},
                }
            ),
            actor,
        )
        published = await service.pdf_source(session, payload.id, 1, ["marine"])
        draft = await service.pdf_source(session, payload.id, 2, ["marine"])
        assert published.values == payload.values | {"forecaster": actor.full_name}
        assert published.current_publication
        assert draft.values["synopsis"] == "Private newer edit"
        assert not draft.current_publication
        with pytest.raises(NotFoundError):
            await service.pdf_source(session, payload.id, 1, ["morning"])
        with pytest.raises(NotFoundError):
            await service.pdf_source(session, payload.id, 99, ["marine"])
    url = f"/api/v1/wxproducts/products/{payload.id}/revisions/1/pdf"
    assert (await async_client.get(url)).status_code == 401
    app.dependency_overrides[get_author] = lambda: ProductAuthor(actor, ["marine"])
    try:
        response = await async_client.get(url)
        assert response.status_code == 200, response.text
        assert response.content.startswith(b"%PDF-")
        assert response.headers["content-type"] == "application/pdf"
        assert response.headers["cache-control"] == "no-store"
        assert "r1.pdf" in response.headers["content-disposition"]
        app.dependency_overrides[get_author] = lambda: ProductAuthor(actor, ["morning"])
        assert (await async_client.get(url)).status_code == 404
    finally:
        app.dependency_overrides.pop(get_author, None)
    async with weather_sessions() as session:
        await service.write_product(
            session,
            payload.model_copy(
                update={
                    "action": "withdraw",
                    "expectedRevision": 2,
                    "changeSummary": "Withdraw issue",
                }
            ),
            actor,
        )
        archived = await service.pdf_source(session, payload.id, 1, ["marine"])
        withdrawn = await service.pdf_source(session, payload.id, 3, ["marine"])
        assert pdf.publication_label(archived) == "PUBLISHED ISSUE — ARCHIVE COPY"
        assert pdf.publication_label(withdrawn) == "WITHDRAWAL RECORD — NOT FOR ISSUE"
