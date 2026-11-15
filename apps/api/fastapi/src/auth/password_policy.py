"""Password length rule shared by every schema that accepts a new password.

bcrypt only reads the first 72 bytes of its input. bcrypt 4 dropped the rest
silently; bcrypt 5 raises ``ValueError``. A new password longer than 72 bytes
is therefore refused with a clear 422 instead of being half-ignored. The limit is
in bytes, not characters: a 128-character password can be 512 bytes in UTF-8.
"""

from pydantic import AfterValidator

BCRYPT_MAX_BYTES = 72

TOO_LONG_MESSAGE = (
    "Password is too long: it must be at most 72 bytes. Letters, digits and "
    "symbols are one byte each; accented letters, emoji and other characters "
    "may use two to four."
)


def fits_bcrypt(password: str) -> bool:
    return len(password.encode("utf-8")) <= BCRYPT_MAX_BYTES


def _check_new_password(value: str) -> str:
    if not fits_bcrypt(value):
        raise ValueError(TOO_LONG_MESSAGE)
    return value


#: Use as ``Annotated[str, BcryptSafe]`` on every new-password field, next to the
#: ``Field`` length limits. Never on a login or verification field.
BcryptSafe = AfterValidator(_check_new_password)

#: OpenAPI description for a new-password field.
PASSWORD_DESCRIPTION = (
    "At most 72 bytes in UTF-8 (bcrypt limit); accented letters and emoji use "
    "more than one byte."
)
