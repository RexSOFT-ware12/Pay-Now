"use strict";
/**
 * Decides which application (style | qwesi) a Paystack event belongs to.
 * Pure functions, no database, so they are easy to test.
 *
 * Order used by the webhook:
 *   1. resolveApp()                -> explicit tag, plan code, or metadata "shape"
 *   2. database lookups (routes.js) -> Payment by reference, Subscription by code
 *   3. fallbackSubscriptionApp()   -> subscription/invoice events with no other clue
 */

function parseMeta(m) {
  if (!m) return {};
  if (typeof m === "string") {
    try { return JSON.parse(m) || {}; } catch { return {}; }
  }
  return typeof m === "object" ? m : {};
}

function planCodesOf(data) {
  const out = [
    data?.plan?.plan_code,
    typeof data?.plan === "string" ? data.plan : null,
    data?.plan_code,
    data?.subscription?.plan?.plan_code,
    data?.plan_object?.plan_code,
    parseMeta(data?.metadata).planCode,
  ];
  return out.filter((x) => typeof x === "string" && x);
}

// Fingerprints of what each app puts in metadata TODAY (before it is tagged).
// These only matter for transactions created before the apps were updated to send
// metadata.application. New transactions are routed by the explicit tag.
function looksLikeQwesi(m) {
  return (
    m.creditPurchase === true ||
    m.type === "admin_payment_link" ||
    m.platform === "whatsapp" ||
    m.platform === "facebook"
  );
}
function looksLikeStyle(m) {
  return (
    Boolean(m.orderId) ||
    ["premium", "api", "digital_order"].includes(m.product) ||
    m.type === "api_overage"
  );
}

/** @returns {{app: string|null, via: string|null}} */
function resolveApp(payload, apps) {
  const data = payload?.data || {};
  const meta = { ...parseMeta(data.transaction?.metadata), ...parseMeta(data.metadata) };

  // 1. explicit tag
  const tag = meta.application || meta.app;
  if (tag && apps[tag]) return { app: tag, via: "metadata.application" };

  // 2. Paystack plan code allowlists (renewals and subscription events carry no metadata)
  for (const code of planCodesOf(data)) {
    for (const [name, cfg] of Object.entries(apps)) {
      if ((cfg.planCodes || []).includes(code)) return { app: name, via: "planCode" };
    }
  }

  // 3. metadata shape
  const q = looksLikeQwesi(meta), s = looksLikeStyle(meta);
  if (q && !s && apps.qwesi) return { app: "qwesi", via: "metadata-shape" };
  if (s && !q && apps.style) return { app: "style", via: "metadata-shape" };

  return { app: null, via: null };
}

/**
 * Subscription / invoice events (e.g. invoice.payment_failed) often have no plan code
 * and no metadata. If exactly ONE app sells subscriptions, they must belong to it.
 */
function fallbackSubscriptionApp(eventName, apps) {
  if (!/^(subscription|invoice)\./.test(eventName || "")) return null;
  const withPlans = Object.entries(apps).filter(([, c]) => (c.planCodes || []).length > 0);
  return withPlans.length === 1 ? withPlans[0][0] : null;
}

module.exports = { resolveApp, fallbackSubscriptionApp, parseMeta };
