"""Pure audience evaluation (ADR-0020): every rule, combination and bucketing."""

import uuid

import pytest

from src.feature_flags import rules
from src.feature_flags.schemas import FeatureFlagAudience

USER = uuid.UUID("11111111-1111-1111-1111-111111111111")
OTHER = uuid.UUID("22222222-2222-2222-2222-222222222222")


def _on(audience: dict, *, env: str = "local", org=None, user=None, key="demo") -> bool:
    return rules.evaluate(
        FeatureFlagAudience.model_validate(audience),
        flag_key=key,
        environment=env,
        organisation_id=org,
        user_id=user,
    )


def test_empty_audience_includes_nobody() -> None:
    assert not _on({}, org="org_a", user=USER)


def test_everyone() -> None:
    assert _on({"everyone": True})
    assert _on({"everyone": True}, org="org_a", user=USER)


def test_organisation_ids() -> None:
    audience = {"organisation_ids": ["org_a"]}
    assert _on(audience, org="org_a")
    assert not _on(audience, org="org_b")
    assert not _on(audience)


def test_user_ids() -> None:
    audience = {"user_ids": [str(USER)]}
    assert _on(audience, user=USER)
    assert not _on(audience, user=OTHER)
    assert not _on(audience)


def test_any_matching_rule_includes_the_subject() -> None:
    audience = {"organisation_ids": ["org_a"], "user_ids": [str(USER)]}
    assert _on(audience, org="org_a", user=OTHER)
    assert _on(audience, org="org_b", user=USER)
    assert not _on(audience, org="org_b", user=OTHER)


def test_environment_allowlist_gates_every_rule() -> None:
    audience = {"everyone": True, "environments": ["staging"]}
    assert _on(audience, env="staging")
    assert not _on(audience, env="production")
    assert not _on(audience, env="local")
    gated = {"organisation_ids": ["org_a"], "environments": ["local"]}
    assert _on(gated, env="local", org="org_a")
    assert not _on(gated, env="production", org="org_a")


def test_empty_environment_list_means_any_environment() -> None:
    assert _on({"everyone": True}, env="production")


def test_percentage_extremes() -> None:
    assert not _on({"percentage": 0}, user=USER)
    assert _on({"percentage": 100}, user=USER)
    assert _on({"percentage": 100}, org="org_a")


def test_percentage_needs_a_subject() -> None:
    assert not _on({"percentage": 100})


def test_percentage_buckets_by_user_when_known_else_organisation() -> None:
    bucket_user = rules.bucket("demo", str(USER))
    assert _on({"percentage": bucket_user + 1}, user=USER, org="org_a")
    assert not _on({"percentage": bucket_user}, user=USER, org="org_a")
    bucket_org = rules.bucket("demo", "org_a")
    assert _on({"percentage": bucket_org + 1}, org="org_a")
    assert not _on({"percentage": bucket_org}, org="org_a")


def test_bucket_is_stable_and_in_range() -> None:
    assert rules.bucket("demo", "subject") == 58
    # Pinned so a hash or salt change (which would reshuffle live rollouts) fails loudly.
    assert rules.bucket("demo", "subject") == rules.bucket("demo", "subject")
    for i in range(500):
        assert 0 <= rules.bucket("demo", f"s{i}") < rules.BUCKETS


def test_bucket_is_salted_by_flag_key() -> None:
    differing = sum(
        rules.bucket("flag-a", f"s{i}") != rules.bucket("flag-b", f"s{i}")
        for i in range(200)
    )
    assert differing > 150


@pytest.mark.parametrize("percentage", [10, 25, 50, 90])
def test_bucket_distribution_is_roughly_uniform(percentage: int) -> None:
    total = 20_000
    inside = sum(
        rules.bucket("rollout", str(uuid.UUID(int=i))) < percentage
        for i in range(total)
    )
    assert abs(inside / total - percentage / 100) < 0.02


def test_rollout_only_grows_when_percentage_increases() -> None:
    subjects = [str(uuid.UUID(int=i)) for i in range(2000)]
    at_20 = {s for s in subjects if rules.bucket("rollout", s) < 20}
    at_40 = {s for s in subjects if rules.bucket("rollout", s) < 40}
    assert at_20 <= at_40


@pytest.mark.parametrize(
    "bad",
    [
        {"percentage": -1},
        {"percentage": 101},
        {"environments": ["qa"]},
        {"user_ids": ["not-a-uuid"]},
    ],
)
def test_invalid_audience_is_rejected(bad: dict) -> None:
    with pytest.raises(ValueError):
        FeatureFlagAudience.model_validate(bad)
