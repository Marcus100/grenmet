import base64
import binascii
import hashlib
import io
import json
import logging
import uuid
from pathlib import Path
from typing import TypedDict

from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageChops, UnidentifiedImageError
from pydantic import JsonValue
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel, col, func, select

from src.auth.models import User
from src.exceptions import AppException
from src.hr.documents import access
from src.hr.exceptions import HRValidationError
from src.hr.organisations import department_for
from src.utils.datetime import utc_now

from .models import SavedSignature, SignedDocument
from .schemas import SignaturePublic

logger = logging.getLogger(__name__)

TITLES = {
    "leave_request": "Application for Leave of Absence",
    "shift_swap": "Shift Exchange Requisition",
    "absentee_report": "Absentee Report",
    "status_report": "Daily Airport Status Report",
    "timesheet": "Official Time Sheet",
    "parking_permit": "Airport Security Parking Access",
}


def normalize_image(data_url: str) -> bytes:
    if not data_url.startswith("data:image/png;base64,"):
        raise HRValidationError("Upload or draw a PNG signature")
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1], validate=True)
        if len(raw) > 256000:
            raise HRValidationError("Signature must be smaller than 250 KB")
        with Image.open(io.BytesIO(raw)) as source:
            if source.format != "PNG" or not (
                16 <= source.width <= 2000 and 16 <= source.height <= 1000
            ):
                raise HRValidationError(
                    "Signature dimensions must be 16–2000 by 16–1000 pixels"
                )
            rgba = source.convert("RGBA")
            image = Image.new("RGB", source.size, "white")
            image.paste(rgba, mask=rgba.getchannel("A"))
            if (
                ImageChops.difference(
                    image, Image.new("RGB", source.size, "white")
                ).getbbox()
                is None
            ):
                raise HRValidationError("Signature cannot be blank")
            image.thumbnail((800, 300))
            output = io.BytesIO()
            image.save(output, format="PNG")
            return output.getvalue()
    except (
        ValueError,
        binascii.Error,
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
    ) as error:
        raise HRValidationError("Invalid PNG signature") from error


def public_signature(signature: SavedSignature) -> SignaturePublic:
    return SignaturePublic(
        version=signature.version,
        image_data_url="data:image/png;base64,"
        + base64.b64encode(signature.image).decode(),
        updated_at=signature.updated_at,
    )


async def save_signature(
    session: AsyncSession, actor: User, data_url: str
) -> SavedSignature:
    image = await run_in_threadpool(normalize_image, data_url)
    # Lock the user even for first upload, so two first uploads cannot race.
    await session.execute(select(User.id).where(User.id == actor.id).with_for_update())
    saved = await session.get(SavedSignature, actor.id, populate_existing=True)
    if saved is None:
        saved = SavedSignature(user_id=actor.id, image=image)
    else:
        saved.image = image
        saved.version = uuid.uuid4()
        saved.updated_at = utc_now()
    session.add(saved)
    await session.commit()
    logger.info("Saved signature updated", extra={"actor_id": str(actor.id)})
    return saved


async def delete_signature(session: AsyncSession, actor: User) -> None:
    await session.execute(select(User.id).where(User.id == actor.id).with_for_update())
    saved = await session.get(SavedSignature, actor.id, populate_existing=True)
    if saved:
        await session.delete(saved)
    await session.commit()


class DocumentSnapshot(TypedDict):
    organisation: str
    entity_type: str
    entity_id: str
    signer_name: str
    signed_at: str
    form: dict[str, JsonValue]


