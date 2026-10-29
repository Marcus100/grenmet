"""Platform outbox topics for social posting (ADR-0026). Import this module to register them.

Each topic is one platform. The outbox gives the retries (1 minute doubling to an
hour, dead after 5 attempts); ``on_dead`` records the give-up on the delivery row
so the editor can see it. Dry run by default: see service.publish.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox

from . import service
from .constants import PLATFORM_FACEBOOK, PLATFORM_INSTAGRAM


@outbox.handler(f"social.post.{PLATFORM_FACEBOOK}", on_dead=service.dead_letter)
async def post_facebook(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    await service.post_delivery(session, message)


@outbox.handler(f"social.post.{PLATFORM_INSTAGRAM}", on_dead=service.dead_letter)
async def post_instagram(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    await service.post_delivery(session, message)
