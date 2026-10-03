"""One-time code delivery by SMS or WhatsApp.

Provider-agnostic on purpose: every message costs money, so production stays
``disabled`` until the owner chooses a provider. ``console`` logs codes for
local development only.
"""

import logging
from typing import Literal

from src.auth.config import auth_settings
from src.exceptions import AppException

logger = logging.getLogger(__name__)

Channel = Literal["sms", "whatsapp"]


def send_code(*, phone: str, channel: Channel, code: str) -> None:
    provider = auth_settings.PHONE_OTP_PROVIDER
    if provider == "console":
        if auth_settings.ENVIRONMENT != "local":
            raise AppException("Phone codes are not configured", 503)
        logger.warning("Phone code for %s via %s: %s", phone, channel, code)
        return
    raise AppException("Phone codes are not configured", 503)
