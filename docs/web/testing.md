# Web App Testing

Run all workspace tests with `pnpm test`, or one app with
`pnpm exec turbo run test --filter=@barrelsgd/web-gaa-admin`.
For a focused check, run `pnpm vitest run src/path/to/example.test.tsx`
from the app directory.

## Keep the suite focused

Keep tests for authentication and permissions, request payloads and failed-save
retries, financial calculations, publication rules, data transformations, and
regressions users have encountered. UI tests should exercise a meaningful action
or distinguish an error state from valid empty data.

Avoid separate tests for static headings, navigation copy, logo classes, sample
data, thin formatting wrappers, or third-party tab behavior. When a workflow test
already checks an outcome, remove the weaker happy-path duplicate. Do not add a
test file merely because a component exists.

Security edge cases and data-integrity checks are not duplicates just because
they share setup. Preserve distinct failure modes. Prefer focused tests over
large scenarios that combine unrelated behaviors.

## Test discovery and caching

Hono runs source tests under `src/` only, so compiled copies in `dist/` do not run
again. Turbo includes Vitest configuration in its test cache inputs; changing
discovery rules invalidates cached results. Run `pnpm fix` and `pnpm type-check`
after changing the suite, then run the affected tests.

Docker workspace dependency coverage is checked by Repository Guardrails in CI.
Application unit tests do not verify that a Docker image has been packaged
correctly; staging image builds remain a separate verification step.

## Admin test environments

The admin suite uses two Vitest projects with a shared two-worker limit and
per-file isolation. `node` runs `.test.ts` files without browser setup; `dom`
runs `.test.tsx` files plus the paper-scale hook test, which uses DOM APIs even
though it has a `.ts` extension. Both inherit the app alias and globals. Coverage
remains configured once for the complete suite.

Run a fast logic-only check from the repository root:

```bash
pnpm --filter @barrelsgd/web-gaa-admin exec vitest run --project node
```

Run components with `--project dom`, or omit `--project` for the complete suite.
When adding a DOM-dependent `.test.ts` file, place it in the DOM project's
include list and exclude it from the Node project so it runs exactly once.
Do not disable isolation or increase timeouts to make performance measurements
look better. Compare uncached full-suite runs on the same machine and retain
both elapsed time and the test count.

The HTTP measurement tool's tests run with the verification entry-point tests
in CI and `pnpm test:verification` (also included in `pnpm verify:release`).

## Before sharing Turbo task results

Dependency-download caching and Docker layer caching already exist in CI.
Shared Turbo task-result caching needs a separate output/input audit first:
`docs`, `mbia`, and `signal` generate `.content-collections` during type-check,
while the root Turbo type-check task currently declares no outputs. Restoring
that task's success alone does not restore those generated files. Declare and
verify the generated output contracts on a fresh checkout before enabling
shared task results; also audit environment inputs and trusted cache writers.
Database integration tests and live deployment probes must continue to execute
against their actual targets.

## Admin environment-split measurement — 11 September 2026

Sequential runs in the same devcontainer (Node 24.20.0, Vitest 5.0.0), using
`pnpm --filter @barrelsgd/web-gaa-admin exec vitest run --reporter=dot` with two
workers and no Turbo result cache:

| Configuration | Files | Tests | Elapsed |
| --- | --- | --- | --- |
| Original shared jsdom setup | 63 passed | 339 passed | 232.30s |
| Node/DOM projects | 63 passed | 339 passed | 174.80s |

The split assigns 22 files to Node and 41 to jsdom. The proxy matcher test now
mocks auth configuration explicitly: running it in Node exposed an unrelated
email-key requirement that jsdom had hidden. Assertions and test timeouts are
unchanged. The observed reduction was 57.50 seconds (24.8%). These sequential
local runs are not a controlled CI benchmark: filesystem warmth and other host
work may differ. Confirm the improvement on the same CI runner class before
setting a feedback-time target.
