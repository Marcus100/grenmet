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
import hashlib
import hmac
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse

from src.email_config import email_settings

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
    to_sign = f"{svix_id}.{svix_timestamp}.{raw_body.decode()}"

    # 3. Decode the secret (strip "whsec_" prefix).
    raw_key_b64 = secret.removeprefix("whsec_")
    try:
        raw_key = base64.b64decode(raw_key_b64)
    except Exception:
        logger.error("Resend webhook: RESEND_WEBHOOK_SECRET is not valid base64")
        return False

    # 4. Compute HMAC-SHA256 and base64-encode.
    computed = base64.b64encode(
        hmac.new(raw_key, to_sign.encode(), hashlib.sha256).digest()
    ).decode()

    # 5. Compare against each signature in the header (space-separated "v1,<sig>" pairs).
    provided_sigs = [
        part.split(",", 1)[1] for part in svix_signature.split(" ") if "," in part
    ]
    return computed in provided_sigs


@router.post(
    "/resend",
    status_code=status.HTTP_200_OK,
    summary="Resend webhook receiver",
    description="Receives and verifies Resend delivery events via the Svix protocol.",
    include_in_schema=False,
)
async def resend_webhook(request: Request) -> JSONResponse:
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
    else:
        logger.warning(
            "RESEND_WEBHOOK_SECRET not set — accepting webhook without verification"
        )

    # ── Parse event ────────────────────────────────────────────────────────
    try:
        event: dict[str, Any] = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON"
        )

    event_type: str = event.get("type", "unknown")
    data: dict[str, Any] = event.get("data", {})
    email_id: str = data.get("email_id", "")
    to_address: str | list[str] = data.get("to", "")

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
            # TODO: add to suppression list / flag user

        case "email.complained":
            logger.warning(
                "Spam complaint: email_id=%s to=%s",
                email_id,
                to_address,
            )
            # TODO: unsubscribe user from non-transactional emails

        case "email.delivery_delayed":
            logger.warning("Email delivery delayed: email_id=%s", email_id)

        case "email.sent" | "email.delivered" | "email.opened" | "email.clicked":
            pass  # already logged above

        case _:
            logger.info("Unhandled Resend event type: %s", event_type)

    return JSONResponse(content={"received": True})
