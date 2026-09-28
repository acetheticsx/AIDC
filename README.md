## AIDC

`Ace Identity Developer Console`

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

- Technology

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

- Set `AIDC_TRUST_PROXY_HOPS` to the exact number of trusted reverse-proxy hops when the server is behind a proxy. Leave it at `0` when the server is directly exposed.
- Set `DATABASE_SSL_CA` when the PostgreSQL provider requires a custom CA certificate.
- Use an HTTPS `AIDC_PUBLIC_ORIGIN` in production so secure cookies and HSTS are enabled.
- Do not set `AIDC_TRUST_PROXY_HOPS` to a guessed value. Express uses trusted proxy configuration to derive client IP information, which the rate limiter relies on.

## The Ace Base

Is Where Better Begins...


## Origin URL domain verification

HTTPS Origin URLs require DNS control verification before a web application can be enabled.

AIDC generates a TXT challenge scoped to the application and exact Origin URL:

1. Save the HTTPS Origin URL.
2. Open the Origin URL settings and copy the displayed TXT record.
3. Create the TXT record at the displayed `_aceid-challenge.<host>` name.
4. Wait for DNS propagation, then choose **Verify TXT record**.
5. Keep the TXT record in DNS while the Origin URL is in use. AIDC treats the record as a persistent authorization signal and labels `expiry=never`.

Localhost HTTP origins do not require DNS verification. HTTPS IP-address origins are rejected because they cannot provide the requested domain-control proof.

The verification uses DNS TXT resolution and a keyed application-specific token; the raw token is never stored in the application database.
