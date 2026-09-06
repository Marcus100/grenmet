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
