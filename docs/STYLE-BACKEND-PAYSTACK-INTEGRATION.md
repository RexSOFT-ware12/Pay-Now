# Style Backend (Fabric Now) migration: Stripe → Paystack

This gateway is ready as a separate service, but **the attached Style backend's Stripe billing routes are not safely removable by deleting a package alone**: `src/routes/billing.js` currently implements consumer Premium checkout, API tier checkout, Stripe customer portal, and Stripe metered overage (`src/lib/stripeMeters.js`). The API overage code also reports usage through Stripe. This migration must replace those behaviors with Paystack billing/credits or disable the corresponding feature explicitly.

## Recommended safe rollout
1. Back up Style backend and production database.
2. Deploy FabricNow Pay in Paystack test mode.
3. Add a Style webhook receiver at `POST /api/payments/paystack-events` (validate gateway HMAC; persist/dedupe event ID).
4. Change Style's Premium checkout route to call gateway `POST /v1/checkout/subscription` with `app=style`, authenticated user ID/email and a server-configured Paystack `planCode`. Never accept plan amount or Paystack plan code freely from client.
5. Callback page reads `reference` and calls gateway verify; it does not grant Premium.
6. Event receiver grants/renews premium only on validated `charge.success` / subscription invoice events and sets subscription status/period end. Failed invoice → past_due; disable → cancelled.
7. Replace Stripe customer portal with Paystack subscription manage link endpoint, or a local cancel/manage page.
8. Decide separately how to bill API tiers/overages: Paystack supports one-off charge/checkout and recurring plans, but does not replicate Stripe metered billing automatically. Recommended: included usage quotas + prepaid credit packs or fixed monthly API plans. Remove `stripeMeters.js` only after API overage accounting has been replaced.
9. Test existing users and migrate entitlement records; don't delete Stripe IDs/records until export and migration decisions are made.
10. Remove Stripe dependency and `STRIPE_*` environment values only after all Stripe imports/routes/meter paths are removed and tests pass.

## Gateway event verification snippet (Style backend)
```js
const crypto = require("crypto");
function verifyFabricPay(raw, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a=Buffer.from(expected), b=Buffer.from(signature||"");
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
app.post("/api/payments/paystack-events", express.raw({type:"application/json"}), async (req,res)=>{
  if(!verifyFabricPay(req.body,req.get("X-Fabric-Pay-Signature"),process.env.FABRIC_PAY_EVENT_SECRET))
    return res.sendStatus(401);
  const event=JSON.parse(req.body.toString("utf8"));
  // persist event.eventId uniquely, then enqueue; acknowledge quickly.
  res.sendStatus(200);
});
```
Ensure this route is mounted before `express.json()`, or use the project's raw-body capture middleware.
