"""Run an encoder so that an unexpected failure is a stored error, never a 500.

The register's acceptance and send paths call the IWXXM and BUFR encoders. A bug or an
environment problem inside an encoder must not fail the request: the failure is logged
(the log names the encoder and carries no observation values) and the caller stores or
returns the encoder's failed record instead.
"""

import logging
from collections.abc import Callable
from typing import Any

from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

ENCODER_FAILED = "encoder failed unexpectedly; see the server log"


async def run_encoder(
    label: str,
    encoder: Callable[..., dict[str, Any]],
    failed: dict[str, Any],
    **kwargs: Any,
) -> dict[str, Any]:
    """The encoder's record, run in a thread; ``failed`` when it raises anything."""
    try:
        return await run_in_threadpool(encoder, **kwargs)
    except Exception:
        logger.exception("eRegister %s encoder failed; stored as an error", label)
        return failed
