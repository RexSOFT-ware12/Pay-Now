const crypto=require("crypto");
function safeEqual(a,b){if(!a||!b)return false;const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function paystackSignature(raw,secret){return crypto.createHmac("sha512",secret).update(raw).digest("hex");}
function verifyPaystack(raw,signature,secret){return safeEqual(paystackSignature(raw,secret),signature);}
function signForward(raw,secret){return crypto.createHmac("sha256",secret).update(raw).digest("hex");}
module.exports={safeEqual,paystackSignature,verifyPaystack,signForward};
