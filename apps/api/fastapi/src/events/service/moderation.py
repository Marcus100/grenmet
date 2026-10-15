"""Suggestions, reports and moderation."""

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User

from .. import schemas
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
    db: AsyncSession, suggestion_id: uuid.UUID, body: schemas.SuggestionUpdate
) -> Suggestion:
    suggestion = await db.get(Suggestion, suggestion_id)
    if suggestion is None:
        raise EventsNotFound("Suggestion not found")
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
    db: AsyncSession, report_id: uuid.UUID, body: schemas.ReportUpdate
) -> Report:
    report = await db.get(Report, report_id)
    if report is None:
        raise EventsNotFound("Report not found")
    report.status = body.status
    db.add(report)
    await db.commit()
    return report
