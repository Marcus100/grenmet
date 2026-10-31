"""Address rules for a post's link and image. Pure functions: no database.

Python's URL parser and a browser can read the same string differently. These cases
are the ones where they disagree, plus the plain addresses that must still pass.
"""

import pytest

from src.content_distribution.service import address_problem


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.com\\x@allowed.com/p",  # the bypass: a browser goes to evil.com
        "https://allowed.com\\evil.com",
        "https://allowed.com/\\evil.com",
    ],
)
def test_a_backslash_is_refused(url: str) -> None:
    assert address_problem(url) == "contains a backslash"


@pytest.mark.parametrize(
    "url",
    [
        "https://user@allowed.com/p",
        "https://user:secret@allowed.com/p",
        "https://allowed.com@evil.com/p",
    ],
)
def test_user_information_is_refused(url: str) -> None:
    assert address_problem(url) == "contains user information"


@pytest.mark.parametrize(
    ("url", "problem"),
    [
        ("https://allowed.com:8443/p", "uses a port other than 443"),
        ("https://allowed.com:80/p", "uses a port other than 443"),
        ("https://allowed.com:99999/p", "has an invalid port"),
        ("https://allowed.com:abc/p", "has an invalid port"),
    ],
)
def test_a_port_other_than_443_or_an_invalid_port_is_refused(
    url: str, problem: str
) -> None:
    assert address_problem(url) == problem


@pytest.mark.parametrize(
    "url",
    [
        "https://allowed.com/p",
        "https://allowed.com:443/p",
        "https://allowed.com/stories/x?y=1#z",
    ],
)
def test_plain_addresses_and_the_https_port_pass(url: str) -> None:
    assert address_problem(url) is None
