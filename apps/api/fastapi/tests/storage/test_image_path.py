"""The weather-image path check accepts image names and stays fast on hostile input."""

import time

import pytest

from src.janitorial.catalogue.service import _slug
from src.storage.router import _is_safe_image_path


@pytest.mark.parametrize(
    "path",
    ["radar/frame 1.png", "a.JPG", "dir/(x)+y%20z.webp", "a/b/c.jpeg", "x.gif"],
)
def test_accepts_image_names(path: str) -> None:
    assert _is_safe_image_path(path)


@pytest.mark.parametrize(
    "path", [".png", "a.txt", "a.png.exe", "a\\b.png", "a<b>.png", "", "noext"]
)
def test_rejects_other_names(path: str) -> None:
    assert not _is_safe_image_path(path)


def test_long_hostile_path_is_checked_in_linear_time() -> None:
    started = time.perf_counter()
    assert not _is_safe_image_path("." * 50_000 + "!")
    assert not _is_safe_image_path("a" * 50_000)
    assert time.perf_counter() - started < 1


def test_slug_trims_dashes_and_handles_long_runs() -> None:
    assert _slug("  Hello, World!  ") == "hello-world"
    started = time.perf_counter()
    assert _slug("-" * 50_000 + "a" + "-" * 50_000) == "a"
    assert time.perf_counter() - started < 1
