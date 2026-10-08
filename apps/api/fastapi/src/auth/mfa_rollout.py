"""Operator-only TOTP encryption/readiness command; dry-run unless --apply.

Never prints identities, secrets, recovery codes or session credentials.
"""

import argparse
import asyncio
import json
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service, totp
from src.auth.models import User
from src.database import async_session_factory


async def prepare_storage(
    session: AsyncSession, *, apply: bool = False
) -> dict[str, int]:
    # Fail before any changes when keys are missing. Validate every ciphertext first.
    totp.cipher()
    rows = list(
        (
            await session.scalars(
                select(User).where(User.totp_secret.is_not(None)).with_for_update()
            )
        ).all()
    )
    decoded = [(user, totp.decrypt_secret(user.totp_secret or "")) for user in rows]
    plaintext = sum(not totp.is_encrypted(user.totp_secret) for user, _ in decoded)
    if apply:
        for user, secret in decoded:
            user.totp_secret = totp.encrypt_secret(secret)
            session.add(user)
        await session.commit()
    else:
        await session.rollback()
    return {
        "secrets_checked": len(rows),
        "plaintext_secrets": plaintext,
        "secrets_rewrapped": len(rows) if apply else 0,
    }


async def readiness(session: AsyncSession) -> dict[str, int]:
    totals = {
        "privileged_accounts": 0,
        "missing_enrolment": 0,
        "missing_recovery_codes": 0,
        "unencrypted_secrets": 0,
        "unreadable_secrets": 0,
    }
    users = list((await session.scalars(select(User))).all())
    for user in users:
        # Storage rejection applies to every enrolled identity, including public apps.
        if user.totp_secret:
            if not totp.is_encrypted(user.totp_secret):
                totals["unencrypted_secrets"] += 1
            else:
                from src.exceptions import AppException

                try:
                    totp.decrypt_secret(user.totp_secret)
                except AppException:
                    totals["unreadable_secrets"] += 1
        if not user.is_active or user.registration_pending:
            continue
        if not user.is_superuser and not await service.has_effective_permission(
            session=session, user=user, permission_key="user.manage"
        ):
            continue
        totals["privileged_accounts"] += 1
        if not user.totp_enabled or not user.totp_secret:
            totals["missing_enrolment"] += 1
        if not user.mfa_recovery_hashes:
            totals["missing_recovery_codes"] += 1
    return totals


async def run(*, apply: bool, check_readiness: bool) -> int:
    async with async_session_factory() as session:
        if check_readiness:
            totals = await readiness(session)
            sys.stdout.write(json.dumps(totals) + "\n")
            return int(
                totals["privileged_accounts"] == 0
                or any(
                    value
                    for key, value in totals.items()
                    if key != "privileged_accounts"
                )
            )
        sys.stdout.write(json.dumps(await prepare_storage(session, apply=apply)) + "\n")
        return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check-readiness", action="store_true")
    args = parser.parse_args()
    if args.apply and args.check_readiness:
        parser.error("--apply and --check-readiness are separate operations")
    raise SystemExit(
        asyncio.run(run(apply=args.apply, check_readiness=args.check_readiness))
    )
