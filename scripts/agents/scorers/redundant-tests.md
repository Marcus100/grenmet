---
name: redundant-tests
description: The agent wrote tests that add no protection, duplicate existing coverage, or test the framework instead of the change.
sample: 0.3
min_tools: 8
---

Judge only the tests the agent added or changed in this session.

**Pass** when every new or changed test protects behaviour the change introduced
or fixed, and no two new tests check the same thing.

**Fail** when the agent added a test that duplicates an existing one, asserts
only that a mock was called, re-tests library or framework behaviour, snapshots a
large structure without a reason, or added several near-identical cases where one
table-driven case would do.

**Not applicable** when the session added or changed no tests.
