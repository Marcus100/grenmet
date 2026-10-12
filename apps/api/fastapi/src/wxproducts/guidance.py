"""Reviewed GMS guidance composes legacy summaries without losing structured evidence."""

import base64

from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from src.wxwatch import database, nhc_service
from src.wxwatch.assets import snapshot
from src.wxwatch.config import wxwatch_settings
from src.wxwatch.nhc_schemas import ProductGuidance

from .exceptions import ProductValidationError, WeatherUnavailable


def compose(
    kind: str, values: dict[str, str], guidance: ProductGuidance | None
) -> dict[str, str]:
    if guidance is None:
        return values
    if kind not in {"outlook", "cyclone", "marine"}:
        raise ProductValidationError(
            ["NHC guidance is supported for outlook, cyclone and marine products"]
        )
    result = dict(values)
    if kind == "outlook" and guidance.systems:
        paragraphs = []
        for system in guidance.systems:
            lines = [system.name + ": " + system.narrative]
            for fact in system.facts:
                if fact.key == "formation_probability":
                    amount = (
                        f"{fact.value:g}%"
                        if fact.value is not None
                        else fact.source_text or fact.description
                    )
                    lines.append(
                        f"Formation through {fact.horizon_hours} hours: {amount}"
                        + (f" ({fact.qualifier})" if fact.qualifier else "")
                    )
            if system.local_assessment:
                lines.append("GMS assessment: " + system.local_assessment)
            paragraphs.append("\n".join(lines))
        result["systems"] = "\n\n".join(paragraphs)
        # Structured systems own their probabilities. Never render a legacy bulletin-level pair.
        result.pop("formationChance48h", None)
        result.pop("formationChance7d", None)
    if guidance.sources and kind == "outlook":
        result["source"] = "NHC guidance; GMS assessment. " + "; ".join(
            f"{source.title} ({source.issued_at.isoformat() if source.issued_at else 'issue time unknown'})"
            for source in guidance.sources
        )
    return result


async def validate(guidance: ProductGuidance | None) -> ProductGuidance | None:
    if guidance is None or not guidance.sources:
        return guidance
    session = database.create_session()
    if session is None:
        raise WeatherUnavailable()
    async with session:
        try:
            return await nhc_service.validate_sources(session, guidance)
        except ValueError as error:
            raise ProductValidationError([str(error)]) from error


async def images(guidance: ProductGuidance | None) -> dict[str, str]:
    if guidance is None or not guidance.graphics:
        return {}
    session = database.create_session()
    if session is None:
        raise WeatherUnavailable()
    result = {}
    async with session:
        for graphic in guidance.graphics:
            rows = (
                await session.execute(
                    text("""SELECT r.backend_key,r.object_key,a.sha256,a.byte_size
                FROM archive_edition_assets ea JOIN archive_assets a ON a.id=ea.asset_id
                JOIN archive_replicas r ON r.asset_id=a.id WHERE ea.edition_id=:edition AND a.id=:asset
                AND r.state='verified' AND r.verified_sha256=a.sha256"""),
                    {"edition": graphic.edition_id, "asset": graphic.asset_id},
                )
            ).mappings()
            found = False
            for row in rows:
                root = wxwatch_settings.LOCAL_ASSET_ROOTS.get(row["backend_key"])
                if root is None:
                    continue
                stream, media = await run_in_threadpool(
                    snapshot, root, row["object_key"], row["sha256"], row["byte_size"]
                )
                try:
                    if not media.startswith("image/"):
                        raise ProductValidationError(
                            ["Selected graphic is not a verified image"]
                        )
                    result[str(graphic.asset_id)] = (
                        "data:"
                        + media
                        + ";base64,"
                        + base64.b64encode(
                            await run_in_threadpool(stream.read)
                        ).decode()
                    )
                    found = True
                finally:
                    stream.close()
                break
            if not found:
                raise WeatherUnavailable()
    return result
