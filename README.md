# Fabric Now Pay — Central Paystack Gateway

Standalone Node.js service for Paystack transactions/subscriptions, webhook validation, app event delivery, retries, idempotency, reconciliation records and admin operations.

## Important design
- One Paystack webhook endpoint per **Paystack integration**: `POST /webhooks/paystack`.
- Paystack's callback is a browser redirect only; webhook/verification is authoritative.
- Apps are allowlisted (`style`, `qwesi`) and plan codes are allowlisted per app.
- Each received webhook is persisted with a SHA-256 idempotency key before async forwarding.
- App delivery is signed with HMAC-SHA256 in `X-Fabric-Pay-Signature`; target app must validate it.
- Failed deliveries are retried; admin can inspect/replay.
- Never put Paystack secret or gateway internal key in browser/mobile clients.

## Setup
```bash
cp .env.example .env
# Set Mongo URI, Paystack test secret, long random secrets and callback/target URLs.
npm install
npm run dev
```
Health: `GET /health`

### Configure Paystack
In Paystack Dashboard → Settings/Developers → Webhooks, set:
`https://payments.fabricnow.pro/webhooks/paystack`
Use test integration first. Set `PAYSTACK_SECRET_KEY=sk_test_...`; live deployment uses `sk_live_...`.
Signature uses exact raw request bytes and HMAC SHA-512 (`x-paystack-signature`).

### API
All internal app calls require `X-Fabric-Pay-Key: GATEWAY_INTERNAL_SECRET`.

- `POST /v1/checkout/subscription`
  `{ "app":"style", "userId":"...", "email":"...", "planCode":"PLN_...", "metadata":{"userId":"..."} }`
  Returns `{reference,authorizationUrl,accessCode,paymentId}`. Amount is determined by Paystack plan, not client.
- `POST /v1/checkout/transaction`
  `{app,userId,email,amount,currency,metadata}`; amount is minor units (pesewas).
- `GET /v1/subscriptions/:app/:userId`
- `POST /v1/subscriptions/:app/:subscriptionCode/manage-link`
- `GET /v1/callback/:app?reference=...` (verify then redirect to registered callback)
- Admin endpoints require `X-Admin-Key: ADMIN_API_KEY`:
  - `POST /v1/admin/plans` `{name,amount,interval,currency:"GHS"}`
  - `GET /v1/admin/plans`
  - `GET /v1/admin/events`
  - `POST /v1/admin/events/:eventId/replay`
  - `GET /v1/admin/metrics`

Plan intervals supported by Paystack include weekly/monthly/quarterly/annually etc. Recurring subscription checkout is card authorization based; Paystack documents Cards and Direct Debit (Nigeria), not Mobile Money recurring. Confirm the customer's payment method supports recurring before selling the plan as auto-renewing. See official docs: https://paystack.com/docs/payments/subscriptions/

## App integration
The gateway forwards `{event,payload,reference,source,eventId,application}` to each configured `*_EVENT_URL`, signed with its app secret. Implement a route in each backend that:
1. Reads raw request body.
2. Validates `X-Fabric-Pay-Signature` with HMAC SHA-256 and that backend's `*_EVENT_SECRET`.
3. Deduplicates `eventId`.
4. Handles only events relevant to that app.
5. For Style, activates/renews entitlement only for verified `charge.success` and subscription events; set expiry from invoice/plan dates.
6. Returns 2xx quickly, processing work in background/queue.

Qwesi Hospital's current Paystack webhook should **not be deleted until its existing payment behavior is migrated and test-verified**. If Qwesi and Style have separate Paystack integrations/secret keys, configure each integration's webhook independently (or run one gateway instance/key per integration). A single Paystack integration has one configured webhook URL, so this service must route every event that integration currently sends.

## Deploy to Render
1. Push this repository to GitHub and create a Render Blueprint from the repository. Render reads `render.yaml` and creates the `fabricnow-pay` web service.
2. Provide `MONGODB_URI` for a MongoDB deployment reachable by Render, `PAYSTACK_SECRET_KEY` for your Paystack test integration, and the callback URL, event URL, event secret, and plan codes for each app you use. `STYLE_EVENT_SECRET` and `QWESI_EVENT_SECRET` must match the corresponding backend secrets. Leave the unused app's values blank.
3. Render generates `GATEWAY_INTERNAL_SECRET` and `ADMIN_API_KEY`; copy them from the service's environment settings into the trusted clients/admin tools that need them. Keep all secrets out of source control.
4. After the service is live, set the Paystack webhook URL to `https://<your-render-service>.onrender.com/webhooks/paystack` (or your configured custom domain). Confirm `GET /health` responds before testing a Paystack test transaction.

The Blueprint uses Render's Starter plan so the webhook service remains available. Configure a custom domain in Render if you need a stable branded URL, then use that domain for the Paystack webhook and `PUBLIC_BASE_URL` if set.
