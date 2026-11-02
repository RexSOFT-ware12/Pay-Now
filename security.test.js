const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("crypto");
const {paystackSignature,verifyPaystack,signForward}=require("./src/security");
test("Paystack signature is verified against exact bytes",()=>{const b=Buffer.from('{"event":"charge.success"}'),s="secret",sig=paystackSignature(b,s);assert.equal(verifyPaystack(b,sig,s),true);assert.equal(verifyPaystack(Buffer.from("{}"),sig,s),false);});
test("forward HMAC is deterministic",()=>{const b=Buffer.from("abc");assert.equal(signForward(b,"key"),crypto.createHmac("sha256","key").update(b).digest("hex"));});
