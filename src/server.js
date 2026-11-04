const express=require("express"),helmet=require("helmet"),cors=require("cors"),rateLimit=require("express-rate-limit"),mongoose=require("mongoose");
const cfg=require("./config"),{router,deliver}=require("./routes"),{Event}=require("./models");
const app=express();
app.disable("x-powered-by");
app.set("trust proxy",1); // Render's reverse proxy supplies the client IP.
app.use(helmet());
app.use(cors({origin:false}));
// Never rate-limit Paystack's webhook or health checks: dropped webhooks mean lost payments.
app.use(rateLimit({windowMs:60000,max:120,standardHeaders:true,legacyHeaders:false,skip:(req)=>req.path==="/webhooks/paystack"||req.path==="/health"}));
// Preserve exact bytes for Paystack HMAC before JSON parsing.
app.use(express.json({limit:"1mb",verify:(req,res,buf)=>{if(req.originalUrl==="/webhooks/paystack")req.rawBody=Buffer.from(buf);}}));
app.use(express.urlencoded({extended:false,limit:"100kb"}));app.use(router);
app.use((err,req,res,next)=>{console.error(err);res.status(err.status||500).json({error:process.env.NODE_ENV==="production"?"Request failed":err.message});});
async function main(){await mongoose.connect(cfg.mongoUri);await app.listen(cfg.port,()=>console.log(`FabricNow Pay listening on ${cfg.port}`));}
// periodic retry worker; bounded and retry schedule is stored on event.
async function retryLoop(){try{const now=new Date(),stale=new Date(Date.now()-120000);
  // failed events whose backoff is over, plus events stuck in "queued" (e.g. process restarted before first delivery)
  const rows=await Event.find({$or:[{status:"failed",nextAttemptAt:{$lte:now}},{status:"queued",updatedAt:{$lte:stale}}]}).limit(20);for(const e of rows)await deliver(e._id);}catch(e){console.error("retry worker",e.message);}}
setInterval(retryLoop,30000).unref();main().catch(e=>{console.error(e);process.exit(1);});
