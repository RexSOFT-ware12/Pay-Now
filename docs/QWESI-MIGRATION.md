# Qwesi Hospital webhook coexistence

Qwesi currently exposes `/api/payment/webhook/paystack` and has its own charge-success handling. Keep it operational until the gateway target receiver is implemented and verified in staging.

- If Qwesi uses the same Paystack integration/secret as Style, move that integration's Dashboard webhook to FabricNow Pay and configure `QWESI_EVENT_URL` to a verified Qwesi receiver. Gateway forwarding must preserve all Qwesi events that its existing handler expects.
- If Qwesi has its own Paystack integration, it can retain its own webhook or use a separate gateway instance/integration config.
- Do not point one integration at the gateway and simultaneously expect Paystack to deliver to both old and new endpoints. Paystack config has one webhook URL per integration.
- Compare Qwesi's existing webhook cases, raw-body signature validation and credit/order updates with the new receiver before cutover.
