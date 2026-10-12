import base64
from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image
from pydantic import ValidationError

from src.wxproducts import forecast_pdf, guidance, validation
from src.wxwatch.nhc_schemas import (
    GuidanceFact,
    GuidanceGraphic,
    GuidanceSource,
    GuidanceSystem,
    ProductGuidance,
)
from tests.wxproducts.test_validation import NOW, body, complete


def system(name, probability, horizon=168):
    return GuidanceSystem(
        id=uuid4(),
        name=name,
        feature_type="disturbance",
        narrative=name + " narrative",
        facts=[
            GuidanceFact(
                key="formation_probability",
                record_type="forecast",
                value=probability,
                unit="percent",
                horizon_hours=horizon,
                source_text="near zero percent" if probability is None else "",
            )
        ],
    )


def test_composes_each_system_probability_without_reusing_legacy_pair():
    first, second = system("Eastern", None, 48), system("Western", 70)
    content = ProductGuidance(systems=[first, second])
    values = guidance.compose(
        "outlook", {"formationChance48h": "20", "formationChance7d": "30"}, content
    )
    assert "near zero percent" in values["systems"]
    assert "70%" in values["systems"]
    assert "formationChance48h" not in values and "formationChance7d" not in values
    legacy = {"systems": "Older text", "formationChance48h": "20"}
    assert guidance.compose("outlook", legacy, None) == legacy


def test_relationships_require_confirmation_and_reject_cycles():
    parent, child = system("Wave", None), system("Embedded low", None)
    child.parent_system_id = parent.id
    with pytest.raises(ValidationError, match="confirmation"):
        ProductGuidance(systems=[parent, child])
    child.relationship_confirmed = True
    assert (
        ProductGuidance(systems=[parent, child]).systems[1].parent_system_id
        == parent.id
    )
    parent.parent_system_id, parent.relationship_confirmed = child.id, True
    with pytest.raises(ValidationError, match="cyclic"):
        ProductGuidance(systems=[parent, child])


@pytest.mark.parametrize(
    "changes", [{"value": 101}, {"horizon_hours": 72}, {"unit": "fraction"}]
)
def test_probability_validation_preserves_units_and_supported_horizons(changes):
    with pytest.raises(ValidationError):
        GuidanceFact(
            key="formation_probability",
            record_type="forecast",
            value=20,
            unit="percent",
            horizon_hours=48,
        ).model_copy(update=changes).model_validate(
            {
                "key": "formation_probability",
                "record_type": "forecast",
                "value": 20,
                "unit": "percent",
                "horizon_hours": 48,
                **changes,
            }
        )


def test_source_backed_marine_publication_requires_a_local_assessment():
    source = GuidanceSource(
        edition_id=uuid4(),
        product_key="nhc:offnt3",
        title="Caribbean offshore",
        sha256="a" * 64,
    )
    content = ProductGuidance(sources=[source])
    errors = validation.validate(body("marine", guidance=content), now=NOW)
    assert (
        "Add the GMS local assessment of regional marine guidance before publishing"
        in errors
    )
    content.local_assessment = "These winds are applicable to waters east of Grenada."
    assert validation.validate(body("marine", guidance=content), now=NOW) == []


def test_outlook_pdf_preserves_qualified_values_beside_each_system():
    content = ProductGuidance(
        systems=[system("Eastern", None, 48), system("Western", 70)]
    )
    values = guidance.compose("outlook", complete("outlook"), content)
    document = forecast_pdf.render_document(
        "outlook", values, status="DRAFT PREVIEW", revision="preview", guidance=content
    )
    text = " ".join(
        box.text
        for page in document.pages
        for box in page._page_box.descendants()
        if hasattr(box, "text")
    )
    assert (
        text.index("Eastern")
        < text.index("near zero percent")
        < text.index("Western")
        < text.index("70.0")
    )
    assert len(document.pages) <= 3


async def test_manual_structured_outlook_does_not_require_source_archive(monkeypatch):
    def unavailable():
        raise AssertionError("Manual guidance must not open the source archive")

    monkeypatch.setattr(guidance.database, "create_session", unavailable)
    content = ProductGuidance(systems=[system("Manually assessed wave", None)])
    assert await guidance.validate(content) is content


def test_selected_graphic_renders_caption_and_exact_source_provenance():
    source = GuidanceSource(
        edition_id=uuid4(),
        product_key="nhc:graphical-outlook",
        title="Atlantic graphical outlook",
        sha256="a" * 64,
        issued_at=datetime(2026, 10, 12, 12, tzinfo=UTC),
    )
    graphic = GuidanceGraphic(
        edition_id=source.edition_id,
        asset_id=uuid4(),
        caption="Selected development areas",
    )
    content = ProductGuidance(sources=[source], graphics=[graphic])
    image = BytesIO()
    Image.new("RGB", (400, 160), "white").save(image, format="PNG")
    document = forecast_pdf.render_document(
        "outlook",
        complete("outlook"),
        status="DRAFT PREVIEW",
        revision="preview",
        guidance=content,
        graphic_images={
            str(graphic.asset_id): "data:image/png;base64,"
            + base64.b64encode(image.getvalue()).decode()
        },
    )
    boxes = [box for page in document.pages for box in page._page_box.descendants()]
    text = " ".join(box.text for box in boxes if hasattr(box, "text"))
    assert "Selected development areas" in text
    assert "Atlantic graphical outlook" in text and "2026-10-12 12:00:00+00:00" in text
    assert any(box.element_tag == "img" for box in boxes)
