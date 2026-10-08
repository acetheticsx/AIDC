# AIDC Neo

Neo is the incremental React + TypeScript + Fastify migration of AIDC.

## Identity and environment compatibility

Neo intentionally uses the same production environment variable names and Ace ID credentials as the legacy console:

- `ACE_ID_ISSUER`
- `ACE_ID_CLIENT_ID`
- `ACE_ID_CLIENT_SECRET`
- `AIDC_PUBLIC_ORIGIN`
- `AIDC_ENTITLEMENTS_SHARED_SECRET`
- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `DATABASE_SSL_CA`
- `DATABASE_SSL_REJECT_UNAUTHORIZED`
- `AIDC_TRUST_PROXY_HOPS`

Do not commit real values. For a beta deployment, copy the values from the existing Deplexo environment into the separate Neo/preview application. `AIDC_PUBLIC_ORIGIN` must match the beta URL because it is used to construct the OIDC callback.

The migration reuses the existing PostgreSQL schema, including `aceid_users`, `sessions`, `applications`, `aceid_clients`, and `aceid_subscriptions`.

## Local preview

```bash
npm install
npm run dev
```

Vite serves the client on port 5173 and proxies `/api` and `/auth` to the Fastify server on port 3000.

For a production-like local preview:

```bash
npm run build
npm start
```

## Beta deployment

Deploy `neo` as a separate Deplexo web app with:

- repository: `acetheticsx/AIDC`
- build root: `neo`
- framework: Dockerfile
- Dockerfile: `Dockerfile`
- port: `3000`

Deploy the exact commit SHA from the `neo` branch so the preview is pinned to a known revision. Keep production on `main`.

Use the same Ace ID client credentials and database credentials, but set `AIDC_PUBLIC_ORIGIN` to the beta app's public origin and register that callback URI in Ace ID before testing login.

Do not enable automatic deployment for the beta app until the branch is stable. Promote by deploying the exact reviewed Neo commit.

## Security

Neo does not create fake clients. Application creation requires the corresponding `public.aceid_clients` row owned by the authenticated Ace ID user, and rolls back the application if registration is missing.

Real credentials belong in Deplexo environment settings, never in Git.
