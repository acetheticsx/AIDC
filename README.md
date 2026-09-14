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

## The Ace Base

Is Where Better Begins...
