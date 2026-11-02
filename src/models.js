const mongoose=require("mongoose");
const PaymentSchema=new mongoose.Schema({
 reference:{type:String,unique:true,index:true},app:{type:String,index:true},userId:String,email:String,
 planCode:String,amount:Number,currency:String,status:{type:String,default:"initialized"},
 paystackCustomerCode:String,subscriptionCode:String,authorizationCode:String,
 checkoutUrl:String,metadata:mongoose.Schema.Types.Mixed,paidAt:Date,lastEvent:String
},{timestamps:true});
const EventSchema=new mongoose.Schema({
 eventId:{type:String,unique:true,sparse:true,index:true},event:String,reference:String,app:String,
 payload:mongoose.Schema.Types.Mixed,status:{type:String,default:"queued"},
 attempts:{type:Number,default:0},lastError:String,nextAttemptAt:Date,deliveredAt:Date
},{timestamps:true});
const SubscriptionSchema=new mongoose.Schema({
 app:{type:String,index:true},userId:String,email:String,customerCode:String,subscriptionCode:{type:String,index:true},
 planCode:String,status:{type:String,default:"active"},nextPaymentDate:Date,authorizationCode:String,
 lastPaidAt:Date,lastInvoiceStatus:String,cancelAtPeriodEnd:Boolean
},{timestamps:true});
module.exports={Payment:mongoose.model("Payment",PaymentSchema),Event:mongoose.model("PaystackEvent",EventSchema),
 Subscription:mongoose.model("GatewaySubscription",SubscriptionSchema)};
