import logging
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import User

from . import validation
from .exceptions import ProductValidationError, RevisionConflict
from .models import (
    AuthoredProduct,
    AviationDraft,
    AviationDraftRevision,
    ProductRevision,
)
from .schemas import (
    AviationDraftWrite,
    AviationKind,
    ProductKind,
    ProductPdfSource,
    ProductWrite,
    PublishedProduct,
)
from .validation import ISSUE_HOURS, local_time

logger = logging.getLogger(__name__)


def is_current(product: PublishedProduct, now: datetime) -> bool:
    values = product.values
    try:
        if product.kind in ISSUE_HOURS:
            day = values.get("issuedAt", "")[:10]
            issued = local_time(f"{day}T{ISSUE_HOURS[product.kind]:02}:00")
            start = issued
            end = issued.replace(hour=7) + timedelta(
                days=5 if product.kind == "evening" else 1
            )
        else:
            issued = local_time(values.get("issuedAt", ""))
            start = local_time(values.get("validFrom", ""))
            end = local_time(values.get("validTo", ""))
        published = datetime.fromisoformat(product.publishedAt)
        return published <= now and issued <= now and start <= now < end
    except (ValueError, OverflowError):
        return False


async def list_published_products(
    session: AsyncSession, kind: ProductKind | None, *, now: datetime | None = None
) -> list[PublishedProduct]:
    # Public snapshots only; all authoring is owned by this module.
    # Never register weather tables in the main database's Alembic metadata.
    query = "SELECT published FROM authored_products WHERE published IS NOT NULL"
    parameters: dict[str, str] = {}
    if kind is not None:
        query += " AND kind = :kind"
        parameters["kind"] = kind
    rows = await session.execute(text(query), parameters)
    instant = now if now is not None else datetime.now(UTC)
    products = [
        PublishedProduct.model_validate(row)
        for row in rows.scalars()
        if row is not None
    ]
    return sorted(
        (product for product in products if is_current(product, instant)),
        key=lambda product: product.values.get("issuedAt", ""),
        reverse=True,
    )


async def list_authored(
    session: AsyncSession, kind: ProductKind, issue_date: date
) -> list[AuthoredProduct]:
    issued = AuthoredProduct.draft["values"]["issuedAt"].astext
    from sqlalchemy import func, or_

    statement = (
        select(AuthoredProduct)
        .where(
            AuthoredProduct.kind == kind,
            or_(
                func.coalesce(issued, "") == "",
                func.left(issued, 10) == issue_date.isoformat(),
            ),
        )
        .order_by(col(AuthoredProduct.updated_at).desc())
    )
    return list((await session.execute(statement)).scalars())


async def history(
    session: AsyncSession, product_id: UUID, allowed_kinds: list[str]
) -> list[ProductRevision]:
    statement = (
        select(ProductRevision)
        .join(
            AuthoredProduct, col(ProductRevision.product_id) == col(AuthoredProduct.id)
        )
        .where(
            ProductRevision.product_id == product_id,
            col(AuthoredProduct.kind).in_(allowed_kinds),
        )
        .order_by(col(ProductRevision.revision).desc())
        .limit(100)
    )
    return list((await session.execute(statement)).scalars())


