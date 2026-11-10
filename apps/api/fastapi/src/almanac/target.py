"""Which database an almanac script is about to write, and the guard against a wrong one.

The yearly astronomy build and the tide import write to whatever database the
shell's settings point at. Before writing they print the host and database, and
a host that is not local needs ``--confirm-host <host>`` with the same name, so a
shell that happens to hold production settings cannot load data by accident.
"""

from src.config import settings

LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "db", "postgres"})


class TargetNotConfirmedError(Exception):
    """The script would write to a non-local database without confirmation."""


def describe_target() -> tuple[str, str]:
    """The host and database name the scripts will write to."""
    return settings.POSTGRES_SERVER, settings.POSTGRES_DB


def require_confirmed(host: str, confirm_host: str | None) -> None:
    """Refuse a non-local host unless ``confirm_host`` names it exactly."""
    if host in LOCAL_HOSTS:
        return
    if confirm_host != host:
        raise TargetNotConfirmedError(
            f"refusing to write to {host}: pass --confirm-host {host} to confirm"
        )
