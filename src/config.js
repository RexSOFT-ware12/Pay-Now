require("dotenv").config();
const list = (v) => (v || "").split(",").map(x=>x.trim()).filter(Boolean);
const apps = {
  style: { callback: process.env.STYLE_CALLBACK_URL, eventUrl: process.env.STYLE_EVENT_URL,
    eventSecret: process.env.STYLE_EVENT_SECRET, planCodes: list(process.env.STYLE_PLAN_CODES) },
  qwesi: { callback: process.env.QWESI_CALLBACK_URL, eventUrl: process.env.QWESI_EVENT_URL,
    eventSecret: process.env.QWESI_EVENT_SECRET, planCodes: list(process.env.QWESI_PLAN_CODES) }
};
module.exports={port:Number(process.env.PORT||8088),publicBaseUrl:process.env.PUBLIC_BASE_URL,
 mongoUri:process.env.MONGODB_URI,paystackSecret:process.env.PAYSTACK_SECRET_KEY,
 webhookSecret:process.env.PAYSTACK_WEBHOOK_SECRET||process.env.PAYSTACK_SECRET_KEY,
 internalSecret:process.env.GATEWAY_INTERNAL_SECRET,adminKey:process.env.ADMIN_API_KEY,
 apps};
