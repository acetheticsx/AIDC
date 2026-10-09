## AIDC

Ace Identity Developer Console

*AIDC is the developer-facing console for Ace Base Identity, providing a clean interface for managing identity applications, OAuth/OIDC configuration, credentials, redirects, scopes, and related developer settings.*

The console is designed to remain lightweight, accessible, and easy to deploy using standard web technologies.

## Status

🚧 In development

The public repository contains the console frontend and its supporting public resources. The underlying Ace Identity application and private services are maintained separately.

## Features

- Application management
- OAuth / OIDC configuration
- Client credentials management
- Redirect URI configuration
- Scope management
- Application branding
- Activity and authentication logs
- Developer settings
- Responsive interface
- Lightweight browser-native architecture

## Ace Base plans

Ace Base uses three subscription tiers:

| | **Base** | **Core** | **Apex** |
|---|---:|---:|---:|
| Price | **Free** | **₹299/month** | **₹549/month** |
| Applications | **8** | **15** | **25** |
| Monthly active users | **5,000** | **20,000** | **50,000** |

**Core and Apex pricing are launch targets and may change before public billing is enabled.**

Subscriptions, billing, entitlements, offers, and subscriber accessories belong to **Ace ID**, not AIDC. AIDC consumes Ace ID entitlements for authenticated users.

Only the **Ace ID owner** can manually grant, revoke, extend, or change paid subscriptions. There is no general administrator subscription-grant permission.

Offers and subscriber accessories can apply **across TAB**, with eligibility, redemption, expiry, and usage enforced server-side by Ace ID.

See docs/subscriptions.md for the complete subscription architecture and implementation guidance.


## Technology

- HTML
- CSS
- JavaScript
- Lit
- Open Props

No build system is required for the frontend.

## Repository Structure

AIDC/<br>
├── index.html <br>
├── app.js <br>
├── components/ <br>
├── docs/ <br>
└── assets/ <br>

## Development

AIDC is designed to run directly in a modern browser or through a simple static HTTP server.

There is intentionally no framework build pipeline required for the frontend.

## Security

The public repository does not contain private Ace Identity infrastructure, production credentials, secrets, or sensitive configuration.

**Never commit:**

- API keys
- OAuth client secrets
- private keys
- access tokens
- production credentials
- environment-specific secrets

## Server deployment hardening

The server supports explicit reverse-proxy and PostgreSQL TLS configuration.

- Set AIDC_TRUST_PROXY_HOPS to the exact number of trusted reverse-proxy hops when the server is behind a proxy. Leave it at 0 when the server is directly exposed.
- Set DATABASE_SSL_CA when the PostgreSQL provider requires a custom CA certificate.
- Use an HTTPS AIDC_PUBLIC_ORIGIN in production so secure cookies and HSTS are enabled.
- Do not set AIDC_TRUST_PROXY_HOPS to a guessed value. Express uses trusted proxy configuration to derive client IP information, which the rate limiter relies on.

## The Ace Base

Is Where Better Begins...

## Origin URL configuration

Origin URLs are validated as URL values; AIDC does not perform DNS TXT ownership checks or require DNS propagation. Save the origin directly in application settings.

- Use an origin only, such as `https://example.com`, with no path, query, or fragment.
- Only `http` and `https` schemes are accepted. Plain HTTP is limited to localhost development addresses.
- URLs containing username/password credentials are rejected.
- HTTPS origins may use DNS hostnames or IP addresses. AIDC does not resolve the hostname during save.
- Redirect URIs remain a separate allowlist and must be registered exactly with Ace ID. Removing DNS verification does not bypass redirect URI checks, session authentication, or origin/CSRF protections.

Origin URL configuration is not proof of domain ownership. Only configure origins you control, and use HTTPS in production.

See [Origin URL configuration details](docs/origin-url.md) for the validation rules and security boundaries.
