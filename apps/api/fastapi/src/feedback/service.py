"""Anonymous page feedback: store the answer, nothing else."""

from sqlalchemy.ext.asyncio import AsyncSession

from .models import PageFeedback
from .schemas import PageFeedbackCreate


async def submit_feedback(
    *, session: AsyncSession, payload: PageFeedbackCreate
) -> PageFeedback:
    comment = payload.comment.strip() if payload.comment else None
    row = PageFeedback(
        site=payload.site,
        page_path=payload.page_path,
        helpful=payload.helpful,
        comment=comment or None,
    )
    session.add(row)
    await session.commit()
    return row
