"""Resend webhook receiver.

Resend uses the Svix protocol for webhook signing.
Docs: https://resend.com/docs/dashboard/webhooks/introduction

Required env var: RESEND_WEBHOOK_SECRET
  Obtain from: Resend dashboard → Webhooks → your endpoint → Signing secret
  Format: whsec_<base64string>

Events received (configure in Resend dashboard):
  email.sent, email.delivered, email.delivery_delayed,
  email.bounced, email.complained, email.opened, email.clicked
"""

import base64
import binascii
import hashlib
import hmac
import json
import logging
import time
from email.utils import parseaddr
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.dependencies import SessionDep
from src.email_config import email_settings
from src.notifications import service as notification_service
from src.notifications.models import SuppressionReason

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Maximum age of a webhook before it is rejected (Svix default: 5 minutes).
_TOLERANCE_SECONDS = 300


def _verify_svix_signature(
    raw_body: bytes,
    svix_id: str,
    svix_timestamp: str,
    svix_signature: str,
    secret: str,
) -> bool:
    """Verify a Svix-signed webhook payload.

    Algorithm: https://docs.svix.com/receiving/verifying-payloads/how-manual
    """
    # 1. Reject stale messages.
    try:
        ts = int(svix_timestamp)
    except ValueError:
        return False

    if abs(int(time.time()) - ts) > _TOLERANCE_SECONDS:
        logger.warning("Resend webhook rejected: timestamp out of tolerance")
        return False

    # 2. Build the signed content string.
    to_sign = f"{svix_id}.{svix_timestamp}.".encode() + raw_body

    # 3. Decode the secret (strip "whsec_" prefix).
    raw_key_b64 = secret.removeprefix("whsec_")
    try:
        raw_key = base64.b64decode(raw_key_b64, validate=True)
    except binascii.Error, ValueError:
        logger.error("Resend webhook: RESEND_WEBHOOK_SECRET is not valid base64")
        return False
    if not raw_key:
        return False

    # 4. Compute HMAC-SHA256 and base64-encode.
    computed = base64.b64encode(hmac.new(raw_key, to_sign, hashlib.sha256).digest())

    # 5. Compare against each signature in the header (space-separated "v1,<sig>" pairs)
    #    using a constant-time comparison to avoid leaking the signature by timing.
    provided_sigs = [
        part.removeprefix("v1,").encode()
        for part in svix_signature.split()
        if part.startswith("v1,")
    ]
    return any(hmac.compare_digest(computed, sig) for sig in provided_sigs)


def _recipients(to_address: str | list[str]) -> list[str]:
    if isinstance(to_address, str):
        return [to_address] if to_address else []
    if isinstance(to_address, list):
        return [item for item in to_address if isinstance(item, str) and item]
    return []


async def _suppress(
    session: AsyncSession,
    recipients: list[str],
    reason: SuppressionReason,
    source_event_id: str | None,
) -> None:
    """Suppress non-transactional email to each recipient; safe to replay.

    Suppression blocks every list for that address. It does not change any list's
    subscription row: only the reader's own unsubscribe stops a list (ADR-0052)."""
    for address in recipients:
        # Resend may send "Name <user@host>"; keep just the address.
        _, parsed = parseaddr(address)
        email = parsed or address
        added = await notification_service.suppress_email(
            session=session,
            email=email,
            reason=reason,
            source_event_id=source_event_id,
        )
        logger.info(
            "Email suppression recorded",
            extra={"reason": reason.value, "newly_added": added},
        )
    await session.commit()


@router.post(
    "/resend",
    status_code=status.HTTP_200_OK,
    summary="Resend webhook receiver",
    description="Receives and verifies Resend delivery events via the Svix protocol.",
    include_in_schema=False,
)
async def resend_webhook(request: Request, session: SessionDep) -> JSONResponse:
    """Handle inbound Resend webhook events."""
    raw_body = await request.body()

    # ── Signature verification ──────────────────────────────────────────────
    if email_settings.RESEND_WEBHOOK_SECRET:
        svix_id = request.headers.get("svix-id", "")
        svix_timestamp = request.headers.get("svix-timestamp", "")
        svix_signature = request.headers.get("svix-signature", "")

        if not all([svix_id, svix_timestamp, svix_signature]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing Svix signature headers",
            )

        if not _verify_svix_signature(
            raw_body,
            svix_id,
            svix_timestamp,
            svix_signature,
            email_settings.RESEND_WEBHOOK_SECRET,
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook signature",
            )
    elif settings.ENVIRONMENT == "local":
        logger.warning(
            "RESEND_WEBHOOK_SECRET not set — accepting webhook without verification "
            "(local only)"
        )
    else:
        # Fail closed outside local: an unset secret must never allow forged
        # delivery/bounce events to be accepted in staging/production.
        logger.error(
            "RESEND_WEBHOOK_SECRET not set — rejecting webhook in %s",
            settings.ENVIRONMENT,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook verification is not configured",
        )

    # ── Parse event ────────────────────────────────────────────────────────
    try:
        event: dict[str, Any] = json.loads(raw_body)
    except json.JSONDecodeError, UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON"
        )

    if (
        not isinstance(event, dict)
        or not isinstance(event.get("type"), str)
        or not isinstance(event.get("data"), dict)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid event envelope"
        )
    event_type: str = event["type"]
    data: dict[str, Any] = event["data"]
    if "bounce" in data and not isinstance(data["bounce"], dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid bounce details"
        )
    email_id: str = data.get("email_id", "")
    to_address: str | list[str] = data.get("to", "")
    recipients = _recipients(to_address)
    # Svix re-sends the same id on retries; fall back to the email id locally.
    source_event_id = request.headers.get("svix-id") or email_id or None

    logger.info(
        "Resend webhook received: type=%s email_id=%s to=%s",
        event_type,
        email_id,
        to_address,
    )

    # ── Handle specific events ─────────────────────────────────────────────
    match event_type:
        case "email.bounced":
            logger.warning(
                "Email bounced: email_id=%s to=%s bounce_type=%s",
                email_id,
                to_address,
                data.get("bounce", {}).get("type"),
            )
            # Only permanent (hard) bounces suppress; transient and undetermined
            # bounces may recover and Resend retries them itself.
            if str(data.get("bounce", {}).get("type", "")).lower() == "permanent":
                await _suppress(
                    session, recipients, SuppressionReason.HARD_BOUNCE, source_event_id
                )

        case "email.complained":
            logger.warning(
                "Spam complaint: email_id=%s to=%s",
                email_id,
                to_address,
            )
            await _suppress(
                session,
                recipients,
                SuppressionReason.COMPLAINT,
                source_event_id,
            )

        case "email.delivery_delayed":
            logger.warning("Email delivery delayed: email_id=%s", email_id)

        case "email.sent" | "email.delivered" | "email.opened" | "email.clicked":
            pass  # already logged above

        case _:
            logger.info("Unhandled Resend event type: %s", event_type)

    return JSONResponse(content={"received": True})
