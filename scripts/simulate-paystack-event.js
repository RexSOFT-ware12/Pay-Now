#!/usr/bin/env node
/**
 * Dry-run the whole chain WITHOUT touching the Paystack dashboard:
 *   this script --(signed like Paystack)--> gateway --(signed like gateway)--> app receiver
 *
 * Usage:
 *   PAYSTACK_SECRET_KEY=sk_live_... node scripts/simulate-paystack-event.js https://<pay-now-host> qwesi
 *   PAYSTACK_SECRET_KEY=sk_live_... node scripts/simulate-paystack-event.js https://<pay-now-host> style
 *
 * The events are harmless by design (they reference things that do not exist):
 *   qwesi -> a dashboard "payment link" that does not exist  => no credits are added to anyone
 *   style -> an order reference that does not exist          => no order/subscription changes
 * A healthy run prints 200 from the gateway; then check GET /v1/admin/metrics and /v1/admin/events
 * (X-Admin-Key) - the event must NOT be listed as failed/unrouted - and the app log must show it.
 */
const crypto = require("crypto");
const [base, app] = process.argv.slice(2);
const secret = process.env.PAYSTACK_SECRET_KEY;
if (!base || !["qwesi", "style"].includes(app) || !secret) {
  console.error("usage: PAYSTACK_SECRET_KEY=sk_... node scripts/simulate-paystack-event.js <gateway-base-url> <qwesi|style>");
  process.exit(1);
}
const ref = `SIMTEST_${app}_${Date.now()}`;
const metadata = app === "qwesi"
  ? { application: "qwesi", type: "admin_payment_link", source: "simulation" }
  : { application: "style", product: "digital_order", orderId: "0".repeat(24), userId: "simulation" };
const body = Buffer.from(JSON.stringify({
  event: "charge.success",
  data: { id: Date.now(), reference: ref, status: "success", amount: 100, currency: "GHS", metadata, customer: { email: "simulation@example.invalid" } },
}));
const signature = crypto.createHmac("sha512", secret).update(body).digest("hex");

fetch(`${base.replace(/\/$/, "")}/webhooks/paystack`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
  body,
}).then(async (r) => {
  console.log(`gateway answered ${r.status}:`, await r.text());
  console.log(`reference used: ${ref}`);
  console.log("Now check the gateway admin events/metrics and the app logs for this reference.");
}).catch((e) => { console.error("request failed:", e.message); process.exit(1); });
