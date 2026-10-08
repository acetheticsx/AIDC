# AIDC Neo

A parallel migration workspace for the AIDC console.

## Target stack

- React + TypeScript
- Vite
- Fastify
- Zod
- Drizzle ORM
- PostgreSQL / Neon
- Vitest
- Playwright

## Migration rules

1. main remains the production source of truth during migration.
2. Ace ID/OIDC remains the identity provider.
3. The existing PostgreSQL schema is preserved initially.
4. Existing API behavior is treated as the compatibility contract.
5. Features migrate in vertical slices, not as a single rewrite.
6. Security behavior must be preserved or strengthened.
7. Every migrated slice gets browser and regression coverage before legacy code is retired.

## Planned order

1. Foundation and build tooling
2. API contract and typed client
3. Authentication/session adapter
4. Applications
5. Branding
6. Redirects, scopes, credentials
7. Entitlements and quota
8. Activity/authentication logs
9. Settings/integrations
10. Production cutover and legacy removal
