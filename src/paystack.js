const axios=require("axios");const cfg=require("./config");
const client=axios.create({baseURL:"https://api.paystack.co",timeout:20000,headers:{
 Authorization:`Bearer ${cfg.paystackSecret}`,"Content-Type":"application/json"}});
async function initialize({email,amount,planCode,reference,callbackUrl,metadata}) {
 const body={email,reference,callback_url:callbackUrl,metadata};
 if(planCode)body.plan=planCode;else body.amount=amount;
 const {data}=await client.post("/transaction/initialize",body);
 if(!data.status)throw new Error(data.message||"Paystack initialization failed");
 return data.data;
}
async function verify(reference){const {data}=await client.get(`/transaction/verify/${encodeURIComponent(reference)}`);return data.data;}
async function createPlan(payload){const {data}=await client.post("/plan",payload);return data.data;}
async function listPlans(){const {data}=await client.get("/plan");return data.data;}
async function cancelSubscription(code,token){const {data}=await client.post("/subscription/disable",{code,token});return data;}
async function manageLink(code){const {data}=await client.get(`/subscription/${encodeURIComponent(code)}/manage/link`);return data.data.link;}
module.exports={initialize,verify,createPlan,listPlans,cancelSubscription,manageLink};
