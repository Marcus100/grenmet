"""Current operational NHC product collection."""

# Bind pyproj to its own PROJ wheel before ecCodes/findlibs globally preloads
# eckitlib's separate PROJ copy. With the locked ecCodes 2.48.3/pyproj 3.8.0
# wheels, the reverse order corrupts the heap at interpreter shutdown, even
# without decoding anything. Both CLI entrypoints import this package first.
# Keep the subprocess regression when upgrading either native dependency.
import pyproj as _pyproj  # noqa: F401

__version__ = "0.2.0"
