# Launch findings and corrective actions

Document register started 23 September 2026 for J-Quality. This is a working
engineering record, not an approved quality system. Journey acceptance remains
in the [readiness ledger](launch-readiness-coverage.md). No personnel data or
secrets. Owners/reviewers remain unassigned until explicitly appointed.

Each finding retains source, evidence, owner, due date, response, completion
evidence, independent reviewer and closure/reopening history. Initial review
target is September 28; this target does not imply owner acceptance.

| ID | Source / finding | Corrective action / evidence | Review |
| --- | --- | --- | --- |
| Q-001 | J-CMS: Latest publications requested the weather-news feed | Corrected section query and component; regression reproduced before fix | Owner/reviewer unassigned; pending review |
| Q-002 | J-Forecast: presentation removed LOCAL TEST label | Preserve authored summary exactly; regression reproduced before fix | Owner/reviewer unassigned; pending review |
| Q-003 | J-CMS: absent/unavailable article could fall back to sample prose | Remove fallback; outage notice and genuine missing article remain distinct; three page tests | Owner/reviewer unassigned; pending review |
| Q-004 | J-CMS: skipped database suite used old Markdown/role fixtures | Match runtime Lexical editor and explicit permissions; all 25 CMS tests passed with isolated host schema | Owner/reviewer unassigned; pending review |
| Q-005 | J-Staff: current feed represented as daily schedule completion | Remove Complete/Pending claims from product count; describe tracked types in current feed; F06 still needed | Owner/reviewer unassigned; pending review |
| Q-006 | J-SYNOP/J-Aviation: mandatory sandbox evidence incomplete | Name authorised sandbox/profile; trace record → BUFR → notification → retrieval and validated aviation files | Owner unassigned; open release blocker |
| Q-007 | J-CMS: media collection reads are public, including independently uploaded media | Confirm intended public-upload policy versus private draft attachments before linking restricted documents; review storage delivery too | Owner unassigned; open policy/security assessment |
| Q-008 | J-CMS: rich-text feed flattens links/formatting, omits official-document reference; CMS image URLs may be relative to the wrong host | Specify safe public rendering/assets contract and test representative content/downloads; preserve source revision | Owner unassigned; open publishing limitation |
| Q-009 | J-Obs: structured observation save failed at asyncpg parameter binding | Reproduced with real disposable database; bind native datetimes and typed JSONB; save/reopen and anonymous denial tests pass | Owner/reviewer unassigned; pending review |

## History

- 23 September, Codex: created Q-001–Q-008 from code inspection and test runs at
  `e4316039ae8e0ae64da3988cae51dda10d6fbcff` plus the current working diff.
  Q-001–Q-005 have engineering responses; none is independently closed.
- 23 September, Codex: added Q-009 with failing/passing persisted-state evidence;
  no public API or storage schema changed.
