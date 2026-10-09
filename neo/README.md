# AIDC Neo

A React + TypeScript developer console backed by Fastify and PostgreSQL. Neo keeps identity and subscription ownership in Ace ID and preserves the existing AIDC environment contract.

## Features

- Ace ID OIDC login, PKCE, server-side sessions, CSRF protection, and local logout.
- Application create, edit, delete, quota-aware creation, redirect URI management, and OIDC scope management.
- One-time client-secret rotation/revocation and per-application branding controls.
- Live activity stream, login analytics, user search scoped to consenting users, per-application sessions and uptime checks, plus integration diagnostics.
- Ace ID entitlement visibility including application quota, MAU allowance, feature flags, and payment/renewal metadata where provided.
- Local theme, accent, density, reduced-motion, and guidance preferences.
- Health/readiness endpoints and typed API errors.

## Environment variables

Use the same names as the existing AIDC service: `PORT`, `DATABASE_URL`, `ACE_ID_ISSUER`, `ACE_ID_CLIENT_ID`, `ACE_ID_CLIENT_SECRET`, `AIDC_PUBLIC_ORIGIN`, `AIDC_ENTITLEMENTS_SHARED_SECRET`, `AIDC_TRUST_PROXY_HOPS`, `DATABASE_SSL_CA`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, and `DATABASE_POOL_MAX`. Register `${AIDC_PUBLIC_ORIGIN}/auth/callback` with Ace ID. Keep the entitlement shared secret dedicated to this integration and set the same value on Ace ID and AIDC. Never expose secrets in frontend variables.

Use a separate Neon branch/database for beta testing.

## Verify

`npm ci` · `npm run check` · `npm test` · `npm run build` · `npm run build:server`
