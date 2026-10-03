# @barrelsgd/email-templates — agent context

React Email templates (`notification`, `reset-password`, `welcome`) with `renderTemplate(name, props)` → `{ html, subject }`.

## How email is rendered
FastAPI (`src/email.py`) POSTs to the auth app's `/api/email/render` (`EMAIL_RENDER_URL`, guarded by the `x-email-render-secret` header). That route (`apps/web/auth/src/app/api/email/render/route.ts`) calls `renderTemplate`. FastAPI falls back to Jinja templates in `apps/api/fastapi/email-templates/build` when rendering isn't configured.

## Rules
- Adding a template: add the component, extend `TemplateName` and the `renderTemplate` switch, export it from `index.ts`, and update the FastAPI caller. Keep the Jinja fallback in step or document that it's missing.
- Product/client branding is supplied by the caller; templates stay brand-neutral.
- Props arrive as untyped JSON from FastAPI. Validate required fields before rendering.