async def write_product(
    session: AsyncSession, body: ProductWrite, actor: User
) -> AuthoredProduct:
    body = body.model_copy(
        update={"values": validation.normalize(body.kind, body.values)}
    )
    errors = validation.validate(body)
    if errors:
        raise ProductValidationError(errors)
    async with session.begin():
        previous = (
            await session.execute(
                select(AuthoredProduct)
                .where(AuthoredProduct.id == body.id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if (previous.revision if previous else 0) != body.expectedRevision or (
            previous and previous.kind != body.kind
        ):
            raise RevisionConflict()
        if body.action == "withdraw" and (previous is None or not previous.published):
            raise RevisionConflict("This product is not published.")
        revision = body.expectedRevision + 1
        now = datetime.now(UTC)
        content = (
            previous.draft
            if body.action == "withdraw" and previous
            else {"kind": body.kind, "values": body.values}
        )
        published = (
            {
                **content,
                "id": str(body.id),
                "revision": revision,
                "publishedAt": now.isoformat(timespec="milliseconds").replace(
                    "+00:00", "Z"
                ),
            }
            if body.action == "publish"
            else None
            if body.action == "withdraw"
            else previous.published
            if previous
            else None
        )
        if previous is None:
            product = (
                await session.execute(
                    insert(AuthoredProduct)
                    .values(
                        id=body.id,
                        kind=body.kind,
                        draft=content,
                        revision=revision,
                        published=published,
                        updated_at=now,
                    )
                    .on_conflict_do_nothing(index_elements=["id"])
                    .returning(AuthoredProduct)
                )
            ).scalar_one_or_none()
            if product is None:
                raise RevisionConflict("This product was already saved. Reload it.")
        else:
            product = previous
            product.draft, product.revision, product.published, product.updated_at = (
                content,
                revision,
                published,
                now,
            )
            session.add(product)
        session.add(
            ProductRevision(
                product_id=body.id,
                revision=revision,
                action=body.action,
                content=content,
                actor_id=str(actor.id),
                actor_name=actor.full_name or actor.email,
                change_summary=body.changeSummary,
                created_at=now,
            )
        )
        await session.flush()
    logger.info(
        "Weather product revision saved",
        extra={"product_id": str(body.id), "revision": revision, "action": body.action},
    )
    return product


async def save_aviation_draft(
    session: AsyncSession, body: AviationDraftWrite, actor: User
) -> AviationDraft:
    async with session.begin():
        previous = (
            await session.execute(
                select(AviationDraft)
                .where(AviationDraft.id == body.id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if (previous.revision if previous else 0) != body.expected_revision:
            raise RevisionConflict()
        if previous and (
            previous.kind != body.kind or previous.station != body.station
        ):
            raise RevisionConflict(
                "Report type and station cannot change on a saved draft. Start a new draft."
            )
        content = body.model_dump(mode="json", exclude={"id", "expected_revision"})
        now = datetime.now(UTC)
        values = {
            "kind": body.kind,
            "station": body.station,
            "content": content,
            "revision": body.expected_revision + 1,
            "actor_id": str(actor.id),
            "actor_name": actor.full_name or actor.email,
            "updated_at": now,
        }
        if previous is None:
            row = (
                await session.execute(
                    insert(AviationDraft)
                    .values(id=body.id, **values)
                    .on_conflict_do_nothing(index_elements=["id"])
                    .returning(AviationDraft)
                )
            ).scalar_one_or_none()
            if row is None:
                raise RevisionConflict()
        else:
            row = previous
            for name, value in values.items():
                setattr(row, name, value)
            session.add(row)
        session.add(
            AviationDraftRevision(
                draft_id=body.id,
                revision=row.revision,
                content=content,
                actor_id=row.actor_id,
                actor_name=row.actor_name,
                recorded_at=now,
            )
        )
        await session.flush()
    return row


async def list_aviation_drafts(
    session: AsyncSession, kind: AviationKind, station: str
) -> list[AviationDraft]:
    return list(
        (
            await session.execute(
                select(AviationDraft)
                .where(AviationDraft.kind == kind, AviationDraft.station == station)
                .order_by(
                    col(AviationDraft.updated_at).desc(), col(AviationDraft.id).desc()
                )
                .limit(50)
            )
        ).scalars()
    )


async def aviation_history(
    session: AsyncSession, draft_id: UUID
) -> list[AviationDraftRevision]:
    return list(
        (
            await session.execute(
                select(AviationDraftRevision)
                .where(AviationDraftRevision.draft_id == draft_id)
                .order_by(col(AviationDraftRevision.revision).desc())
                .limit(100)
            )
        ).scalars()
    )


async def pdf_source(
    session: AsyncSession, product_id: UUID, revision: int, allowed_kinds: list[str]
) -> ProductPdfSource:
    from src.exceptions import NotFoundError

    statement = (
        select(ProductRevision, AuthoredProduct)
        .join(
            AuthoredProduct, col(ProductRevision.product_id) == col(AuthoredProduct.id)
        )
        .where(
            ProductRevision.product_id == product_id,
            ProductRevision.revision == revision,
            col(AuthoredProduct.kind).in_(allowed_kinds),
        )
    )
    row = (await session.execute(statement)).first()
    if row is None:
        raise NotFoundError("Saved product revision not found")
    record, product = row
    return ProductPdfSource.model_validate(
        {
            "product_id": product_id,
            "revision": revision,
            "kind": record.content["kind"],
            "values": record.content["values"],
            "action": record.action,
            "recorded_at": record.created_at,
            "current_publication": bool(
                product.published and product.published["revision"] == revision
            ),
        }
    )
