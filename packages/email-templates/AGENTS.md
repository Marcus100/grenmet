# @barrelsgd/email-templates — agent context

React Email templates (`cap-alert`, `newsletter`, `notification`, `organisation-invitation`, `reset-password`, `subscription-confirm`, `welcome`) with `renderTemplate(name, props)` → `{ html, subject }`.

## How email is rendered
FastAPI (`src/email.py`) POSTs to the auth app's `/api/email/render` (`EMAIL_RENDER_URL`, guarded by the `x-email-render-secret` header). That route (`apps/web/auth/src/app/api/email/render/route.ts`) calls `renderTemplate`. FastAPI falls back to Jinja templates in `apps/api/fastapi/email-templates/build` when rendering isn't configured.

## Rules
- Adding a template: add the component, extend `TemplateName` and the `renderTemplate` switch, export it from `index.ts`, and update the FastAPI caller. Keep the Jinja fallback in step or document that it's missing.
- Product/client branding is supplied by the caller; templates stay brand-neutral.
- Props arrive as untyped JSON from FastAPI. Validate required fields before rendering.

## Newsletter (ADR-0052)

`newsletter` (`src/newsletter.tsx`) is the daily climate digest: alerts in effect, then a
forecast summary, then flagged posts, with the recipient's own one-click unsubscribe link.
The subject comes from the caller (`subject` prop). Its Jinja fallback is
`apps/api/fastapi/email-templates/build/newsletter.html`, which is **hand-written** because
the repo has no MJML compiler in its catalog; keep it in step with the React template.
Tests: `src/render.test.ts` (`pnpm test` in this package).
