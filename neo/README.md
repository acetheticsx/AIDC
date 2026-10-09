# AIDC Neo

A React 19 + TypeScript console migration preserving the existing AIDC API and Ace ID/OIDC contract. Neo is isolated under `neo/`; it does not replace the legacy production app.

## Features

- Bento overview with live application quota, entitlement state, active sessions, uptime signals, integration health, and recent activity.
- Application lifecycle: create, inspect, update, and delete, with redirect URI management, OIDC scopes, one-time secret rotation, branding, origin DNS verification, session history, uptime checks, and application events.
- Activity stream with search/filter, login analytics, operations analytics, and user search scoped to authorized applications.
- Personal preferences: light/dark/system theme, orange/violet/blue/green accent, comfortable/compact density, reduced motion, and contextual tips.
- Keyboard command palette, accessible loading/error states, retry actions, and responsive mobile navigation.
- Server-side entitlement checks, bounded PostgreSQL pool, CSRF protection, rate limiting, request IDs, security headers, and readiness/liveness endpoints.

## Runtime contract

Neo intentionally reuses the same server environment names as AIDC main: `DATABASE_URL`, `ACE_ID_ISSUER`, `ACE_ID_CLIENT_ID`, `ACE_ID_CLIENT_SECRET`, `AIDC_PUBLIC_ORIGIN`, `AIDC_ENTITLEMENTS_SHARED_SECRET`, `AIDC_TRUST_PROXY_HOPS`, `DATABASE_SSL_CA`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_POOL_MAX`, `PORT`, and optional `HOST` (defaults to `0.0.0.0`).

Do not put server secrets in `VITE_*` variables. The browser calls same-origin `/api` and `/auth` endpoints; Vite proxies those paths only in development. Configure `AIDC_PUBLIC_ORIGIN` to Neo's own HTTPS URL and register `<AIDC_PUBLIC_ORIGIN>/auth/callback` with Ace ID. Use a separate database branch for beta deployments.

## Development

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
npm start
```

The build compiles both the browser bundle (`dist/`) and Fastify server (`dist-server/`). The Dockerfile uses Node 22 and a production-only runtime stage.
