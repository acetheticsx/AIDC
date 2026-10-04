# Ace Base subscriptions

Ace Base has three subscription tiers:

| Tier | Price | Applications | Monthly active users |
|---|---:|---:|---:|
| **Origin** | Free | 8 | 5,000 |
| **Core** | ₹299/month | 15 | 20,000 |
| **Apex** | ₹549/month | 25 | 50,000 |

Core and Apex are launch-target prices. Keep plan IDs stable even if the displayed price changes.

## What every tier includes

The basic identity stack should not be paywalled:

- OAuth 2.0 / OIDC
- Authorization Code + PKCE
- MFA
- Passkeys
- Session management
- Account recovery
- Developer Console
- API access
- Custom domain
- Custom database connection

Paid tiers should primarily add capacity and advanced operational features.

## Recommended billing architecture

AIDC currently has no billing implementation. Add subscriptions as a server-side entitlement system rather than putting payment logic in the browser.

Customer
  |
  v
Ace Base billing UI
  |
  +-- checkout / subscription creation
  v
Payment provider
  |
  +-- webhook events
        |
        v
   AIDC billing service
        |
        v
   subscription record
        |
        v
   entitlement checks
        |
        +-- application limit
        +-- MAU limit
        +-- paid features

Razorpay is a suitable India-first payment provider because its subscription product supports recurring billing and webhook-driven subscription lifecycle events. Keep the provider behind a small billing adapter so another provider can be added later without rewriting entitlement logic.

## Database model

Add a subscription table to the Ace Base production database. A practical starting shape is:

    CREATE TABLE subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES aceid_users(id),
      plan_id text NOT NULL CHECK (plan_id IN ('origin', 'core', 'apex')),
      status text NOT NULL CHECK (
        status IN ('active', 'trialing', 'past_due', 'cancelled', 'expired')
      ),
      provider text,
      provider_customer_id text,
      provider_subscription_id text,
      current_period_start timestamptz,
      current_period_end timestamptz,
      cancel_at_period_end boolean NOT NULL DEFAULT false,
      source text NOT NULL DEFAULT 'payment',
      granted_by uuid REFERENCES aceid_users(id),
      grant_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX subscriptions_provider_subscription_idx
      ON subscriptions(provider, provider_subscription_id)
      WHERE provider_subscription_id IS NOT NULL;

For production, add an immutable billing-event table for webhook idempotency and an audit table for administrator actions.

Do not store card numbers, CVVs, UPI credentials, or payment secrets in Ace Base.

## Entitlement checks

Do not scatter price/limit checks throughout the UI.

Keep plan configuration in one server-side map:

    const PLANS = {
      origin: { applications: 8, mau: 5000 },
      core:   { applications: 15, mau: 20000 },
      apex:   { applications: 25, mau: 50000 }
    };

Resolve the effective subscription on the server and expose only the resulting entitlements to the console.

The UI may hide or explain unavailable actions, but the API must enforce the limits. A user should never be able to bypass a plan restriction by calling an endpoint directly.

## Adding a paid subscription

1. User selects Core or Apex.
2. AIDC creates a checkout/subscription with the payment provider.
3. The provider completes the first payment and activates the recurring subscription.
4. The provider sends a signed webhook to AIDC.
5. AIDC verifies the webhook signature.
6. AIDC upserts the subscription using the provider subscription ID.
7. Entitlements are calculated from the stored plan ID.
8. The console refreshes and shows the new plan.

Webhook processing must be idempotent. Store each provider event ID and ignore an event that has already been processed.

For cancellation, retain the subscription record and mark it appropriately rather than deleting it. Preserve the period end so access can remain valid until the paid period finishes when the provider's cancellation policy requires that behavior.

## Giving a subscription to anyone

AIDC should support an administrator-only **Grant subscription** action.

The administrator selects:

- target Ace Base account
- plan: Core or Apex
- start date
- optional expiration date
- optional internal reason

The server must verify that the caller has the required administrator permission before creating the grant.

A manual grant should create or update the subscription with:

    source = "admin_grant"
    granted_by = <admin account>
    provider = NULL
    provider_subscription_id = NULL
    grant_expires_at = <optional date>

Manual grants do not require a payment provider subscription.

Every grant, extension, downgrade, revocation, and expiration should create an audit event containing:

- administrator
- target account
- previous plan
- new plan
- action
- timestamp
- reason
- expiration, when applicable

Never implement an admin grant by editing a user's plan directly in the browser or by trusting a client-supplied plan_id.

## Recommended admin API

A minimal internal API could be:

    POST   /api/admin/subscriptions/grant
    POST   /api/admin/subscriptions/revoke
    POST   /api/admin/subscriptions/extend
    GET    /api/admin/subscriptions/:userId

Example grant payload:

    {
      "userId": "USER_ID",
      "planId": "core",
      "expiresAt": "2027-01-01T00:00:00Z",
      "reason": "Launch partner"
    }

The API should derive the administrator identity from the authenticated session rather than accepting it from the request body.

## Payment provider integration

Keep provider-specific code isolated:

    server/
    ├── billing/
    │   ├── plans.js
    │   ├── entitlements.js
    │   ├── subscriptions.js
    │   ├── admin-grants.js
    │   └── providers/
    │       └── razorpay.js

The Razorpay adapter should handle:

- customer creation/lookup
- plan/subscription creation
- signature verification
- webhook normalization
- cancellation
- provider status mapping

The rest of AIDC should consume normalized subscription events and entitlements instead of Razorpay-specific fields.

## Launch checklist

Before enabling paid subscriptions:

- [ ] Create stable origin, core, and apex plan IDs.
- [ ] Add subscription and billing-event tables to Neon.
- [ ] Add server-side entitlement checks.
- [ ] Add Razorpay production credentials as deployment secrets.
- [ ] Configure a signed webhook endpoint.
- [ ] Make webhook processing idempotent.
- [ ] Add checkout and subscription-management UI.
- [ ] Add administrator grant/revoke controls.
- [ ] Add audit logging for manual grants.
- [ ] Test payment success, renewal, cancellation, failed payment, webhook replay, and expired grant.
- [ ] Test limits through direct API calls, not only the UI.
- [ ] Keep Origin usable without a payment method.

## Important

The public pricing page can advertise Core and Apex before billing is enabled, but the application should not present a successful payment state until the server has received and verified the provider confirmation.

For an administrator-granted subscription, no payment provider confirmation is required because the grant itself is the authorization.
