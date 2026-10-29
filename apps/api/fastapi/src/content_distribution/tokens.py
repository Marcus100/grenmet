"""Encrypt and decrypt platform tokens at rest (secret_box, keys from config).

No platform token is stored yet. Live posting will call these once the Meta
accounts exist; until then the key list is empty and sealing raises.
"""

from src.utils import secret_box

from .config import content_distribution_settings


def seal(token: str) -> str:
    keys = content_distribution_settings.SOCIAL_TOKEN_ENCRYPTION_KEYS
    return secret_box.encrypt(token, keys)


def unseal(sealed: str) -> str:
    keys = content_distribution_settings.SOCIAL_TOKEN_ENCRYPTION_KEYS
    return secret_box.decrypt(sealed, keys)
