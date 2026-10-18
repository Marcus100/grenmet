"""Transfer queued WIS2 CSV files to wis2box (ARQ job body).

The send log row is the durable job: ``queued`` until the file is stored, then
``sent`` (handed to wis2box, which converts to BUFR itself). A failed attempt
keeps the row ``queued`` with ``next_retry_at`` (exponential backoff) until
``WIS2BOX_MAX_ATTEMPTS`` is reached, then it becomes ``failed``.
"""

import asyncio
import logging
import os
import tempfile
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.storage.config import StorageConfig
from src.storage.service import StorageService
from src.utils.datetime import utc_now

from .config import Wis2boxConfig, wis2box_settings
from .models import (
    STATUS_FAILED,
    STATUS_QUEUED,
    STATUS_SENT,
    TARGET_WIS2,
    ERegisterSend,
)

logger = logging.getLogger(__name__)

RETRY_BASE_SECONDS = 60
RETRY_MAX_SECONDS = 3600

# (object key, CSV text) -> stored
Sink = Callable[[str, str], None]


def retry_delay_seconds(attempts: int) -> int:
    return min(RETRY_BASE_SECONDS << max(attempts - 1, 0), RETRY_MAX_SECONDS)


def directory_sink(config: Wis2boxConfig) -> Sink:
    def put(key: str, content: str) -> None:
        root = Path(config.WIS2BOX_INCOMING_DIR or "")
        target = (root / key).resolve()
        if root.resolve() not in target.parents:
            raise ValueError("Object key escapes the incoming directory")
        target.parent.mkdir(parents=True, exist_ok=True)
        # Write then rename so wis2box never reads a half-written file.
        handle, temporary = tempfile.mkstemp(dir=target.parent, suffix=".part")
        try:
            with os.fdopen(handle, "w", encoding="utf-8", newline="") as stream:
                stream.write(content)
            Path(temporary).replace(target)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise

    return put


def s3_sink(config: Wis2boxConfig) -> Sink:
    service = StorageService(
        StorageConfig(
            STORAGE_ENDPOINT_URL=config.WIS2BOX_S3_ENDPOINT_URL,
            STORAGE_BUCKET=config.WIS2BOX_S3_BUCKET,
            STORAGE_ACCESS_KEY_ID=config.WIS2BOX_S3_ACCESS_KEY_ID,
            STORAGE_SECRET_ACCESS_KEY=config.WIS2BOX_S3_SECRET_ACCESS_KEY,
        )
    )

    def put(key: str, content: str) -> None:
        service.put_object(key, content.encode("utf-8"), content_type="text/csv")

    return put


def default_sink(config: Wis2boxConfig) -> Sink | None:
    kind = config.sink
    if kind == "dir":
        return directory_sink(config)
    if kind == "s3":
        return s3_sink(config)
    return None


async def _deliver(row: ERegisterSend, sink: Sink, max_attempts: int) -> None:
    row.attempts += 1
    try:
        await asyncio.to_thread(
            sink, str(row.detail["key"]), str(row.detail["content"])
        )
    except Exception as exc:  # noqa: BLE001 - one bad file must not stop the batch
        row.last_error = str(exc)[:1000] or type(exc).__name__
        if row.attempts >= max_attempts:
            row.status = STATUS_FAILED
            row.next_retry_at = None
        else:
            row.next_retry_at = utc_now() + timedelta(
                seconds=retry_delay_seconds(row.attempts)
            )
        logger.warning("WIS2 transfer failed", extra={"send_id": str(row.id)})
        return
    row.status = STATUS_SENT
    row.sent_at = utc_now()
    row.last_error = None
    row.next_retry_at = None
    # The CSV is no longer needed once wis2box has it.
    row.detail = {k: v for k, v in row.detail.items() if k != "content"}


async def process_due_publications(
    *,
    session: AsyncSession,
    sink: Sink | None = None,
    limit: int = 20,
    config: Wis2boxConfig | None = None,
) -> int:
    """Store due CSV files. Returns how many rows were handled."""
    config = config or wis2box_settings
    sink = sink or default_sink(config)
    if sink is None:
        return 0
    handled = 0
    for _ in range(limit):
        now = utc_now()
        row = (
            await session.execute(
                select(ERegisterSend)
                .where(
                    ERegisterSend.target == TARGET_WIS2,
                    ERegisterSend.status == STATUS_QUEUED,
                    or_(
                        ERegisterSend.next_retry_at.is_(None),
                        ERegisterSend.next_retry_at <= now,
                    ),
                )
                .order_by(ERegisterSend.created_at)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
        ).scalar_one_or_none()
        if row is None:
            break
        await _deliver(row, sink, config.WIS2BOX_MAX_ATTEMPTS)
        await session.commit()
        handled += 1
    return handled
