"""Explicit CMS grants, independent of employment and general role assignments."""

from src.auth.models import User
from src.auth.permissions import PERMISSIONS

WRITER_KEYS = frozenset(
    {
        "cms.article.create",
        "cms.article.edit.own",
        "cms.article.submit",
    }
)


def permission_keys(user: User) -> list[str]:
    if user.is_superuser or user.cms_access == "publisher":
        return sorted(p.key for p in PERMISSIONS if p.key.startswith("cms."))
    if user.cms_access == "writer":
        return sorted(WRITER_KEYS)
    return []
