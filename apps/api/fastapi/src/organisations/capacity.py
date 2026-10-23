"""The capacity a request acts in on an organisation's data (ADR-0050).

``member``: through the caller's own membership of the organisation.
``staff``: a Barrels staff member holding an ``events.ops.*`` key through a role.

The dependency stores the capacity on ``session.info`` (the same pattern as the
audit actor), so services that write history can record it without a new
parameter. A leaf module: no imports from the rest of the app.
"""

from typing import Literal

Capacity = Literal["member", "staff"]
ACTOR_CAPACITY_KEY = "events.actor_capacity"
DEFAULT_CAPACITY: Capacity = "member"
