# Origin URL configuration

AIDC treats an Origin URL as application configuration, not as proof of domain ownership. Saving an Origin URL does not query DNS and does not require a TXT challenge or propagation delay.

## Accepted values

- The value must be a valid absolute URL with the `http` or `https` scheme.
- Only the origin is accepted. Paths other than `/`, query strings, and fragments are rejected.
- Embedded usernames and passwords are rejected.
- HTTP is restricted to localhost development hosts.
- HTTPS origins may use DNS hostnames or IP literals. AIDC does not resolve the hostname when saving the value.
- Values are normalized to `URL.origin` before storage.

## Security boundaries

Removing DNS verification does not weaken the separate redirect URI allowlist. Redirect URIs still need to be configured for the client and synchronized with Ace ID. Authentication remains protected by the existing session, OAuth/OIDC state, PKCE, origin, and request-validation controls.

Origin configuration is not a domain-ownership signal. Configure only origins you control and use HTTPS in production. Do not treat a successfully saved URL as evidence that the domain belongs to the application owner.

## Operational notes

There is no Origin URL DNS verification endpoint or Cloudflare TXT-record automation in AIDC. Older clients should stop calling the removed `/api/applications/:id/origin-verification` routes and use the application create/update endpoints to save Origin URLs.
