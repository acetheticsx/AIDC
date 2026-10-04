# Ace Base subscriptions

Ace Base subscription ownership belongs to **Ace ID**, not AIDC.

Ace ID is the system of record for subscription status, billing, entitlements, promotional offers, subscriber accessories, owner-only manual grants, and subscription audit history. AIDC consumes Ace ID entitlements for authenticated users and does not maintain an independent subscription or billing system.

## Plans

| Tier | Price | Applications | Monthly active users |
|---|---:|---:|---:|
| **Origin** | Free | 8 | 5,000 |
| **Core** | ₹299/month | 15 | 20,000 |
| **Apex** | ₹549/month | 25 | 50,000 |

Core and Apex are launch-target prices. Keep stable plan IDs even if displayed pricing changes.

## Architecture

Ace ID owns subscriptions, billing, entitlements, offers, and accessories. AIDC and other TAB services consume the resulting entitlements.

User -> Ace ID -> subscription/billing/entitlements -> AIDC + TAB

A payment provider such as Razorpay handles recurring payment collection and provider webhooks. It does not become the application source of truth for product access.

## Paid subscription flow

1. User selects Core or Apex.
2. Ace ID creates the provider checkout/subscription.
3. Provider completes the first payment.
4. Provider sends a signed webhook to Ace ID.
5. Ace ID verifies and idempotently processes the event.
6. Ace ID updates the subscription and calculates effective entitlements.
7. AIDC/TAB consume the updated entitlements.

## Owner-only grants

Only the designated **Ace ID owner** can manually grant, revoke, extend, or change a paid subscription. There is no general admin permission for giving paid subscriptions.

The server must derive the owner identity from the authenticated Ace ID session and verify it against the configured owner identity. Never trust an owner, admin, role, or user ID supplied by the browser.

Owner grants do not require a payment-provider transaction and must be audited. A grant should record source = owner_grant, the owner identity, target user, plan, and optional expiry.

Recommended internal routes:

POST /api/owner/subscriptions/grant
POST /api/owner/subscriptions/revoke
POST /api/owner/subscriptions/extend
GET  /api/owner/subscriptions/:userId

## Offers and subscriber accessories

Offers and subscriber accessories are managed by Ace ID and can be attached to eligible subscriptions.

They apply **across TAB**, rather than being restricted to a single AIDC screen or workflow. Eligibility, redemption, availability, expiry, and usage limits are server-controlled so the same benefit is recognized consistently across the Ace Base ecosystem.

## AIDC responsibility

AIDC must not implement independent billing or subscription ownership. It should consume trusted Ace ID entitlements and enforce only the product limits exposed by those entitlements.

## Security

- Subscription state is server-authoritative.
- Payment webhook signatures are verified before processing.
- Webhook event IDs are idempotent.
- Owner-only actions require server-side owner verification.
- Provider secrets remain deployment secrets.
- AIDC must not accept a client assertion that the user has paid.
- Every owner grant, revoke, extension, and plan change is audited.

## Launch checklist

- [ ] Implement subscription storage in Ace ID.
- [ ] Create stable Origin, Core, and Apex plan IDs.
- [ ] Implement server-side entitlement resolution in Ace ID.
- [ ] Integrate Razorpay behind the Ace ID billing adapter.
- [ ] Configure signed webhook processing.
- [ ] Make webhook processing idempotent.
- [ ] Add owner-only grant/revoke/extend controls.
- [ ] Add owner audit logging.
- [ ] Add offers and subscriber accessories to Ace ID.
- [ ] Make offers/accessories available across TAB through Ace ID entitlements.
- [ ] Update AIDC to consume Ace ID entitlements rather than billing locally.
- [ ] Test payment success, renewal, cancellation, failed payment, webhook replay, owner grant, owner revoke, and grant expiry.

