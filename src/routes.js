const express=require("express"),crypto=require("crypto"),axios=require("axios");
const cfg=require("./config"),{Payment,Event,Subscription}=require("./models"),paystack=require("./paystack");
const {safeEqual,verifyPaystack,signForward}=require("./security");
const router=express.Router();
function internal(req,res,next){if(!safeEqual(req.get("x-fabric-pay-key"),cfg.internalSecret))return res.status(401).json({error:"Unauthorized"});next();}
function admin(req,res,next){if(!safeEqual(req.get("x-admin-key"),cfg.adminKey))return res.status(401).json({error:"Unauthorized"});next();}
function appConfig(app){const a=cfg.apps[app];if(!a||!a.callback||!a.eventUrl||!a.eventSecret)throw Object.assign(new Error("Application not configured"),{status:400});return a;}
router.get("/health",(_,res)=>res.json({ok:true,service:"fabricnow-pay",time:new Date().toISOString()}));
// Initiate Paystack plan checkout. App and plan are allowlisted server-side.
router.post("/v1/checkout/subscription",internal,async(req,res,next)=>{
 try{
  const {app,userId,email,planCode,amount,currency="GHS",returnUrl,metadata={}}=req.body||{};
  const a=appConfig(app);
  if(!userId||!email||!planCode)return res.status(400).json({error:"app, userId, email and planCode are required"});
  if(!a.planCodes.includes(planCode))return res.status(400).json({error:"Plan code is not allowlisted for this application"});
  if(returnUrl && returnUrl!==a.callback)return res.status(400).json({error:"returnUrl must match the registered application callback"});
  const reference=`FNP_${app.toUpperCase()}_${crypto.randomUUID().replace(/-/g,"")}`;
  const planPayment=await paystack.initialize({email,planCode,reference,callbackUrl:a.callback,metadata:{application:app,userId,planCode,kind:"subscription",...metadata}});
  const doc=await Payment.create({reference,app,userId,email,planCode,amount:amount||0,currency,status:"initialized",checkoutUrl:planPayment.authorization_url,metadata});
  res.status(201).json({reference,authorizationUrl:planPayment.authorization_url,accessCode:planPayment.access_code,paymentId:doc.id});
 }catch(e){next(e);}
});
// Optional one-off transaction checkout.
router.post("/v1/checkout/transaction",internal,async(req,res,next)=>{
 try{const {app,userId,email,amount,currency="GHS",metadata={},returnUrl}=req.body||{};const a=appConfig(app);
 if(!userId||!email||!Number.isInteger(Number(amount))||Number(amount)<=0)return res.status(400).json({error:"userId,email and amount (minor currency units) required"});
 if(returnUrl&&returnUrl!==a.callback)return res.status(400).json({error:"returnUrl must match registered callback"});
 const reference=`FNP_${app.toUpperCase()}_${crypto.randomUUID().replace(/-/g,"")}`;
 const data=await paystack.initialize({email,amount:Number(amount),reference,callbackUrl:a.callback,metadata:{application:app,userId,kind:"oneoff",...metadata}});
 await Payment.create({reference,app,userId,email,amount:Number(amount),currency,status:"initialized",checkoutUrl:data.authorization_url,metadata});
 res.status(201).json({reference,authorizationUrl:data.authorization_url,accessCode:data.access_code});
 }catch(e){next(e);}
});
// Callback is an app-specific return destination; verify transaction server-side.
router.get("/v1/callback/:app",async(req,res,next)=>{
 try{const a=appConfig(req.params.app),ref=req.query.reference;if(!ref)return res.status(400).send("Missing reference");
 const verified=await paystack.verify(ref);if(verified.status!=="success")return res.status(402).send("Payment not successful");
 const p=await Payment.findOne({reference:ref,app:req.params.app});if(!p)return res.status(404).send("Unknown payment");
 // callback only displays/redirects; webhook is authoritative for entitlements.
 res.redirect(`${a.callback}?reference=${encodeURIComponent(ref)}&status=verified`);
 }catch(e){next(e);}
});
// Paystack webhook. Must be mounted with raw body before express.json.
router.post("/webhooks/paystack",async(req,res,next)=>{
 try{
  const raw=req.rawBody;if(!raw)return res.status(400).send("Raw body required");
  if(!verifyPaystack(raw,req.get("x-paystack-signature"),cfg.webhookSecret))return res.status(401).send("Invalid signature");
  const payload=req.body||{},event=payload.event||"unknown",data=payload.data||{};
  const ref=data.reference||data.transaction?.reference||null;
  const metadata=data.metadata||data.transaction?.metadata||{};
  let app=metadata.application||metadata.app||null;
  if(!app&&ref){const p=await Payment.findOne({reference:ref});app=p?.app||null;}
  if(!app&&data.subscription_code){const s=await Subscription.findOne({subscriptionCode:data.subscription_code});app=s?.app||null;}
  if(!app&&data.subscription?.subscription_code){const s=await Subscription.findOne({subscriptionCode:data.subscription.subscription_code});app=s?.app||null;}
  // Store every event even if app cannot be identified (operations can replay after mapping).
  const eventId=crypto.createHash("sha256").update(raw).digest("hex");
  const saved=await Event.findOneAndUpdate({eventId},{$setOnInsert:{eventId,event,reference:ref,app,payload,status:app?"queued":"unrouted"}},{upsert:true,new:true});
  res.status(200).json({received:true,eventId:saved.eventId});
  if(app&&saved.status==="queued")setImmediate(()=>deliver(saved._id).catch(console.error));
 }catch(e){next(e);}
});
async function deliver(id){
 const ev=await Event.findById(id);if(!ev||ev.status==="delivered")return;
 const a=cfg.apps[ev.app];if(!a?.eventUrl||!a.eventSecret){ev.status="unrouted";ev.lastError="No target configured";await ev.save();return;}
 const body=Buffer.from(JSON.stringify({event:ev.event,payload:ev.payload,reference:ev.reference,source:"paystack",eventId:ev.eventId,application:ev.app}));
 try{await axios.post(a.eventUrl,body,{timeout:15000,headers:{"Content-Type":"application/json","X-Fabric-Pay-Signature":signForward(body,a.eventSecret),"X-Fabric-Pay-Event-Id":ev.eventId}});
 ev.status="delivered";ev.deliveredAt=new Date();ev.attempts+=1;ev.lastError="";await ev.save();await applySubscriptionEvent(ev);
 }catch(e){ev.attempts+=1;ev.status="failed";ev.lastError=e.response?.data?JSON.stringify(e.response.data):e.message;ev.nextAttemptAt=new Date(Date.now()+Math.min(3600000,30000*2**Math.min(ev.attempts,6)));await ev.save();}
}
async function applySubscriptionEvent(ev){
 const d=ev.payload?.data||{},meta=d.metadata||{},app=ev.app;
 const customer=d.customer?.customer_code||d.customer_code||d.customer||null;
 const email=d.customer?.email||d.email||d.customer_email||meta.email;
 const plan=d.plan?.plan_code||d.plan_code||d.plan||meta.planCode;
 const code=d.subscription_code||d.subscription?.subscription_code||d.subscription_code;
 if(["subscription.create","subscription.enable"].includes(ev.event)){
  await Subscription.findOneAndUpdate({app,subscriptionCode:code||`${customer}:${plan}`},{$set:{app,userId:meta.userId,email,customerCode:customer,subscriptionCode:code,planCode:plan,status:"active",authorizationCode:d.authorization?.authorization_code||d.authorization_code}}, {upsert:true});
 }
 if(ev.event==="subscription.disable"&&code)await Subscription.updateOne({app,subscriptionCode:code},{$set:{status:"cancelled"}});
 if(ev.event==="invoice.payment_failed"&&code)await Subscription.updateOne({app,subscriptionCode:code},{$set:{status:"past_due",lastInvoiceStatus:"failed"}});
 if(ev.event==="invoice.update"&&code)await Subscription.updateOne({app,subscriptionCode:code},{$set:{lastInvoiceStatus:d.status||"updated",nextPaymentDate:d.subscription?.next_payment_date?new Date(d.subscription.next_payment_date):undefined}});
 if(ev.event==="charge.success"&&ev.reference){await Payment.updateOne({reference:ev.reference},{$set:{status:"success",paidAt:new Date(),lastEvent:ev.event,subscriptionCode:code||undefined}});}
}
// Admin controls: inspect, replay failed/unrouted events, create Paystack plans.
router.get("/v1/admin/events",admin,async(req,res,next)=>{try{const rows=await Event.find({status:{$in:["failed","unrouted"]}}).sort({createdAt:-1}).limit(100);res.json(rows);}catch(e){next(e);}});
router.post("/v1/admin/events/:id/replay",admin,async(req,res,next)=>{try{const ev=await Event.findById(req.params.id);if(!ev)return res.status(404).json({error:"Not found"});ev.status="queued";await ev.save();await deliver(ev.id);res.json({ok:true,status:(await Event.findById(ev.id)).status});}catch(e){next(e);}});
router.post("/v1/admin/plans",admin,async(req,res,next)=>{try{const {name,amount,interval,currency="GHS",description}=req.body;if(!name||!Number.isInteger(Number(amount))||Number(amount)<=0||!interval)return res.status(400).json({error:"name, amount in pesewas, interval required"});res.status(201).json(await paystack.createPlan({name,amount:Number(amount),interval,currency,description}));}catch(e){next(e);}});
router.get("/v1/admin/plans",admin,async(req,res,next)=>{try{res.json(await paystack.listPlans());}catch(e){next(e);}});
router.get("/v1/subscriptions/:app/:userId",internal,async(req,res,next)=>{try{res.json(await Subscription.find({app:req.params.app,userId:req.params.userId}).sort({createdAt:-1}));}catch(e){next(e);}});
router.post("/v1/subscriptions/:app/:code/manage-link",internal,async(req,res,next)=>{try{const s=await Subscription.findOne({app:req.params.app,subscriptionCode:req.params.code});if(!s)return res.status(404).json({error:"Subscription not found"});res.json({url:await paystack.manageLink(req.params.code)});}catch(e){next(e);}});
router.get("/v1/admin/metrics",admin,async(req,res,next)=>{try{const [payments,events,subs]=await Promise.all([Payment.countDocuments(),Event.countDocuments(),Subscription.countDocuments()]);res.json({payments,events,subscriptions:subs,failedEvents:await Event.countDocuments({status:"failed"}),unroutedEvents:await Event.countDocuments({status:"unrouted"})});}catch(e){next(e);}});
module.exports={router,deliver};
