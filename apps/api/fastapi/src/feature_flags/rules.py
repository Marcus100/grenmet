"""Pure audience-rule evaluation (ADR-0020). No I/O, so it is exhaustively testable."""

import hashlib
import uuid

from .schemas import FeatureFlagAudience

BUCKETS = 100


def bucket(flag_key: str, subject_id: str) -> int:
    """Stable bucket 0-99 for a (flag, subject) pair. The flag key salts the hash
    so one subject is not always in the first N percent of every rollout."""
    digest = hashlib.sha256(f"{flag_key}:{subject_id}".encode()).digest()
    return int.from_bytes(digest[:8], "big") % BUCKETS


def evaluate(
    rules: FeatureFlagAudience,
    *,
    flag_key: str,
    environment: str,
    organisation_id: str | None = None,
    user_id: uuid.UUID | None = None,
) -> bool:
    """Whether the audience includes the subject. An empty audience includes nobody.

    The environment allowlist gates everything; inside it, any matching rule
    (everyone, organisation, user, percentage) includes the subject. Percentage
    buckets by user when known, otherwise by organisation.
    """
    if rules.environments and environment not in rules.environments:
        return False
    if rules.everyone:
        return True
    if organisation_id is not None and organisation_id in rules.organisation_ids:
        return True
    if user_id is not None and user_id in rules.user_ids:
        return True
    if rules.percentage is not None:
        subject = str(user_id) if user_id is not None else organisation_id
        if subject is not None:
            return bucket(flag_key, subject) < rules.percentage
    return False
