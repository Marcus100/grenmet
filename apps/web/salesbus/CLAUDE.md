# salesbus (`@grenmet/web-salesbus`) — Claude context

Port **3007**. Point-of-sale app for managing product inventory, sales transactions, cart, and customer settlements.

## Auth pattern

Delegates to `web-auth` (`:3000`) via redirect — does not handle sign-in itself.

## No database

Mock data currently in `src/lib/mock-data.ts`. API integration via `@grenmet/api-client` is planned. No Drizzle, no direct DB.

## Routes

```
src/app/
  page.tsx                              ← redirects to /sales
  sales/
    page.tsx                            ← product catalog + cart
    cart/page.tsx                       ← cart review
  inventory/
    page.tsx                            ← inventory overview
    [category]/page.tsx                 ← category detail
  settlements/
    page.tsx                            ← settlement summary
    customers/page.tsx                  ← customer list
    customers/[id]/page.tsx             ← customer detail
  offline/page.tsx                      ← offline fallback
  api/health/route.ts
```

## Key dependencies (unique to this app)

- `@tanstack/react-query` — server state management via `QueryProvider`
- `@grenmet/api-client` — FastAPI client (ready to use, currently using mock data)

## Special conventions

- Cart state is managed in `src/lib/cart-store.tsx` — React context, not Zustand or TanStack.
- `src/components/ui/` contains app-local UI primitives (Button, Modal, etc.) that are NOT from `@grenmet/ui`. These are salesbus-specific and should not be moved to the shared package without deliberate decision.
- Root `/` redirects to `/sales` — entry point is the sales page, not a dashboard.
- `NEXT_PUBLIC_ENVIRONMENT` env var distinguishes `local` / `staging` / `production` within the app.
