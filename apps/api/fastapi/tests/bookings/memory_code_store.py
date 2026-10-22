"""In-memory stand-in for the Redis email-code store, with a controllable clock."""

from src.bookings.email_code import VerificationUnavailableError


class MemoryCodeStore:
    def __init__(self) -> None:
        self.now = 0.0
        self.down = False
        self._data: dict[str, tuple[str, float]] = {}

    def advance(self, seconds: float) -> None:
        self.now += seconds

    def _live(self, key: str) -> str | None:
        if self.down:
            raise VerificationUnavailableError
        item = self._data.get(key)
        if item is None or item[1] <= self.now:
            self._data.pop(key, None)
            return None
        return item[0]

    async def put(self, key: str, value: str, ttl: int) -> None:
        self._live(key)
        self._data[key] = (value, self.now + ttl)

    async def get(self, key: str) -> str | None:
        return self._live(key)

    async def take(self, key: str) -> bool:
        found = self._live(key) is not None
        self._data.pop(key, None)
        return found

    async def put_if_absent(self, key: str, value: str, ttl: int) -> bool:
        if self._live(key) is not None:
            return False
        self._data[key] = (value, self.now + ttl)
        return True

    async def incr(self, key: str, ttl: int) -> int:
        current = self._live(key)
        count = int(current) + 1 if current else 1
        expires = self._data[key][1] if current else self.now + ttl
        self._data[key] = (str(count), expires)
        return count

    async def exists(self, key: str) -> bool:
        return self._live(key) is not None