def render_pdf(snapshot: DocumentSnapshot, image: bytes) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.add_font(
        "Document", fname=str(Path(__file__).parent / "fonts" / "NotoSans-Regular.ttf")
    )
    pdf.set_font("Document", size=10)

    def line(text: str) -> None:
        pdf.multi_cell(0, 6, text, new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Document", size=16)
    line(snapshot["organisation"])
    pdf.ln(3)
    pdf.set_font("Document", size=13)
    line(TITLES[snapshot["entity_type"]])
    pdf.ln(3)
    pdf.set_font("Document", size=9)
    line(f"Document reference: {snapshot['entity_id']}")
    pdf.ln(4)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Document", size=10)

    def fields(values: dict[str, JsonValue]) -> None:
        for key, value in values.items():
            if value is None or key in {
                "workflow_instance_id",
                "created_at",
                "updated_at",
            }:
                continue
            label = key.replace("_", " ").capitalize()
            if isinstance(value, list):
                line(label)
                for index, entry in enumerate(value, 1):
                    line(f"Entry {index}")
                    if isinstance(entry, dict):
                        fields(entry)
            else:
                line(f"{label}: {value}")

    fields(snapshot["form"])
    pdf.ln(5)
    if pdf.get_y() > 235:
        pdf.add_page()
    line(f"Signed and submitted by: {snapshot['signer_name']}")
    line(f"Signed at (UTC): {snapshot['signed_at']}")
    pdf.image(
        io.BytesIO(image),
        x=pdf.l_margin,
        y=pdf.get_y(),
        w=65,
        h=25,
        keep_aspect_ratio=True,
    )
    pdf.ln(28)
    line("I confirm this submission and apply my saved signature.")
    return bytes(pdf.output())


async def capture(
    *,
    session: AsyncSession,
    actor: User,
    entity: SQLModel,
    entity_type: str,
    signature_version: uuid.UUID | None,
) -> None:
    """Called only after the form service authorizes submission; never commits."""
    if signature_version is None:
        return
    await session.execute(select(User.id).where(User.id == actor.id).with_for_update())
    saved = await session.get(SavedSignature, actor.id, populate_existing=True)
    if saved is None or saved.version != signature_version:
        raise HRValidationError(
            "Your saved signature changed or was deleted. Review it again before signing."
        )
    values = entity.model_dump(mode="json")
    entity_id = uuid.UUID(values["id"])
    existing = await session.scalar(
        select(SignedDocument.id).where(
            SignedDocument.entity_type == entity_type,
            SignedDocument.entity_id == entity_id,
        )
    )
    if existing:
        raise HRValidationError("This document has already been signed")
    if entity_type == "timesheet":
        from src.hr.timesheet.models import TimesheetEntry

        entries = (
            (
                await session.execute(
                    select(TimesheetEntry)
                    .where(TimesheetEntry.timesheet_id == entity_id)
                    .order_by(col(TimesheetEntry.entry_date), col(TimesheetEntry.id))
                )
            )
            .scalars()
            .all()
        )
        values["entries"] = [entry.model_dump(mode="json") for entry in entries]
    elif entity_type == "status_report":
        from src.hr.dailystatus.models import StatusReportEntry

        status_entries = (
            (
                await session.execute(
                    select(StatusReportEntry)
                    .where(StatusReportEntry.status_report_id == entity_id)
                    .order_by(col(StatusReportEntry.id))
                )
            )
            .scalars()
            .all()
        )
        values["entries"] = [entry.model_dump(mode="json") for entry in status_entries]
    subject_id = uuid.UUID(
        values.get("user_id") or values.get("requesting_user_id") or str(actor.id)
    )
    subject = await session.get(User, subject_id)
    values["employee_name"] = subject.full_name if subject else str(subject_id)
    department = await department_for(session, values["department_id"])
    from src.hr.models import Organisation

    organisation = await session.get(Organisation, department.organisation_id)
    signed_at = utc_now()
    snapshot: DocumentSnapshot = {
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "organisation": organisation.name
        if organisation
        else department.organisation_id,
        "signer_name": actor.full_name,
        "signed_at": signed_at.isoformat(),
        "form": values,
    }
    pdf = await run_in_threadpool(render_pdf, snapshot, saved.image)
    session.add(
        SignedDocument(
            entity_type=entity_type,
            entity_id=entity_id,
            signer_id=actor.id,
            subject_id=subject_id,
            department_id=department.id,
            signer_name=actor.full_name,
            signature_version=saved.version,
            signed_at=signed_at,
            snapshot=json.dumps(snapshot, sort_keys=True),
            pdf=pdf,
            sha256=hashlib.sha256(pdf).hexdigest(),
        )
    )
    await session.flush()
    logger.info(
        "HR document signed",
        extra={"actor_id": str(actor.id), "entity_id": str(entity_id)},
    )


async def get_document(
    session: AsyncSession, actor: User, document_id: uuid.UUID
) -> SignedDocument:
    record = await session.get(SignedDocument, document_id)
    if record is None:
        raise AppException("Signed document not found", 404)
    if actor.id not in {record.signer_id, record.subject_id}:
        department = await department_for(session, record.department_id)
        scope = await access.resolve_access(session, actor, department.organisation_id)
        if record.subject_id not in scope.read_users:
            raise AppException("Not allowed to read this signed document", 403)
    return record


async def list_documents(
    session: AsyncSession, actor: User, skip: int, limit: int
) -> tuple[list[SignedDocument], int]:
    query = select(SignedDocument).where(
        (SignedDocument.signer_id == actor.id) | (SignedDocument.subject_id == actor.id)
    )
    count = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        (
            await session.execute(
                query.order_by(
                    col(SignedDocument.signed_at).desc(), col(SignedDocument.id)
                )
                .offset(skip)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return list(rows), count or 0
