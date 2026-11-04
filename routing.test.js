const test = require("node:test"), assert = require("node:assert/strict");
const { resolveApp, fallbackSubscriptionApp } = require("./src/routing");

const apps = {
  style: { planCodes: ["PLN_prem", "PLN_starter", "PLN_growth"] },
  qwesi: { planCodes: [] },
};
const r = (data, event = "charge.success") => resolveApp({ event, data }, apps).app;

test("explicit metadata.application wins", () => {
  assert.equal(r({ metadata: { application: "style" } }), "style");
  assert.equal(r({ metadata: { app: "qwesi", product: "premium" } }), "qwesi");
});
test("unknown application tag is ignored, not trusted", () => {
  assert.equal(r({ metadata: { application: "evil" } }), null);
});
test("Qwesi credit purchase (today's metadata) -> qwesi", () => {
  assert.equal(r({ metadata: { userId: "u1", creditPurchase: true, credits: 100, platform: "whatsapp", channelId: "233" } }), "qwesi");
});
test("Qwesi dashboard payment link -> qwesi", () => {
  assert.equal(r({ metadata: { type: "admin_payment_link", source: "dashboard" } }), "qwesi");
});
test("Style digital order / premium / api (today's metadata) -> style", () => {
  assert.equal(r({ metadata: { orderId: "a".repeat(24), userId: "u", product: "digital_order" } }), "style");
  assert.equal(r({ metadata: { userId: "u", product: "premium", displayAmount: 29.99 } }), "style");
  assert.equal(r({ metadata: { userId: "u", product: "api", apiTier: "starter" } }), "style");
  assert.equal(r({ metadata: { type: "api_overage", overageType: "segmented" } }), "style");
});
test("subscription renewal with empty metadata is routed by plan code", () => {
  assert.equal(r({ metadata: {}, plan: { plan_code: "PLN_prem" } }), "style");
  assert.equal(r({ plan: { plan_code: "PLN_growth" } }, "subscription.create"), "style");
  assert.equal(r({ subscription: { plan: { plan_code: "PLN_starter" } } }, "invoice.update"), "style");
});
test("metadata may arrive as a JSON string", () => {
  assert.equal(r({ metadata: JSON.stringify({ creditPurchase: true }) }), "qwesi");
});
test("ambiguous or empty events stay unrouted", () => {
  assert.equal(r({ metadata: {} }), null);
  assert.equal(r({ metadata: { creditPurchase: true, product: "premium" } }), null);
  assert.equal(r({}), null);
});
test("invoice/subscription fallback only when a single app sells subscriptions", () => {
  assert.equal(fallbackSubscriptionApp("invoice.payment_failed", apps), "style");
  assert.equal(fallbackSubscriptionApp("charge.success", apps), null);
  assert.equal(fallbackSubscriptionApp("invoice.payment_failed", { a: { planCodes: ["x"] }, b: { planCodes: ["y"] } }), null);
});
