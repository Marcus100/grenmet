"""The almanac scripts refuse a non-local database unless its host is confirmed."""

import pytest

from src.almanac.target import TargetNotConfirmedError, require_confirmed


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "db"])
def test_local_hosts_need_no_confirmation(host: str) -> None:
    require_confirmed(host, None)


def test_remote_host_needs_its_name_repeated() -> None:
    with pytest.raises(TargetNotConfirmedError, match="--confirm-host db.prod"):
        require_confirmed("db.prod", None)
    with pytest.raises(TargetNotConfirmedError):
        require_confirmed("db.prod", "db.staging")
    require_confirmed("db.prod", "db.prod")
