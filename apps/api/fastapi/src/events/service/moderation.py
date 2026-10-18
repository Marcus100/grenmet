"""Suggestions, reports and moderation."""

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User

from .. import activity, schemas
from ..exceptions import EventsNotFound
from ..models import (
    Report,
    Suggestion,
)

# --- Suggestions and moderation ---------------------------------------------------------------


async def create_suggestion(
    db: AsyncSession, user: User | None, body: schemas.SuggestionCreate
) -> Suggestion:
    suggestion = Suggestion(submitted_by=user.id if user else None, **body.model_dump())
    db.add(suggestion)
    await db.commit()
    return suggestion


async def list_suggestions(db: AsyncSession) -> Sequence[Suggestion]:
    return (
        await db.scalars(
            select(Suggestion)
            .where(Suggestion.status == "pending")
            .order_by(Suggestion.created_at)
        )
    ).all()


async def update_suggestion(
    db: AsyncSession,
    suggestion_id: uuid.UUID,
    body: schemas.SuggestionUpdate,
    actor: User,
) -> Suggestion:
    suggestion = await db.get(Suggestion, suggestion_id)
    if suggestion is None:
        raise EventsNotFound("Suggestion not found")
    activity.record(
        db,
        actor_id=actor.id,
        action=f"suggestion.{body.status}",
        entity_type="suggestion",
        entity_id=str(suggestion.id),
        summary={"from": {"status": suggestion.status}, "to": {"status": body.status}},
    )
    suggestion.status = body.status
    db.add(suggestion)
    await db.commit()
    return suggestion


async def list_reports(db: AsyncSession) -> Sequence[Report]:
    return (
        await db.scalars(
            select(Report).where(Report.status == "open").order_by(Report.created_at)
        )
    ).all()


async def update_report(
    db: AsyncSession,
    report_id: uuid.UUID,
    body: schemas.ReportUpdate,
    actor: User,
) -> Report:
    report = await db.get(Report, report_id)
    if report is None:
        raise EventsNotFound("Report not found")
    activity.record(
        db,
        actor_id=actor.id,
        action=f"report.{body.status}",
        entity_type="report",
        entity_id=str(report.id),
        summary={
            "subject_type": report.subject_type,
            "from": {"status": report.status},
            "to": {"status": body.status},
        },
    )
    report.status = body.status
    db.add(report)
    await db.commit()
    return report
